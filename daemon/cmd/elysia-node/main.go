// Elysia Node — daemon exécuté sur chaque serveur physique hébergeant des
// conteneurs de jeu. Voir docs/architecture/01-global-architecture.md pour
// le rôle de ce composant dans l'ensemble d'Elysia Panel.
package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"

	"github.com/elysia-panel/elysia-node/internal/backupmgr"
	"github.com/elysia-panel/elysia-node/internal/config"
	"github.com/elysia-panel/elysia-node/internal/dockermgr"
	"github.com/elysia-panel/elysia-node/internal/filemgr"
	"github.com/elysia-panel/elysia-node/internal/grpcserver"
	"github.com/elysia-panel/elysia-node/internal/sftpserver"
	nodev1 "github.com/elysia-panel/elysia-node/proto"
)

func main() {
	cfg := config.Load()

	docker, err := dockermgr.New(cfg.DataDir, cfg.DockerNetwork)
	if err != nil {
		log.Fatalf("init docker manager: %v", err)
	}
	defer docker.Close()

	files := filemgr.New(cfg.DataDir)
	backups := backupmgr.New(cfg.DataDir, cfg.BackupsDir)

	grpcServer, err := newGRPCServer(cfg)
	if err != nil {
		log.Fatalf("init serveur gRPC: %v", err)
	}
	nodev1.RegisterNodeServiceServer(grpcServer, grpcserver.New(docker, files, backups))

	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", cfg.GRPCPort))
	if err != nil {
		log.Fatalf("écoute gRPC sur :%d: %v", cfg.GRPCPort, err)
	}

	go func() {
		log.Printf("Elysia Node: gRPC sur :%d (mTLS=%v)", cfg.GRPCPort, cfg.MTLSEnabled())
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("serveur gRPC: %v", err)
		}
	}()

	httpServer := &http.Server{
		Addr: fmt.Sprintf(":%d", cfg.APIPort),
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"ok","service":"elysia-node"}`))
		}),
	}
	go func() {
		log.Printf("Elysia Node: healthcheck HTTP sur :%d", cfg.APIPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("serveur HTTP: %v", err)
		}
	}()

	sftpCtx, cancelSFTP := context.WithCancel(context.Background())
	if cfg.NodeInternalSecret == "" {
		log.Println("ATTENTION: NODE_INTERNAL_SECRET absent — serveur SFTP désactivé (dev local uniquement)")
	} else {
		sftpSrv, err := sftpserver.New(sftpserver.Config{
			ListenAddr:       fmt.Sprintf(":%d", cfg.SFTPPort),
			HostKeyPath:      cfg.SFTPHostKeyPath,
			PanelInternalURL: cfg.PanelInternalURL,
			NodeSecret:       cfg.NodeInternalSecret,
		}, files)
		if err != nil {
			log.Fatalf("init serveur SFTP: %v", err)
		}
		go func() {
			log.Printf("Elysia Node: SFTP sur :%d", cfg.SFTPPort)
			if err := sftpSrv.Serve(sftpCtx); err != nil {
				log.Printf("serveur SFTP arrêté: %v", err)
			}
		}()
	}

	waitForShutdown()
	log.Println("Arrêt d'Elysia Node...")
	cancelSFTP()
	grpcServer.GracefulStop()
	_ = httpServer.Shutdown(context.Background())
}

func newGRPCServer(cfg *config.Config) (*grpc.Server, error) {
	if !cfg.MTLSEnabled() {
		log.Println("ATTENTION: mTLS désactivé (certificats non configurés) — à réserver au développement local")
		return grpc.NewServer(), nil
	}

	cert, err := tls.LoadX509KeyPair(cfg.MTLSCertPath, cfg.MTLSKeyPath)
	if err != nil {
		return nil, fmt.Errorf("chargement certificat node: %w", err)
	}

	caCert, err := os.ReadFile(cfg.MTLSCAPath)
	if err != nil {
		return nil, fmt.Errorf("lecture CA: %w", err)
	}
	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("CA invalide: %s", cfg.MTLSCAPath)
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		ClientCAs:    caPool,
		ClientAuth:   tls.RequireAndVerifyClientCert,
	}

	return grpc.NewServer(grpc.Creds(credentials.NewTLS(tlsConfig))), nil
}

func waitForShutdown() {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
}
