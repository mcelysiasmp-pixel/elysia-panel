# =============================================================================
# Elysia Panel — image générique (bots Discord, applications web, VPS léger)
# =============================================================================
# Exécute la commande de démarrage fournie par le client (variable
# STARTUP_COMMAND) dans un environnement Debian minimal avec les
# runtimes les plus courants préinstallés. Pour des besoins plus
# spécifiques, le client peut fournir sa propre image via le champ
# dockerImage du template (voir backend ServerTemplate).
# =============================================================================
FROM elysia/base:latest AS base

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv \
      nodejs npm \
      git \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

USER elysia
WORKDIR /data

ENV STARTUP_COMMAND='echo "Configurez STARTUP_COMMAND pour démarrer votre application"'

# ENTRYPOINT hérité de elysia/base (tini --). Elysia Node définit toujours
# explicitement la commande du conteneur (`/bin/sh -c <startupCommand>` du
# ServerTemplate) à la création ; le CMD ci-dessous n'est qu'un défaut utile
# pour tester cette image manuellement avec `docker run`.
CMD ["/bin/sh", "-c", "exec $STARTUP_COMMAND"]

LABEL org.opencontainers.image.title="elysia/generic" \
      io.elysia.image.kind="generic-docker" \
      io.elysia.image.supports="discord-bots,web-apps,custom"
