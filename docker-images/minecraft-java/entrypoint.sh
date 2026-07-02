#!/bin/bash
# =============================================================================
# Elysia Panel — entrypoint Minecraft Java
# Télécharge le bon serveur selon la variable TYPE et VERSION (défaut:
# "latest"), puis le lance. Variables d'environnement (fournies par le
# template + Elysia Node) :
#   EULA=TRUE|FALSE      acceptation obligatoire de l'EULA Mojang
#   TYPE=PAPER|PURPUR|FABRIC|QUILT|FORGE|NEOFORGE|VANILLA
#   VERSION=latest|1.21.1|...
#   MEMORY=2048          en Mo, utilisé pour -Xms/-Xmx
#   JAVA_VERSION=17|21|25
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

JAVA_BIN=$(find /usr/lib/jvm -maxdepth 3 -path "*/temurin-${JAVA_VERSION:-21}-jre-*/bin/java" 2>/dev/null | head -1)
if [ -z "$JAVA_BIN" ]; then
  echo "JAVA_VERSION=${JAVA_VERSION} indisponible, JRE installées: 17, 21, 25 — utilisation de java par défaut"
  JAVA_BIN="java"
fi

# LAUNCH_MODE déterminé par chaque fonction download_* :
#   JAR    -> lancement direct "$JAVA_BIN -jar server.jar"
#   SCRIPT -> lancement via un script généré par l'installeur (Forge/NeoForge
#             modernes, run.sh), qui invoque "java" depuis le PATH — on fait
#             donc pointer le PATH vers le JAVA_BIN choisi avant de l'exécuter.
LAUNCH_MODE="JAR"
LAUNCH_SCRIPT=""

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
  "$JAVA_BIN" -jar fabric-installer.jar server -mcversion "$mc_version" -downloadMinecraft
  mv fabric-server-launch.jar server.jar
  rm -f fabric-installer.jar
}

# Quilt réutilise le même mécanisme de lancement que Fabric (un jar de
# lancement unique) ; seul l'installeur diffère.
download_quilt() {
  local installer_url
  installer_url=$(curl -fsSL "https://meta.quiltmc.org/v3/versions/installer" | jq -r '.[0].url')
  local mc_version="$VERSION"
  if [ "$mc_version" = "latest" ]; then
    mc_version=$(curl -fsSL "https://meta.quiltmc.org/v3/versions/game" | jq -r '[.[] | select(.stable==true)][0].version')
  fi
  curl -fsSL -o quilt-installer.jar "$installer_url"
  "$JAVA_BIN" -jar quilt-installer.jar install server "$mc_version" --download-server --install-dir=.
  mv quilt-server-launch.jar server.jar
  rm -f quilt-installer.jar
}

# Forge (1.17+) : l'installeur --installServer génère un script run.sh qui
# invoque "java" via le PATH avec le bon classpath — c'est ce script qu'il
# faut exécuter, pas un jar unique. Résolution de version via
# promotions_slim.json (endpoint historique, toujours en service — vérifié
# en conditions réelles le 2026-07-02 ; le miroir maven.minecraftforge.net
# qui hébergeait aussi ce fichier a lui été retiré, seul
# files.minecraftforge.net le sert encore).
download_forge() {
  local promos
  promos=$(curl -fsSL -H "User-Agent: Mozilla/5.0 (compatible; ElysiaPanel/1.0)" \
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json")

  local mc_version="$VERSION"
  if [ "$mc_version" = "latest" ]; then
    mc_version=$(echo "$promos" | jq -r '.promos | keys[] | select(endswith("-recommended"))' \
      | sed 's/-recommended$//' | sort -V | tail -1)
  fi

  local forge_version
  forge_version=$(echo "$promos" | jq -r --arg k "${mc_version}-recommended" '.promos[$k] // empty')
  if [ -z "$forge_version" ]; then
    forge_version=$(echo "$promos" | jq -r --arg k "${mc_version}-latest" '.promos[$k] // empty')
  fi
  if [ -z "$forge_version" ]; then
    echo "Aucune version Forge trouvée pour Minecraft $mc_version"
    exit 1
  fi

  local full_version="${mc_version}-${forge_version}"
  curl -fsSL -o forge-installer.jar \
    "https://maven.minecraftforge.net/net/minecraftforge/forge/${full_version}/forge-${full_version}-installer.jar"
  "$JAVA_BIN" -jar forge-installer.jar --installServer
  rm -f forge-installer.jar forge-installer.jar.log

  if [ -f run.sh ]; then
    chmod +x run.sh
    LAUNCH_MODE="SCRIPT"
    LAUNCH_SCRIPT="run.sh"
    write_user_jvm_args
  else
    # Versions de Forge antérieures à 1.17 : jar universel unique.
    local universal
    universal=$(ls forge-*-universal.jar 2>/dev/null | head -1)
    if [ -z "$universal" ]; then
      echo "Installation Forge terminée mais ni run.sh ni jar universel trouvés"
      exit 1
    fi
    mv "$universal" server.jar
  fi
}

# NeoForge suit le même schéma d'installeur/run.sh que Forge moderne.
# Résolution de version : la première version du maven-metadata.xml dont le
# préfixe correspond à VERSION (les versions NeoForge omettent le "1."
# initial de la version Minecraft, ex: MC 1.21.1 -> NeoForge 21.1.x).
download_neoforge() {
  local mc_version="$VERSION"
  local metadata="https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml"

  local prefix
  if [ "$mc_version" = "latest" ]; then
    prefix=""
  else
    prefix=$(echo "$mc_version" | sed 's/^1\.//')
  fi

  local neoforge_version
  neoforge_version=$(curl -fsSL "$metadata" \
    | grep -oE '<version>[^<]+</version>' \
    | sed -E 's#</?version>##g' \
    | grep -v -- '-beta$' \
    | { [ -n "$prefix" ] && grep "^${prefix}" || cat; } \
    | sort -V | tail -1)

  if [ -z "$neoforge_version" ]; then
    echo "Aucune version NeoForge trouvée pour Minecraft $mc_version"
    exit 1
  fi

  curl -fsSL -o neoforge-installer.jar \
    "https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoforge_version}/neoforge-${neoforge_version}-installer.jar"
  "$JAVA_BIN" -jar neoforge-installer.jar --installServer
  rm -f neoforge-installer.jar neoforge-installer.jar.log

  if [ ! -f run.sh ]; then
    echo "Installation NeoForge terminée mais run.sh introuvable (version trop ancienne ?)"
    exit 1
  fi
  chmod +x run.sh
  LAUNCH_MODE="SCRIPT"
  LAUNCH_SCRIPT="run.sh"
  write_user_jvm_args
}

# Écrit les arguments mémoire dans user_jvm_args.txt, lu par run.sh
# (Forge/NeoForge modernes ne les acceptent pas en ligne de commande).
write_user_jvm_args() {
  echo "-Xms${MEMORY}M -Xmx${MEMORY}M" > user_jvm_args.txt
}

if [ ! -f server.jar ] && [ ! -f run.sh ]; then
  echo "Téléchargement du serveur ($TYPE $VERSION)..."
elif [ "${FORCE_REDOWNLOAD:-FALSE}" = "TRUE" ]; then
  echo "Re-téléchargement forcé du serveur ($TYPE $VERSION)..."
  rm -f server.jar run.sh user_jvm_args.txt
else
  # Déjà installé : redétecte simplement le mode de lancement.
  if [ -f run.sh ]; then
    LAUNCH_MODE="SCRIPT"
    LAUNCH_SCRIPT="run.sh"
    write_user_jvm_args
  fi
fi

if [ "$LAUNCH_MODE" = "JAR" ] && [ ! -f server.jar ] && [ ! -f run.sh ]; then
  case "$(echo "$TYPE" | tr '[:upper:]' '[:lower:]')" in
    paper) download_paper ;;
    purpur) download_purpur ;;
    fabric) download_fabric ;;
    quilt) download_quilt ;;
    forge) download_forge ;;
    neoforge) download_neoforge ;;
    vanilla) download_vanilla ;;
    *)
      echo "TYPE inconnu: $TYPE (attendu: PAPER, PURPUR, FABRIC, QUILT, FORGE, NEOFORGE, VANILLA)"
      exit 1
      ;;
  esac
fi

if [ "$LAUNCH_MODE" = "SCRIPT" ]; then
  export PATH="$(dirname "$JAVA_BIN"):$PATH"
  exec "./$LAUNCH_SCRIPT" nogui
else
  exec "$JAVA_BIN" -Xms"${MEMORY}"M -Xmx"${MEMORY}"M -jar server.jar nogui
fi
