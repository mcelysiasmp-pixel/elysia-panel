#!/bin/bash
# =============================================================================
# Elysia Panel — entrypoint Minecraft Bedrock
# Télécharge la dernière version officielle du serveur Bedrock dédié Linux
# via l'API publique Mojang (net-secondary.web.minecraft-services.net),
# vérifiée en conditions réelles lors de la construction de cette image.
# =============================================================================
set -euo pipefail
cd /data

if [ "${EULA:-FALSE}" != "TRUE" ]; then
  echo "EULA non acceptée (variable EULA=TRUE requise) — voir https://www.minecraft.net/eula"
  exit 1
fi

if [ ! -f bedrock_server ] || [ "${FORCE_REDOWNLOAD:-FALSE}" = "TRUE" ]; then
  echo "Résolution de l'URL de téléchargement Bedrock..."
  DOWNLOAD_URL=$(curl -fsSL "https://net-secondary.web.minecraft-services.net/api/v1.0/download/links" \
    -H "User-Agent: Mozilla/5.0 (compatible; ElysiaPanel/1.0)" \
    | jq -r '.result.links[] | select(.downloadType=="serverBedrockLinux") | .downloadUrl')

  if [ -z "$DOWNLOAD_URL" ]; then
    echo "Impossible de résoudre l'URL de téléchargement Bedrock (API Mojang a peut-être changé)"
    exit 1
  fi

  echo "Téléchargement: $DOWNLOAD_URL"
  # --http1.1 : le CDN minecraft.net renvoie parfois des erreurs de stream
  # HTTP/2 avec curl (observé en conditions réelles) ; --retry pour absorber
  # les échecs transitoires.
  curl -fsSL --http1.1 --retry 3 --retry-delay 2 -o bedrock-server.zip "$DOWNLOAD_URL" \
    -H "User-Agent: Mozilla/5.0 (compatible; ElysiaPanel/1.0)"
  unzip -o -q bedrock-server.zip -x "server.properties" "permissions.json" "allowlist.json"
  rm -f bedrock-server.zip
  chmod +x bedrock_server
fi

# server.properties est généré à partir des variables d'environnement si absent
if [ ! -f server.properties ]; then
  {
    echo "server-name=${SERVER_NAME:-Elysia Bedrock Server}"
    echo "gamemode=${GAMEMODE:-survival}"
    echo "difficulty=${DIFFICULTY:-easy}"
    echo "allow-cheats=${ALLOW_CHEATS:-false}"
    echo "max-players=${MAX_PLAYERS:-10}"
    echo "server-port=${SERVER_PORT:-19132}"
    echo "level-name=${LEVEL_NAME:-world}"
  } > server.properties
fi

export LD_LIBRARY_PATH=/data
exec ./bedrock_server
