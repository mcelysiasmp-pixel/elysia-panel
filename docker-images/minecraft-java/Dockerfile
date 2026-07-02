# =============================================================================
# Elysia Panel — Minecraft Java (Paper, Purpur, Fabric, Quilt, Forge,
# NeoForge, Vanilla)
# Chaque TYPE a sa fonction de téléchargement/installation dans
# entrypoint.sh. Forge/NeoForge génèrent un run.sh (lancé via ce script)
# plutôt qu'un jar unique — voir LAUNCH_MODE dans entrypoint.sh.
#
# Plusieurs JRE Eclipse Temurin sont installées (17/21/25) car les
# versions de Minecraft récentes exigent des versions de Java de plus en
# plus récentes (ex: Paper 26.x nécessite Java 25) alors que d'anciennes
# versions du jeu restent sur Java 17/21 — le bon binaire est sélectionné
# au démarrage via JAVA_VERSION.
# =============================================================================
FROM elysia/base:latest AS base

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      wget gnupg \
    && wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor -o /etc/apt/trusted.gpg.d/adoptium.gpg \
    && echo "deb https://packages.adoptium.net/artifactory/deb $(awk -F= '/^VERSION_CODENAME/{print $2}' /etc/os-release) main" > /etc/apt/sources.list.d/adoptium.list \
    && apt-get update && apt-get install -y --no-install-recommends \
      temurin-17-jre \
      temurin-21-jre \
      temurin-25-jre \
    && apt-get purge -y wget gnupg && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && chown elysia:elysia /usr/local/bin/entrypoint.sh

USER elysia
WORKDIR /data

ENV EULA=FALSE \
    TYPE=PAPER \
    VERSION=latest \
    JAVA_VERSION=21 \
    MEMORY=1024

EXPOSE 25565/tcp 25565/udp

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]

LABEL org.opencontainers.image.title="elysia/minecraft-java" \
      io.elysia.image.kind="minecraft-java" \
      io.elysia.image.supports="paper,purpur,fabric,quilt,forge,neoforge,vanilla"
