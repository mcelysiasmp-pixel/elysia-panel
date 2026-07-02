// Package backupmgr implémente les sauvegardes locales (tar.gz) du dossier
// de données d'un serveur. Les drivers distants (S3, Cloudflare R2,
// Backblaze B2, MinIO, SFTP, FTP) sont modélisés côté schéma/proto mais pas
// encore implémentés ici — voir la limitation documentée dans le README du
// daemon ; le point d'extension est BackupDriver ci-dessous.
package backupmgr

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type Manager struct {
	dataDir    string // racine des données serveurs, ex: /srv/elysia/servers
	backupsDir string // ex: /var/lib/elysia/backups
}

func New(dataDir, backupsDir string) *Manager {
	return &Manager{dataDir: dataDir, backupsDir: backupsDir}
}

type Result struct {
	LocalPath string
	SizeBytes int64
	Checksum  string
}

func (m *Manager) serverRoot(uuid string) string {
	return filepath.Join(m.dataDir, "servers", uuid)
}

func (m *Manager) backupPath(uuid, backupID string) string {
	return filepath.Join(m.backupsDir, uuid, backupID+".tar.gz")
}

// Create archive le dossier de données du serveur dans un fichier tar.gz
// local, nommé d'après backupID (identifiant généré côté Backend/DB).
func (m *Manager) Create(uuid, backupID string) (Result, error) {
	srcRoot := m.serverRoot(uuid)
	dstPath := m.backupPath(uuid, backupID)

	if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
		return Result{}, err
	}

	f, err := os.Create(dstPath)
	if err != nil {
		return Result{}, err
	}
	defer f.Close()

	hasher := sha256.New()
	multi := io.MultiWriter(f, hasher)
	gz := gzip.NewWriter(multi)
	tw := tar.NewWriter(gz)

	err = filepath.Walk(srcRoot, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relPath, err := filepath.Rel(srcRoot, path)
		if err != nil {
			return err
		}
		if relPath == "." {
			return nil
		}
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = filepath.ToSlash(relPath)
		if err := tw.WriteHeader(header); err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		src, err := os.Open(path)
		if err != nil {
			return err
		}
		defer src.Close()
		_, err = io.Copy(tw, src)
		return err
	})
	if err != nil {
		tw.Close()
		gz.Close()
		os.Remove(dstPath)
		return Result{}, fmt.Errorf("archivage: %w", err)
	}

	if err := tw.Close(); err != nil {
		return Result{}, err
	}
	if err := gz.Close(); err != nil {
		return Result{}, err
	}

	info, err := os.Stat(dstPath)
	if err != nil {
		return Result{}, err
	}

	return Result{
		LocalPath: dstPath,
		SizeBytes: info.Size(),
		Checksum:  hex.EncodeToString(hasher.Sum(nil)),
	}, nil
}

// Restore extrait l'archive tar.gz d'une sauvegarde par-dessus le dossier de
// données actuel du serveur (écrase les fichiers existants).
func (m *Manager) Restore(uuid, backupID string) error {
	srcPath := m.backupPath(uuid, backupID)
	dstRoot := m.serverRoot(uuid)

	f, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		target := filepath.Join(dstRoot, header.Name)
		if !strings.HasPrefix(target, dstRoot) {
			return fmt.Errorf("chemin d'archive invalide: %s", header.Name)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(out, tr); err != nil {
				out.Close()
				return err
			}
			out.Close()
		}
	}
	return nil
}

func (m *Manager) Delete(uuid, backupID string) error {
	return os.Remove(m.backupPath(uuid, backupID))
}
