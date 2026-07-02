#!/usr/bin/env bash
# =============================================================================
# Elysia Panel — installateur (étape 17)
#
# NE TOUCHE JAMAIS À PTERODACTYL : ce script ne lit, n'écrit, ne redémarre
# et ne configure aucun fichier appartenant à un panel Pterodactyl/Wings
# existant. Toute ressource qu'il crée est namespacée sous des chemins,
# ports, utilisateurs et noms de service propres à Elysia (voir le tableau
# de correspondance dans docs/architecture/01-global-architecture.md).
#
# Usage:
#   Installation one-liner (clone automatiquement le dépôt) :
#     bash <(curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/installer/install.sh)
#
#   Ou depuis un clone local :
#     sudo ./install.sh [--dry-run] [--domain panel.example.com] [--skip-ssl] [--skip-firewall]
#
# --dry-run       N'exécute aucune commande qui modifie l'état du système ;
#                 affiche uniquement ce qui serait fait. Utile pour vérifier
#                 le script sur une machine partagée avant de l'exécuter
#                 pour de vrai.
# --domain FQDN   Domaine du panel (défaut: elysia.local). Requis pour --ssl.
# --skip-ssl      Ne configure pas certbot/Let's Encrypt.
# --skip-firewall Ne touche pas à ufw.
# --ref REF       Branche/tag à cloner en mode one-liner (défaut: main).
# =============================================================================
set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration (namespace Elysia — voir .env.example à la racine du repo)
# -----------------------------------------------------------------------------
ELYSIA_GIT_REPO="https://github.com/mcelysiasmp-pixel/elysia-panel.git"
ELYSIA_GIT_REF="main"
ELYSIA_SRC_DIR="/usr/local/src/elysia-panel"

# Détecte si ce script tourne depuis un vrai clone (installer/install.sh au
# sein du repo) ou en mode "one-liner" (bash <(curl ...), où BASH_SOURCE[0]
# pointe vers une substitution de process du type /dev/fd/63 sans aucun
# fichier voisin). Dans le second cas, le dépôt complet est cloné avant de
# continuer, car le Backend/Dashboard/daemon ont besoin de leur code source
# pour être buildés — un seul fichier récupéré par curl ne suffit pas.
resolve_repo_dir() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"

  if [ -n "$script_dir" ] && [ -f "$script_dir/../backend/package.json" ]; then
    (cd "$script_dir/.." && pwd)
    return
  fi

  log "Mode one-liner détecté (script exécuté hors d'un clone local)." >&2
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] cloner $ELYSIA_GIT_REPO (réf: $ELYSIA_GIT_REF) dans $ELYSIA_SRC_DIR" >&2
    echo "$ELYSIA_SRC_DIR"
    return
  fi

  command -v git >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y --no-install-recommends git ca-certificates)

  if [ -d "$ELYSIA_SRC_DIR/.git" ]; then
    log "Dépôt déjà cloné dans $ELYSIA_SRC_DIR, mise à jour..." >&2
    git -C "$ELYSIA_SRC_DIR" fetch --depth 1 origin "$ELYSIA_GIT_REF" >&2
    git -C "$ELYSIA_SRC_DIR" checkout -q FETCH_HEAD >&2
  else
    log "Clonage de $ELYSIA_GIT_REPO (réf: $ELYSIA_GIT_REF) dans $ELYSIA_SRC_DIR..." >&2
    mkdir -p "$(dirname "$ELYSIA_SRC_DIR")"
    git clone --depth 1 --branch "$ELYSIA_GIT_REF" "$ELYSIA_GIT_REPO" "$ELYSIA_SRC_DIR" >&2
  fi
  echo "$ELYSIA_SRC_DIR"
}

ELYSIA_OPT_DIR="/opt/elysia"
ELYSIA_ETC_DIR="/etc/elysia"
ELYSIA_VAR_DIR="/var/lib/elysia"
ELYSIA_LOG_DIR="/var/log/elysia"
ELYSIA_SRV_DIR="/srv/elysia"
ELYSIA_USER="elysia"

ELYSIA_DOMAIN="elysia.local"
DRY_RUN=0
SKIP_SSL=0
SKIP_FIREWALL=0

# Ports Elysia (doivent rester synchronisés avec .env.example à la racine)
declare -A ELYSIA_PORTS=(
  [DASHBOARD_PORT]=9400
  [BACKEND_HTTP_PORT]=9401
  [BACKEND_WS_PORT]=9402
  [BACKEND_GRPC_PORT]=9403
  [NODE_API_PORT]=9500
  [NODE_GRPC_PORT]=9501
  [NODE_WS_PORT]=9502
  [NODE_SFTP_PORT]=9522
  [POSTGRES_PORT]=55432
  [REDIS_PORT]=63790
  [NGINX_HTTP_PORT]=9080
  [NGINX_HTTPS_PORT]=9443
  [PROMETHEUS_PORT]=9490
  [GRAFANA_PORT]=9491
)

# Ports connus de Pterodactyl/Wings — si l'un des ports Elysia ci-dessus
# venait un jour à coïncider avec l'un de ceux-ci, on refuse de continuer.
PTERODACTYL_PORTS=(80 443 8080 2022)

# -----------------------------------------------------------------------------
# Utilitaires
# -----------------------------------------------------------------------------
log()  { echo -e "\033[1;32m[elysia-installer]\033[0m $*"; }
warn() { echo -e "\033[1;33m[elysia-installer] ATTENTION:\033[0m $*" >&2; }
die()  { echo -e "\033[1;31m[elysia-installer] ERREUR:\033[0m $*" >&2; exit 1; }

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] $*"
  else
    # eval est volontaire: plusieurs appels passent des pipelines/redirections
    # ("curl ... | sh") qu'un simple "$@" n'interpréterait pas comme du shell.
    # shellcheck disable=SC2294
    eval "$@"
  fi
}

# -----------------------------------------------------------------------------
# Arguments
# -----------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --domain) ELYSIA_DOMAIN="$2"; shift ;;
    --skip-ssl) SKIP_SSL=1 ;;
    --skip-firewall) SKIP_FIREWALL=1 ;;
    --ref) ELYSIA_GIT_REF="$2"; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "Argument inconnu: $1" ;;
  esac
  shift
done

# Résolu seulement maintenant : dépend de --dry-run/--ref déjà parsés, et de
# log() déjà défini ci-dessus.
ELYSIA_REPO_DIR="$(resolve_repo_dir)"

# -----------------------------------------------------------------------------
# Étape 0 — Pré-vérifications
# -----------------------------------------------------------------------------
preflight() {
  log "Pré-vérifications..."

  if [ "$DRY_RUN" -eq 0 ] && [ "$(id -u)" -ne 0 ]; then
    die "Ce script doit être exécuté en root (sudo ./install.sh). Utilisez --dry-run pour simuler sans être root."
  fi

  if [ ! -f /etc/os-release ]; then
    die "Distribution non supportée (pas de /etc/os-release). Elysia supporte Debian/Ubuntu."
  fi
  # shellcheck source=/dev/null
  . /etc/os-release
  case "${ID:-}" in
    debian|ubuntu) log "OS détecté: ${PRETTY_NAME:-$ID}" ;;
    *) die "OS non supporté: ${ID:-inconnu}. Elysia supporte Debian et Ubuntu." ;;
  esac

  if [ -d /var/www/pterodactyl ] || systemctl list-unit-files 2>/dev/null | grep -qE '^(wings|pteroq)\.service'; then
    warn "Installation Pterodactyl détectée sur cette machine."
    warn "Elysia va s'installer à côté, sous ${ELYSIA_OPT_DIR}, ${ELYSIA_ETC_DIR}, ${ELYSIA_VAR_DIR} et ${ELYSIA_SRV_DIR},"
    warn "avec ses propres ports, réseau Docker, base de données et services systemd."
    warn "Aucun fichier Pterodactyl ne sera lu ni modifié par cet installateur."
  fi

  check_port_collisions
}

check_port_collisions() {
  log "Vérification des ports Elysia..."
  for name in "${!ELYSIA_PORTS[@]}"; do
    port="${ELYSIA_PORTS[$name]}"
    for ptero_port in "${PTERODACTYL_PORTS[@]}"; do
      [ "$port" -eq "$ptero_port" ] && die "Port $port ($name) entre en collision avec un port standard Pterodactyl/Wings ($ptero_port)."
    done
    if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE ":${port}\$"; then
      warn "Le port $port ($name) est déjà utilisé par un autre processus sur cette machine."
      warn "Vérifiez qu'il ne s'agit pas d'un service tiers avant de continuer."
    fi
  done
}

# -----------------------------------------------------------------------------
# Étape 1 — Dépendances système
# -----------------------------------------------------------------------------
install_dependencies() {
  log "Installation des dépendances système (curl, gnupg, git, build-essential)..."
  run "apt-get update -qq"
  run "apt-get install -y --no-install-recommends curl gnupg ca-certificates git build-essential jq"

  if ! command -v docker >/dev/null 2>&1; then
    log "Installation de Docker Engine (script officiel get.docker.com)..."
    run "curl -fsSL https://get.docker.com | sh"
  else
    log "Docker déjà installé ($(docker --version 2>/dev/null || echo '?')), aucune action."
  fi

  if ! command -v node >/dev/null 2>&1; then
    log "Installation de Node.js 22 LTS (NodeSource)..."
    run "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -"
    run "apt-get install -y nodejs"
    run "corepack enable"
  else
    log "Node.js déjà installé ($(node -v 2>/dev/null || echo '?')), aucune action."
  fi

  if ! command -v go >/dev/null 2>&1; then
    log "Installation de Go 1.23 (nécessaire pour builder Elysia Node)..."
    run "curl -fsSL https://go.dev/dl/go1.23.4.linux-amd64.tar.gz -o /tmp/go.tar.gz"
    run "tar -C /usr/local -xzf /tmp/go.tar.gz"
    run "ln -sf /usr/local/go/bin/go /usr/local/bin/go"
  else
    log "Go déjà installé ($(go version 2>/dev/null || echo '?')), aucune action."
  fi
}

# -----------------------------------------------------------------------------
# Étape 2 — Utilisateur système et arborescence
# -----------------------------------------------------------------------------
setup_filesystem() {
  log "Création de l'utilisateur système et de l'arborescence Elysia..."

  if ! id "$ELYSIA_USER" >/dev/null 2>&1; then
    run "useradd --system --create-home --shell /usr/sbin/nologin --groups docker $ELYSIA_USER"
  else
    run "usermod -aG docker $ELYSIA_USER"
  fi

  for dir in "$ELYSIA_OPT_DIR" "$ELYSIA_ETC_DIR" "$ELYSIA_VAR_DIR" "$ELYSIA_LOG_DIR" "$ELYSIA_SRV_DIR" "$ELYSIA_ETC_DIR/certs"; do
    run "mkdir -p $dir"
    run "chown $ELYSIA_USER:$ELYSIA_USER $dir"
  done
}

# -----------------------------------------------------------------------------
# Étape 3 — Secrets (générés une seule fois, jamais régénérés au ré-exécution)
# -----------------------------------------------------------------------------
generate_secret() {
  openssl rand -hex 32
}

setup_secrets_and_env() {
  log "Génération des secrets (si absents)..."
  local env_file="$ELYSIA_ETC_DIR/backend.env"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] génèrerait/vérifierait $env_file"
    return
  fi

  if [ -f "$env_file" ]; then
    log "Fichier d'environnement existant détecté ($env_file), secrets conservés."
    return
  fi

  local pg_password jwt_access jwt_refresh redis_password
  pg_password=$(generate_secret)
  jwt_access=$(generate_secret)
  jwt_refresh=$(generate_secret)
  redis_password=$(generate_secret)

  cat > "$env_file" <<EOF
DATABASE_URL="postgresql://elysia:${pg_password}@127.0.0.1:${ELYSIA_PORTS[POSTGRES_PORT]}/elysia?schema=public"
REDIS_HOST=127.0.0.1
REDIS_PORT=${ELYSIA_PORTS[REDIS_PORT]}
REDIS_PASSWORD=${redis_password}
BACKEND_HTTP_PORT=${ELYSIA_PORTS[BACKEND_HTTP_PORT]}
BACKEND_WS_PORT=${ELYSIA_PORTS[BACKEND_WS_PORT]}
JWT_ACCESS_SECRET=${jwt_access}
JWT_REFRESH_SECRET=${jwt_refresh}
ELYSIA_ENV=production
DASHBOARD_URL=https://${ELYSIA_DOMAIN}
EOF
  chmod 600 "$env_file"
  chown "$ELYSIA_USER:$ELYSIA_USER" "$env_file"

  # Réutilisés par docker-compose (Postgres/Redis) pour rester cohérents.
  cat > "$ELYSIA_ETC_DIR/infra.env" <<EOF
POSTGRES_DB=elysia
POSTGRES_USER=elysia
POSTGRES_PASSWORD=${pg_password}
POSTGRES_PORT=${ELYSIA_PORTS[POSTGRES_PORT]}
REDIS_PASSWORD=${redis_password}
REDIS_PORT=${ELYSIA_PORTS[REDIS_PORT]}
DOCKER_NETWORK_NAME=elysia-net
DOCKER_NETWORK_SUBNET=172.30.0.0/16
EOF
  chmod 600 "$ELYSIA_ETC_DIR/infra.env"
  log "Secrets générés dans $ELYSIA_ETC_DIR (chmod 600, appartiennent à $ELYSIA_USER)."
}

# -----------------------------------------------------------------------------
# Étape 4 — Infrastructure (PostgreSQL, Redis, monitoring) via Docker Compose
# -----------------------------------------------------------------------------
deploy_infra() {
  log "Déploiement de l'infrastructure Elysia (PostgreSQL, Redis, Prometheus, Grafana)..."
  run "docker compose -p elysia --env-file $ELYSIA_ETC_DIR/infra.env -f $ELYSIA_REPO_DIR/docker-compose.yml up -d postgres redis prometheus grafana"
}

# -----------------------------------------------------------------------------
# Étape 5 — Build & installation des composants applicatifs
# -----------------------------------------------------------------------------
build_backend() {
  log "Build du Backend NestJS..."
  run "cd $ELYSIA_REPO_DIR/backend && pnpm install --frozen-lockfile && pnpm run build"
  run "cd $ELYSIA_REPO_DIR/backend && DATABASE_URL=\$(grep DATABASE_URL $ELYSIA_ETC_DIR/backend.env | cut -d= -f2-) pnpm exec prisma migrate deploy"
  run "cd $ELYSIA_REPO_DIR/backend && DATABASE_URL=\$(grep DATABASE_URL $ELYSIA_ETC_DIR/backend.env | cut -d= -f2-) pnpm exec ts-node prisma/seed.ts"
  run "rsync -a --delete $ELYSIA_REPO_DIR/backend/dist $ELYSIA_REPO_DIR/backend/node_modules $ELYSIA_REPO_DIR/backend/prisma $ELYSIA_OPT_DIR/backend/"
  run "chown -R $ELYSIA_USER:$ELYSIA_USER $ELYSIA_OPT_DIR/backend"
}

build_daemon() {
  log "Build d'Elysia Node (Go)..."
  run "cd $ELYSIA_REPO_DIR/daemon && go build -o elysia-node ./cmd/elysia-node"
  run "mkdir -p $ELYSIA_OPT_DIR/daemon"
  run "cp $ELYSIA_REPO_DIR/daemon/elysia-node $ELYSIA_OPT_DIR/daemon/elysia-node"
  run "chown -R $ELYSIA_USER:$ELYSIA_USER $ELYSIA_OPT_DIR/daemon"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] écrirait $ELYSIA_ETC_DIR/node.env"
  else
    cat > "$ELYSIA_ETC_DIR/node.env" <<EOF
NODE_API_PORT=${ELYSIA_PORTS[NODE_API_PORT]}
NODE_GRPC_PORT=${ELYSIA_PORTS[NODE_GRPC_PORT]}
ELYSIA_RUNTIME_DIR=${ELYSIA_SRV_DIR}
ELYSIA_BACKUPS_DIR=${ELYSIA_VAR_DIR}/backups
DOCKER_NETWORK_NAME=elysia-net
NODE_MTLS_CERT=${ELYSIA_ETC_DIR}/certs/node.crt
NODE_MTLS_KEY=${ELYSIA_ETC_DIR}/certs/node.key
NODE_MTLS_CA=${ELYSIA_ETC_DIR}/certs/ca.crt
EOF
    chmod 600 "$ELYSIA_ETC_DIR/node.env"
  fi
}

build_dashboard() {
  log "Build du Dashboard Next.js..."
  run "cd $ELYSIA_REPO_DIR/dashboard && pnpm install --frozen-lockfile && pnpm run build"
  run "rsync -a --delete $ELYSIA_REPO_DIR/dashboard/.next $ELYSIA_REPO_DIR/dashboard/node_modules $ELYSIA_REPO_DIR/dashboard/public $ELYSIA_REPO_DIR/dashboard/package.json $ELYSIA_OPT_DIR/dashboard/"
  run "chown -R $ELYSIA_USER:$ELYSIA_USER $ELYSIA_OPT_DIR/dashboard"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] écrirait $ELYSIA_ETC_DIR/dashboard.env"
  else
    cat > "$ELYSIA_ETC_DIR/dashboard.env" <<EOF
NEXT_PUBLIC_API_URL=https://${ELYSIA_DOMAIN}/api
NEXT_PUBLIC_WS_URL=https://${ELYSIA_DOMAIN}
EOF
  fi
}

# -----------------------------------------------------------------------------
# Étape 6 — Certificats mTLS internes (Backend <-> Elysia Node)
# -----------------------------------------------------------------------------
generate_mtls_ca() {
  local cert_dir="$ELYSIA_ETC_DIR/certs"
  if [ -f "$cert_dir/ca.crt" ]; then
    log "CA interne déjà générée, conservée."
    return
  fi
  log "Génération de la CA interne pour le mTLS Backend<->Elysia Node..."
  run "mkdir -p $cert_dir"
  run "openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
        -keyout $cert_dir/ca.key -out $cert_dir/ca.crt \
        -subj '/O=Elysia Panel/CN=Elysia Internal CA'"
  run "openssl req -newkey rsa:4096 -nodes -keyout $cert_dir/node.key \
        -out $cert_dir/node.csr -subj '/O=Elysia Panel/CN=elysia-node'"
  run "openssl x509 -req -in $cert_dir/node.csr -CA $cert_dir/ca.crt -CAkey $cert_dir/ca.key \
        -CAcreateserial -out $cert_dir/node.crt -days 3650 -sha256"
  run "chown -R $ELYSIA_USER:$ELYSIA_USER $cert_dir && chmod 700 $cert_dir"
}

# -----------------------------------------------------------------------------
# Étape 7 — systemd
# -----------------------------------------------------------------------------
install_systemd_units() {
  log "Installation des services systemd Elysia..."
  for unit in elysia-backend elysia-node elysia-dashboard; do
    run "cp $ELYSIA_REPO_DIR/installer/templates/$unit.service /etc/systemd/system/$unit.service"
  done
  run "systemctl daemon-reload"
  for unit in elysia-backend elysia-node elysia-dashboard; do
    run "systemctl enable --now $unit.service"
  done
}

# -----------------------------------------------------------------------------
# Étape 8 — nginx (vhost dédié, ports non-standard)
# -----------------------------------------------------------------------------
configure_nginx() {
  if ! command -v nginx >/dev/null 2>&1; then
    log "Installation de nginx..."
    run "apt-get install -y nginx"
  else
    log "nginx déjà installé — seul un nouveau fichier de site sera ajouté, aucune config existante ne sera modifiée."
  fi

  log "Déploiement du vhost Elysia (ports ${ELYSIA_PORTS[NGINX_HTTP_PORT]}/${ELYSIA_PORTS[NGINX_HTTPS_PORT]}, jamais 80/443)..."
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] écrirait /etc/nginx/sites-available/elysia.conf (rendu depuis nginx-elysia.conf.template)"
  else
    # Guillemets simples volontaires : envsubst attend la liste littérale des
    # noms de variables à substituer, pas une expansion par le shell courant.
    # shellcheck disable=SC2016
    BACKEND_HTTP_PORT="${ELYSIA_PORTS[BACKEND_HTTP_PORT]}" \
    NGINX_HTTP_PORT="${ELYSIA_PORTS[NGINX_HTTP_PORT]}" \
    ELYSIA_DOMAIN="$ELYSIA_DOMAIN" \
      envsubst '${BACKEND_HTTP_PORT} ${NGINX_HTTP_PORT} ${ELYSIA_DOMAIN}' \
      < "$ELYSIA_REPO_DIR/installer/templates/nginx-elysia.conf.template" \
      > /etc/nginx/sites-available/elysia.conf
  fi
  run "ln -sf /etc/nginx/sites-available/elysia.conf /etc/nginx/sites-enabled/elysia.conf"
  run "nginx -t"
  run "systemctl reload nginx"

  if [ "$SKIP_SSL" -eq 0 ] && [ "$ELYSIA_DOMAIN" != "elysia.local" ]; then
    log "Configuration SSL via certbot pour $ELYSIA_DOMAIN..."
    run "apt-get install -y certbot python3-certbot-nginx"
    run "certbot --nginx -d $ELYSIA_DOMAIN --non-interactive --agree-tos -m admin@$ELYSIA_DOMAIN || true"
  else
    log "SSL ignoré (--skip-ssl ou domaine local par défaut)."
  fi
}

# -----------------------------------------------------------------------------
# Étape 9 — Pare-feu (ufw), n'autorise que les ports Elysia réellement
# exposés publiquement (nginx). Les ports internes (gRPC, Postgres, Redis)
# ne sont jamais ouverts vers l'extérieur.
# -----------------------------------------------------------------------------
configure_firewall() {
  if [ "$SKIP_FIREWALL" -eq 1 ]; then
    log "Configuration du pare-feu ignorée (--skip-firewall)."
    return
  fi
  if ! command -v ufw >/dev/null 2>&1; then
    warn "ufw non installé, configuration du pare-feu ignorée. Assurez-vous que seuls ${ELYSIA_PORTS[NGINX_HTTP_PORT]}/${ELYSIA_PORTS[NGINX_HTTPS_PORT]} sont exposés publiquement."
    return
  fi
  log "Configuration du pare-feu (ufw)..."
  run "ufw allow ${ELYSIA_PORTS[NGINX_HTTP_PORT]}/tcp comment 'Elysia HTTP'"
  run "ufw allow ${ELYSIA_PORTS[NGINX_HTTPS_PORT]}/tcp comment 'Elysia HTTPS'"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
  log "Elysia Panel — installation ($([ "$DRY_RUN" -eq 1 ] && echo 'DRY-RUN' || echo 'réelle'))"
  preflight
  install_dependencies
  setup_filesystem
  setup_secrets_and_env
  deploy_infra
  build_backend
  build_daemon
  build_dashboard
  generate_mtls_ca
  install_systemd_units
  configure_nginx
  configure_firewall

  log "Installation terminée."
  log "Panel accessible sur https://${ELYSIA_DOMAIN}:${ELYSIA_PORTS[NGINX_HTTPS_PORT]} (ou http://${ELYSIA_DOMAIN}:${ELYSIA_PORTS[NGINX_HTTP_PORT]} sans SSL)."
  log "Logs: journalctl -u elysia-backend -u elysia-node -u elysia-dashboard -f"
}

main
