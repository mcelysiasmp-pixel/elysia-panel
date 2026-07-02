#!/bin/bash
# =============================================================================
# Elysia Panel — entrypoint Minecraft Java
# Télécharge le bon jar serveur selon la variable TYPE (PAPER, PURPUR,
# FABRIC, VANILLA) et VERSION (défaut: "latest"), puis lance le serveur.
# Variables d'environnement (fournies par le template + Elysia Node) :
#   EULA=TRUE|FALSE      acceptation obligatoire de l'EULA Mojang
#   TYPE=PAPER|PURPUR|FABRIC|VANILLA
#   VERSION=latest|1.21.1|...
#   MEMORY=2048          en Mo, utilisé pour -Xms/-Xmx
# =============================================================================
set -euo pipefail

cd /data

if [ "${EULA:-FALSE}" != "TRUE" ]; then
  echo "EULA non acceptée (variable EULA=TRUE requise) — voir https://www.minecraft.net/eula"
  exit 1
fi
echo "eula=true" > eula.txt

TYPE="${TYPE:-PAPER}"
VERSION="${VERSION:-latest}"
MEMORY="${MEMORY:-1024}"

download_purpur() {
  local api_base="https://api.purpurmc.org/v2/purpur"
  local version="$VERSION"
  if [ "$version" = "latest" ]; then
    version=$(curl -fsSL "$api_base" | jq -r '.metadata.current')
  fi
  local build
  build=$(curl -fsSL "$api_base/$version" | jq -r '.builds.latest')
  curl -fsSL -o server.jar "$api_base/$version/$build/download"
}

# API PaperMC v3, hébergée sur fill.papermc.io (l'ancienne v2 sur
# api.papermc.io a été mise hors service — vérifié en conditions réelles
# lors de la construction de cette image, le 2026-07-02).
download_paper() {
  local api_base="https://fill.papermc.io/v3/projects/paper"
  local version="$VERSION"
  if [ "$version" = "latest" ]; then
    version=$(curl -fsSL "$api_base" | jq -r '.versions | to_entries[0].value[0]')
  fi
  local url
  url=$(curl -fsSL "$api_base/versions/$version/builds/latest" | jq -r '.downloads."server:default".url')
  curl -fsSL -o server.jar "$url"
}

download_vanilla() {
  local manifest="https://launchermeta.mojang.com/mc/game/version_manifest.json"
  local version="$VERSION"
  if [ "$version" = "latest" ]; then
    version=$(curl -fsSL "$manifest" | jq -r '.latest.release')
  fi
  local version_url
  version_url=$(curl -fsSL "$manifest" | jq -r --arg v "$version" '.versions[] | select(.id==$v) | .url')
  local server_url
  server_url=$(curl -fsSL "$version_url" | jq -r '.downloads.server.url')
  curl -fsSL -o server.jar "$server_url"
}

download_fabric() {
  local installer_version
  installer_version=$(curl -fsSL "https://meta.fabricmc.net/v2/versions/installer" | jq -r '.[0].version')
  local mc_version="$VERSION"
  if [ "$mc_version" = "latest" ]; then
    mc_version=$(curl -fsSL "https://meta.fabricmc.net/v2/versions/game" | jq -r '[.[] | select(.stable==true)][0].version')
  fi
  curl -fsSL -o fabric-installer.jar \
    "https://maven.fabricmc.net/net/fabricmc/fabric-installer/${installer_version}/fabric-installer-${installer_version}.jar"
  java -jar fabric-installer.jar server -mcversion "$mc_version" -downloadMinecraft
  mv fabric-server-launch.jar server.jar
}

if [ ! -f server.jar ] || [ "${FORCE_REDOWNLOAD:-FALSE}" = "TRUE" ]; then
  echo "Téléchargement du serveur ($TYPE $VERSION)..."
  case "$(echo "$TYPE" | tr '[:upper:]' '[:lower:]')" in
    paper) download_paper ;;
    purpur) download_purpur ;;
    fabric) download_fabric ;;
    vanilla) download_vanilla ;;
    *)
      echo "TYPE inconnu: $TYPE (attendu: PAPER, PURPUR, FABRIC, VANILLA)"
      exit 1
      ;;
  esac
fi

JAVA_BIN=$(ls -d /usr/lib/jvm/temurin-"${JAVA_VERSION:-21}"-jre-*/bin/java 2>/dev/null | head -1)
if [ -z "$JAVA_BIN" ]; then
  echo "JAVA_VERSION=${JAVA_VERSION} indisponible, JRE installées: 17, 21, 25 — utilisation de java par défaut"
  JAVA_BIN="java"
fi

exec "$JAVA_BIN" -Xms"${MEMORY}"M -Xmx"${MEMORY}"M -jar server.jar nogui
