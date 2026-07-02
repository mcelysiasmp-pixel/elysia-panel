# Elysia Panel

Panel d'hébergement open source, indépendant de Pterodactyl, pour héberger
Minecraft (Java/Bedrock et tout l'écosystème : Paper, Spigot, Purpur, Fabric,
Forge, NeoForge, Quilt, Velocity, BungeeCord, Waterfall, Geyser/Floodgate),
des bots Discord, des applications Docker génériques, du web hosting, des
VPS, et des jeux comme FiveM, Rust, ARK, CS2, Palworld.

> ⚠️ Contrainte de conception : Elysia doit pouvoir tourner **sur la même
> machine** qu'un panel Pterodactyl existant sans jamais le lire, l'écrire,
> l'appeler ou entrer en collision avec lui (ports, réseaux Docker, base de
> données, chemins, services systemd). Voir
> [`docs/architecture/01-global-architecture.md`](docs/architecture/01-global-architecture.md)
> §1 pour le tableau de correspondance des ressources.

## Structure du monorepo

```
elysia-panel/
├── dashboard/       Next.js / React / TypeScript / Tailwind / ShadCN
├── backend/         NestJS / TypeScript — API REST + WebSocket + gRPC client
├── daemon/          Elysia Node — daemon Go (Docker, fichiers, backups, métriques)
├── installer/       install.sh et scripts de provisioning (n'affecte jamais Pterodactyl)
├── docker-images/   Images Docker des runtimes de jeu (Minecraft, générique, ...)
├── sdk/             SDK générés : typescript/, go/, python/
├── docs/            Documentation d'architecture et API
├── monitoring/      Config Prometheus + dashboards Grafana
├── extensions/      Extensions du panel (plugins backend/dashboard)
├── themes/          Thèmes du dashboard
├── marketplace/      Marketplace (plugins, templates, images Docker, thèmes)
├── billing/         Module de facturation (produits, abonnements, paiements)
├── api/             Spécification OpenAPI partagée
└── cli/             CLI d'administration Elysia
```

## Méthode de développement

Le projet est construit étape par étape, chaque étape produisant un document
d'architecture dans `docs/architecture/` avant le code correspondant :

1. ✅ Architecture globale — `docs/architecture/01-global-architecture.md`
2. 🔜 Structure des dossiers (squelette de base déjà en place)
3. ⏳ Schéma PostgreSQL
4. ⏳ Backend NestJS
5. ⏳ Daemon Go (Elysia Node)
6. ⏳ Frontend Next.js
7. ⏳ Docker (images, orchestration des conteneurs de jeu)
8. ⏳ Intégration Modrinth
9. ⏳ Intégration CurseForge
10. ⏳ Installation de modpacks (FTB, Technic, ATLauncher, Prism/MultiMC)
11. ⏳ Panel admin
12. ⏳ Panel client
13. ⏳ Facturation
14. ⏳ Marketplace
15. ⏳ Monitoring
16. ⏳ Sécurité (durcissement, audit)
17. ⏳ Installateur (`install.sh`)

## Démarrage rapide (infrastructure de dev)

```bash
cp .env.example .env
docker compose -p elysia --env-file .env up -d postgres redis
```

Ceci ne démarre que l'infrastructure propre à Elysia (PostgreSQL, Redis,
monitoring) — jamais les services Pterodactyl.

## Licence

MIT — code source original, aucune dépendance sur le code de Pterodactyl.
