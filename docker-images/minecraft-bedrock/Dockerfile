# =============================================================================
# Elysia Panel — Minecraft Bedrock (serveur dédié officiel)
# =============================================================================
FROM elysia/base:latest AS base

USER root
# libcurl4 requis par bedrock_server (lié dynamiquement)
RUN apt-get update && apt-get install -y --no-install-recommends \
      libcurl4 \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && chown elysia:elysia /usr/local/bin/entrypoint.sh

USER elysia
WORKDIR /data

ENV EULA=FALSE \
    SERVER_NAME="Elysia Bedrock Server" \
    GAMEMODE=survival \
    DIFFICULTY=easy \
    MAX_PLAYERS=10 \
    SERVER_PORT=19132

EXPOSE 19132/udp 19133/udp

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]

LABEL org.opencontainers.image.title="elysia/minecraft-bedrock" \
      io.elysia.image.kind="minecraft-bedrock"
