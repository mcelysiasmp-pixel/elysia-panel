package backupmgr

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// RemoteConfig décrit la connexion à un stockage compatible S3 (AWS S3,
// Cloudflare R2, Backblaze B2, MinIO — tous exposent la même API S3, un
// seul client suffit pour les quatre drivers du schéma).
type RemoteConfig struct {
	Endpoint  string // ex: s3.amazonaws.com, <account>.r2.cloudflarestorage.com, s3.<region>.backblazeb2.com
	Bucket    string
	AccessKey string
	SecretKey string
	UseSSL    bool
	Region    string
}

// RemoteConfigFromMap construit une RemoteConfig à partir de la map
// driver_config transmise par le Backend (voir CreateBackupRequest.driver_config
// dans le proto).
func RemoteConfigFromMap(cfg map[string]string) (RemoteConfig, error) {
	rc := RemoteConfig{
		Endpoint:  cfg["endpoint"],
		Bucket:    cfg["bucket"],
		AccessKey: cfg["access_key"],
		SecretKey: cfg["secret_key"],
		Region:    cfg["region"],
	}
	if rc.Endpoint == "" || rc.Bucket == "" || rc.AccessKey == "" || rc.SecretKey == "" {
		return rc, fmt.Errorf("driver_config incomplet: endpoint, bucket, access_key et secret_key sont requis")
	}
	if v, err := strconv.ParseBool(cfg["use_ssl"]); err == nil {
		rc.UseSSL = v
	} else {
		rc.UseSSL = true // par défaut, TLS (tous les fournisseurs cloud l'exigent)
	}
	return rc, nil
}

func newMinioClient(cfg RemoteConfig) (*minio.Client, error) {
	return minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
}

func remoteObjectKey(uuid, backupID string) string {
	return fmt.Sprintf("%s/%s.tar.gz", uuid, backupID)
}

// CreateRemote archive localement (réutilise Create) puis envoie l'archive
// vers le bucket S3-compatible, avant de supprimer la copie locale.
func (m *Manager) CreateRemote(ctx context.Context, uuid, backupID string, cfg RemoteConfig) (Result, error) {
	local, err := m.Create(uuid, backupID)
	if err != nil {
		return Result{}, err
	}

	client, err := newMinioClient(cfg)
	if err != nil {
		os.Remove(local.LocalPath)
		return Result{}, fmt.Errorf("client S3: %w", err)
	}

	key := remoteObjectKey(uuid, backupID)
	_, err = client.FPutObject(ctx, cfg.Bucket, key, local.LocalPath, minio.PutObjectOptions{
		ContentType: "application/gzip",
	})
	os.Remove(local.LocalPath)
	if err != nil {
		return Result{}, fmt.Errorf("upload vers %s/%s: %w", cfg.Bucket, key, err)
	}

	return Result{LocalPath: key, SizeBytes: local.SizeBytes, Checksum: local.Checksum}, nil
}

// RestoreRemote télécharge l'archive depuis le bucket puis réutilise Restore.
func (m *Manager) RestoreRemote(ctx context.Context, uuid, backupID, remotePath string, cfg RemoteConfig) error {
	client, err := newMinioClient(cfg)
	if err != nil {
		return fmt.Errorf("client S3: %w", err)
	}

	key := remotePath
	if key == "" {
		key = remoteObjectKey(uuid, backupID)
	}

	localPath := m.backupPath(uuid, backupID)
	if err := os.MkdirAll(filepath.Dir(localPath), 0o755); err != nil {
		return err
	}
	if err := client.FGetObject(ctx, cfg.Bucket, key, localPath, minio.GetObjectOptions{}); err != nil {
		return fmt.Errorf("téléchargement de %s/%s: %w", cfg.Bucket, key, err)
	}
	defer os.Remove(localPath)

	return m.Restore(uuid, backupID)
}

// DeleteRemote supprime l'objet du bucket S3-compatible.
func (m *Manager) DeleteRemote(ctx context.Context, uuid, backupID, remotePath string, cfg RemoteConfig) error {
	client, err := newMinioClient(cfg)
	if err != nil {
		return fmt.Errorf("client S3: %w", err)
	}
	key := remotePath
	if key == "" {
		key = remoteObjectKey(uuid, backupID)
	}
	return client.RemoveObject(ctx, cfg.Bucket, key, minio.RemoveObjectOptions{})
}
