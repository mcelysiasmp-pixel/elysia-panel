# Elysia Node

Daemon Go exécuté sur chaque serveur physique/VM hébergeant des conteneurs
de jeu. Implémente le contrat gRPC défini dans
[`api/openapi/elysia.proto`](../api/openapi/elysia.proto), appelé par le
Backend NestJS (voir `backend/src/grpc-client/node-client.service.ts`).

## Structure

```
cmd/elysia-node/       point d'entrée (main.go)
internal/config/       chargement de la configuration (variables d'env)
internal/dockermgr/    cycle de vie des conteneurs Docker, réseaux par serveur, stats, logs, stdin
internal/filemgr/      opérations fichiers bornées au dossier du serveur (anti path-traversal)
internal/backupmgr/    sauvegardes locales tar.gz (sha256)
internal/grpcserver/   implémentation du service gRPC NodeService
proto/                 code généré par protoc à partir de api/openapi/elysia.proto
```

## Régénérer le code gRPC

```bash
protoc \
  --go_out=proto --go_opt=paths=source_relative \
  --go-grpc_out=proto --go-grpc_opt=paths=source_relative \
  -I ../api/openapi ../api/openapi/elysia.proto
```

## Build & run (dev)

```bash
go build -o elysia-node ./cmd/elysia-node
ELYSIA_RUNTIME_DIR=/srv/elysia \
ELYSIA_BACKUPS_DIR=/var/lib/elysia/backups \
NODE_API_PORT=9500 NODE_GRPC_PORT=9501 \
./elysia-node
```

Sans `NODE_MTLS_CERT`/`NODE_MTLS_KEY`/`NODE_MTLS_CA`, le serveur gRPC démarre
en clair (dev uniquement). En production, l'installateur (étape 17) génère
une CA interne et un certificat par node.

Validé de bout en bout (build réel + `go vet` + appels gRPC réels contre le
moteur Docker local) : création de conteneur avec réseau Docker isolé par
serveur, démarrage, streaming des logs, envoi de commande via stdin,
streaming de métriques CPU/RAM/réseau, opérations fichiers, sauvegarde
locale avec checksum, arrêt et suppression complète (conteneur + réseau).

## Limitations connues (non implémenté dans ce MVP)

- `ReinstallServer`, `CompressFiles`, `DecompressFile`, `TransferOut`,
  `TransferIn` : la méthode existe dans le contrat proto mais renvoie
  `Unimplemented` (satisfaite via `UnimplementedNodeServiceServer` embarqué).
  La migration de serveurs entre nodes (§5 de l'architecture) nécessite ces
  RPC de streaming de fichiers, à implémenter avant la mise en production
  du clustering.
- Sauvegardes distantes (S3, Cloudflare R2, Backblaze B2, MinIO, SFTP, FTP) :
  seul le driver `LOCAL` (tar.gz + sha256) est implémenté. Point
  d'extension : `internal/backupmgr`.
- `GetSystemStats` (métriques globales du node, hors conteneurs) : non
  implémenté, renvoie `Unimplemented`.
