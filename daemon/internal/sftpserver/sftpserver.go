// Package sftpserver expose un accès SFTP par serveur, façon Wings
// (Pterodactyl) : un seul process SSH pour tout le node, l'utilisateur se
// connecte avec "<compte>.<uuidServeurCourt>" et son mot de passe panel ;
// la session est ensuite chrootée sur le dossier de données de CE serveur
// via filemgr (voir docs/architecture pour la convention de nommage).
package sftpserver

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"

	"golang.org/x/crypto/ssh"

	"github.com/elysia-panel/elysia-node/internal/filemgr"
)

type Config struct {
	ListenAddr       string // ex: ":9522"
	HostKeyPath      string // ex: /etc/elysia/certs/sftp_host_ed25519
	PanelInternalURL string // ex: http://127.0.0.1:9401
	NodeSecret       string
}

type Server struct {
	cfg    Config
	files  *filemgr.Manager
	sshCfg *ssh.ServerConfig
}

func New(cfg Config, files *filemgr.Manager) (*Server, error) {
	signer, err := loadOrCreateHostKey(cfg.HostKeyPath)
	if err != nil {
		return nil, fmt.Errorf("clé hôte SFTP: %w", err)
	}

	s := &Server{cfg: cfg, files: files}
	sshCfg := &ssh.ServerConfig{PasswordCallback: s.passwordCallback}
	sshCfg.AddHostKey(signer)
	s.sshCfg = sshCfg
	return s, nil
}

func (s *Server) passwordCallback(conn ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
	result, err := s.authenticate(conn.User(), string(password))
	if err != nil {
		log.Printf("sftp: auth backend indisponible pour %q: %v", conn.User(), err)
		return nil, fmt.Errorf("service d'authentification indisponible")
	}
	if !result.Allowed {
		return nil, fmt.Errorf("identifiants invalides")
	}
	return &ssh.Permissions{
		Extensions: map[string]string{
			"server_uuid": result.ServerUUID,
			"read_only":   fmt.Sprintf("%v", result.ReadOnly),
		},
	}, nil
}

// Serve écoute et sert des connexions SFTP jusqu'à annulation du contexte.
func (s *Server) Serve(ctx context.Context) error {
	lis, err := net.Listen("tcp", s.cfg.ListenAddr)
	if err != nil {
		return fmt.Errorf("écoute SFTP sur %s: %w", s.cfg.ListenAddr, err)
	}
	go func() {
		<-ctx.Done()
		_ = lis.Close()
	}()

	for {
		conn, err := lis.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			log.Printf("sftp: accept: %v", err)
			continue
		}
		go s.handleConn(conn)
	}
}

func (s *Server) handleConn(nc net.Conn) {
	defer nc.Close()

	sconn, chans, reqs, err := ssh.NewServerConn(nc, s.sshCfg)
	if err != nil {
		log.Printf("sftp: handshake échoué depuis %s: %v", nc.RemoteAddr(), err)
		return
	}
	defer sconn.Close()
	go ssh.DiscardRequests(reqs)

	serverUUID := sconn.Permissions.Extensions["server_uuid"]
	readOnly := sconn.Permissions.Extensions["read_only"] == "true"

	for newChannel := range chans {
		if newChannel.ChannelType() != "session" {
			_ = newChannel.Reject(ssh.UnknownChannelType, "seules les sessions SFTP sont supportées")
			continue
		}
		channel, requests, err := newChannel.Accept()
		if err != nil {
			continue
		}
		go serveSession(channel, requests, s.files, serverUUID, readOnly)
	}
}

func serveSession(channel ssh.Channel, requests <-chan *ssh.Request, files *filemgr.Manager, serverUUID string, readOnly bool) {
	for req := range requests {
		isSFTP := req.Type == "subsystem" && len(req.Payload) >= 4 && string(req.Payload[4:]) == "sftp"
		if req.WantReply {
			_ = req.Reply(isSFTP, nil)
		}
		if !isSFTP {
			continue
		}

		reqServer := newRequestServer(channel, files, serverUUID, readOnly)
		_ = reqServer.Serve()
		_ = reqServer.Close()
		_ = channel.Close()
		return
	}
}

func loadOrCreateHostKey(path string) (ssh.Signer, error) {
	if data, err := os.ReadFile(path); err == nil {
		return ssh.ParsePrivateKey(data)
	}

	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	der, err := x509.MarshalPKCS8PrivateKey(priv)
	if err != nil {
		return nil, err
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})

	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return nil, err
		}
	}
	if err := os.WriteFile(path, pemBytes, 0o600); err != nil {
		return nil, err
	}
	return ssh.ParsePrivateKey(pemBytes)
}
