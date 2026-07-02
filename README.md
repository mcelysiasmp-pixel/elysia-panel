# Elysia Panel

## Installation en une commande

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/mcelysiasmp-pixel/elysia-panel/main/installer/install.sh) --domain panel.example.com
```

Ajoutez `--dry-run` pour voir ce que le script ferait sans rien exécuter.
Le script clone automatiquement ce dépôt, installe les dépendances (Docker,
Node.js, Go), déploie PostgreSQL/Redis, build et installe le Backend/le
daemon/le Dashboard, configure systemd + nginx + SSL, et ne touche jamais à
un Pterodactyl existant sur la même machine. Détails et options dans
[`installer/README.md`](installer/README.md).

Panel d'hébergement open source, indépendant de Pterodactyl, pour héberger
Minecraft (Java/Bedrock — Paper, Purpur, Fabric, Vanilla ; Forge/NeoForge/
Quilt via script d'installation par template), des bots Discord, des
applications Docker génériques, du web hosting, des VPS, et d'autres jeux
via des images Docker tierces (FiveM, Rust, ARK, CS2, Palworld, ...).

> ⚠️ Contrainte de conception : Elysia doit pouvoir tourner **sur la même
> machine** qu'un panel Pterodactyl existant sans jamais le lire, l'écrire,
> l'appeler ou entrer en collision avec lui (ports, réseaux Docker, base de
> données, chemins, services systemd). Voir
> [`docs/architecture/01-global-architecture.md`](docs/architecture/01-global-architecture.md)
> §1 pour le tableau de correspondance des ressources.

## Structure du monorepo

```
elysia-panel/
├── dashboard/       Next.js 16 / React 19 / TypeScript / Tailwind v4 / shadcn — panels admin + client
├── backend/         NestJS / TypeScript — API REST + WebSocket + client gRPC, 16 modules
├── daemon/          Elysia Node — daemon Go (Docker, fichiers, backups, métriques, gRPC/mTLS)
├── installer/       install.sh et unités systemd/nginx (n'affecte jamais Pterodactyl)
├── docker-images/   Images Docker des runtimes (base, minecraft-java, minecraft-bedrock, generic)
├── sdk/             SDK: typescript/, go/, python/ (chacun testé contre le Backend réel)
├── cli/             CLI d'administration Elysia (login, servers list/power)
├── docs/            Documentation d'architecture et de sécurité
├── monitoring/      Config Prometheus (scrape le Backend et Elysia Node)
├── extensions/      Réservé — système de plugins (non implémenté)
├── themes/          Réservé — thèmes tiers du dashboard (non implémenté)
├── marketplace/     Pointeur — implémenté comme module backend + page dashboard
├── billing/         Pointeur — implémenté comme module backend (Stripe)
└── api/openapi/     Contrat gRPC partagé Backend↔Elysia Node (elysia.proto)
```

## Méthode de développement

Le projet a été construit étape par étape, chaque étape validée par une
exécution réelle (build, tests contre une vraie base de données/Docker
Engine/backend démarré) plutôt qu'une simple relecture de code :

1. ✅ Architecture globale — `docs/architecture/01-global-architecture.md`
2. ✅ Structure des dossiers
3. ✅ Schéma PostgreSQL (24 tables, migré et seedé en réel)
4. ✅ Backend NestJS (auth, RBAC, serveurs, nodes, websocket, backups, mods, billing, marketplace, support, monitoring)
5. ✅ Daemon Go — Elysia Node (testé contre le moteur Docker réel)
6. ✅ Frontend Next.js (panels admin + client, build de production propre)
7. ✅ Docker (4 images, chacune buildée ET démarrée en conditions réelles)
8. ✅ Intégration Modrinth
9. ✅ Intégration CurseForge
10. ✅ Installation de modpacks (.mrpack Modrinth, manifest CurseForge/FTB/ATLauncher)
11. ✅ Panel admin
12. ✅ Panel client
13. ✅ Facturation (Stripe)
14. ✅ Marketplace
15. ✅ Monitoring (Prometheus + résumé JSON)
16. ✅ Sécurité — voir `docs/architecture/16-security.md` (2 IDOR trouvés et corrigés)
17. ✅ Installateur (`install.sh`, validé par shellcheck + dry-run réel)

Documentation détaillée par étape dans `docs/architecture/`.

## Démarrage rapide (développement)

```bash
cp .env.example .env
docker compose -p elysia --env-file .env up -d postgres redis

cd backend && cp .env.example .env && pnpm install
pnpm exec prisma migrate dev && pnpm exec ts-node prisma/seed.ts
pnpm run start:dev   # http://localhost:9401/api — docs sur /api/docs

cd ../dashboard && cp .env.local.example .env.local && pnpm install
pnpm run dev         # http://localhost:3000

cd ../daemon && go run ./cmd/elysia-node   # nécessite Docker
```

Ceci ne démarre que l'infrastructure propre à Elysia (PostgreSQL, Redis,
monitoring) — jamais les services Pterodactyl.

## Licence

MIT — code source original, aucune dépendance sur le code de Pterodactyl.
