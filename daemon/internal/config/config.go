package config

import (
	"os"
	"strconv"
)

// Config regroupe la configuration d'Elysia Node, entièrement pilotée par
// variables d'environnement (voir .env.example à la racine du monorepo).
type Config struct {
	APIPort       int
	GRPCPort      int
	DataDir       string // ex: /srv/elysia — chaque serveur a son sous-dossier <DataDir>/servers/<uuid>
	BackupsDir    string // ex: /var/lib/elysia/backups
	DockerNetwork string
	MTLSCertPath  string
	MTLSKeyPath   string
	MTLSCAPath    string
}

func Load() *Config {
	return &Config{
		APIPort:       envInt("NODE_API_PORT", 9500),
		GRPCPort:      envInt("NODE_GRPC_PORT", 9501),
		DataDir:       envStr("ELYSIA_RUNTIME_DIR", "/srv/elysia"),
		BackupsDir:    envStr("ELYSIA_BACKUPS_DIR", "/var/lib/elysia/backups"),
		DockerNetwork: envStr("DOCKER_NETWORK_NAME", "elysia-net"),
		MTLSCertPath:  envStr("NODE_MTLS_CERT", ""),
		MTLSKeyPath:   envStr("NODE_MTLS_KEY", ""),
		MTLSCAPath:    envStr("NODE_MTLS_CA", ""),
	}
}

// MTLSEnabled indique si les trois chemins de certificats sont fournis.
// Sans mTLS, le serveur gRPC démarre en clair — acceptable uniquement en
// développement local (voir installer/ pour la génération de la CA interne
// en production).
func (c *Config) MTLSEnabled() bool {
	return c.MTLSCertPath != "" && c.MTLSKeyPath != "" && c.MTLSCAPath != ""
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
