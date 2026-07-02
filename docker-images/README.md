# Images Docker Elysia (étape 7)

Chaque image hérite de `elysia/base` (Debian 12 slim + tini en PID 1 +
utilisateur non-root `elysia` uid/gid 1000). Elysia Node (`dockermgr.go`)
définit toujours explicitement `Cmd = ["/bin/sh", "-c", <startupCommand>]`
à la création du conteneur ; celui-ci est concaténé à l'`ENTRYPOINT` de
l'image. Le `CMD` déclaré dans chaque Dockerfile n'est donc qu'un défaut
pratique pour tester l'image manuellement avec `docker run`, jamais utilisé
en production par le panel.

| Image | Rôle | Runtime | Validée par |
|---|---|---|---|
| `base/` | Socle commun | Debian 12 + tini + gosu | Build |
| `minecraft-java/` | Paper, Purpur, Fabric, Quilt, Forge, NeoForge, Vanilla | Temurin 17/21/25 (sélection via `JAVA_VERSION`) | Build + démarrage réel d'un serveur Paper (dernière version, Minecraft 26.2) jusqu'à `Done` |
| `minecraft-bedrock/` | Serveur Bedrock officiel | binaire natif Mojang | Build + démarrage réel jusqu'à `Server started.` |
| `generic/` | Bots Discord, apps web, VPS léger | Python3, Node.js, git, build-essential | Build + exécution de `STARTUP_COMMAND` |

## Découvertes faites en construisant ces images (APIs ayant changé)

- **PaperMC** : l'API v2 (`api.papermc.io/v2`) a été mise hors service
  ("sunset"). La v3 vit désormais sur `fill.papermc.io` avec un schéma
  différent (`/v3/projects/paper`, `.versions` groupé par branche majeure,
  `/versions/{v}/builds/latest` pour le dernier build). `entrypoint.sh` a
  été écrit contre cette nouvelle API après vérification en direct.
- **Minecraft récent** : les versions "26.x" de Paper exigent Java 25.
  L'image installe donc plusieurs JRE Temurin (17/21/25) via le dépôt apt
  Adoptium plutôt qu'une seule version, avec sélection par `JAVA_VERSION`.
- **Téléchargement Bedrock** (`minecraft.net/bedrockdedicatedserver/...`) :
  retourne occasionnellement une erreur de stream HTTP/2 avec curl ; fix
  en forçant `--http1.1` et `--retry 3`.
- **PurpurMC** (`api.purpurmc.org/v2`) : API inchangée, toujours valide.

## Rebuild

```bash
docker build -t elysia/base:latest base/
docker build -t elysia/minecraft-java:latest minecraft-java/
docker build -t elysia/minecraft-bedrock:latest minecraft-bedrock/
docker build -t elysia/generic:latest generic/
```

## Limitations connues

- FiveM, Rust, Terraria, ARK, CS2, Palworld : pas d'image dédiée dans ce
  MVP — ces jeux tournent via `elysia/generic` avec une image Docker
  tierce fournie par l'utilisateur dans le champ `dockerImage` du
  template (mécanisme déjà supporté par le schéma `ServerTemplate`).
