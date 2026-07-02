# =============================================================================
# Elysia Panel — image de base pour tous les runtimes de jeu
# =============================================================================
# Fournit : un utilisateur non-root, tini comme PID 1 (reap des zombies,
# propagation correcte des signaux pour un arrêt propre des serveurs de
# jeu), et les outils système communs (curl, tar, unzip, ca-certificates).
FROM debian:12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      tini \
      curl \
      ca-certificates \
      tar \
      gzip \
      unzip \
      jq \
      gosu \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1000 elysia && useradd -u 1000 -g elysia -m -d /home/elysia elysia

WORKDIR /data
RUN chown elysia:elysia /data
VOLUME ["/data"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/bin/sh"]

LABEL org.opencontainers.image.title="elysia/base" \
      org.opencontainers.image.description="Image de base Elysia Panel (tini + utilisateur non-root)" \
      io.elysia.image.kind="base"
