# Reste à faire — Elysia Panel

État au 2026-07-02. Panel utilisé en self-hosted façon Pterodactyl (pas un
hébergeur revendant des serveurs — confirmé avec l'utilisateur, voir plus
bas). Deux vagues de travail cette session : (1) rattrapage des chantiers
dashboard priorisés avec l'utilisateur, (2) audit complet "qu'est-ce qui
manque pour un panel fini ?" + résolution de tout ce qui a pu l'être.

## Bug corrigé cette session

**Stats live serveur (WebSocket) : `stats:subscribe` plantait côté backend.**

- Cause racine trouvée en rejouant la méthode de test ci-dessous avec un
  try/catch temporaire dans `subscribeStats` : `TypeError: Cannot read
  properties of undefined (reading 'permissions')` dans
  `ServersService.findAccessibleOrThrow`. **Ce n'était pas un problème de
  sérialisation gRPC/protobuf** — `socket.data.user` était `undefined` au
  moment du handler.
- Vraie cause : race condition. `handleConnection` (interface
  `OnGatewayConnection`) est asynchrone (vérif JWT + lookup Prisma), mais
  NestJS ne bloque pas le dispatch des messages entrants le temps que cette
  promesse se résolve — un client qui émet un event juste après `connect`
  peut donc atteindre un `@SubscribeMessage` avant que `socket.data.user`
  soit renseigné.
- **Fix** : auth déplacée dans un middleware de namespace Socket.IO
  (`afterInit(server) { server.use((socket, next) => {...}) }` au lieu de
  `handleConnection`), qui fait partie du handshake — socket.io garantit
  qu'il est résolu avant `'connection'` et donc avant tout message. Voir
  `backend/src/websocket/console.gateway.ts`.
- Bug additionnel corrigé au passage dans `stats-panel.tsx` : le backend
  charge le proto avec `longs: String`, donc `memory_used_mb` arrive en
  **string** sur le WebSocket — `.toFixed()` plantait au premier
  `stats:update` reçu. Corrigé par `Number(...)` à la réception.

### Méthode pour retester en conditions réelles (backend↔daemon↔Docker)

1. `cd backend && pnpm run start:dev` (arrière-plan, attendre
   `Nest application successfully started`).
2. `cd daemon && NODE_API_PORT=9590 NODE_GRPC_PORT=9591 NODE_SFTP_PORT=9524
   ELYSIA_RUNTIME_DIR=/tmp/xxx/srv ELYSIA_BACKUPS_DIR=/tmp/xxx/backups
   DOCKER_NETWORK_NAME=elysia-net NODE_INTERNAL_SECRET=dev_test_node_internal_secret
   PANEL_INTERNAL_URL=http://127.0.0.1:9401
   NODE_SFTP_HOST_KEY=/tmp/xxx/certs/key go run ./cmd/elysia-node`
   (arrière-plan).
3. Créer user/node/template de test via un script `ts-node` Prisma
   ponctuel dans `backend/prisma/verify-*.ts` — **toujours supprimé après
   usage**, ne pas les laisser traîner dans le dépôt.
4. Passer le node `ONLINE` via `GET /nodes/:id/health` (sinon
   `POST /servers` échoue avec "Aucun node disponible").
5. `POST /servers` (créer), `POST /servers/:id/power/start` démarre un
   vrai conteneur Docker.
6. Reproduire les appels HTTP/WebSocket exacts que ferait le dashboard
   (`curl`, ou un script `socket.io-client` pour le temps réel).
7. **Nettoyer** après coup : conteneurs Docker (`docker rm -f`), réseaux
   Docker par-serveur (`elysia_srv_<uuid>`), lignes de test en base, et
   **tuer les vrais process** avec `pkill -9 -f "dist/src/main"` ET
   `pkill -9 -f "nest.js start"` (attention : `pkill -f "nest start"` ne
   matche PAS `nest.js start --watch` à cause du `.js` — piège rencontré
   plusieurs fois cette session, plusieurs backends fantômes en parallèle
   ont donné de faux résultats avant que ce soit compris).

## Vague 1 — chantiers dashboard priorisés avec l'utilisateur (tous faits)

1. `d1541ef` — Gestionnaire de fichiers (liste, navigation, upload, mkdir,
   édition, download, rename, delete).
2. `b58ca20` — **Bug important** : chemin vers `elysia.proto` mal calculé,
   cassait TOUT appel gRPC backend→daemon en dev comme en prod, invisible
   en typecheck/build. Corrigé + installateur mis à jour.
3. `b87d327` — Fix race condition `stats:subscribe` (détail ci-dessus) +
   stats live CPU/RAM dans le dashboard.
4. `95a884a` — Onglet Paramètres serveur (général/reinstall/allocations/
   sub-users) + nouvel endpoint `GET /users/lookup?email=` (accessible
   sans `users.read`, nécessaire pour qu'un client non-admin résolve
   l'email d'un ami en `userId` avant de l'ajouter comme sub-user).
5. `5968e71` — Détail + réponse ticket support (thread de messages, statut
   réservé à `support.reply`, page partagée client/staff).
6. `646f8b4` — Nodes : bouton delete + toggle maintenance refait en
   `useMutation` propre.
7. `f7be4c7` — Monitoring visualisé : meters colorés (CPU/RAM/Disque) +
   bar chart "serveurs par statut" (couleurs alignées sur
   `status-badge.tsx`, palette validée avec le skill dataviz). Pas de
   time-series : `/monitoring/summary` est un instantané ponctuel, les
   gauges Prometheus ne sont exposées qu'en scrape texte `/metrics` pour
   un Prometheus/Grafana externe.
8. `f5a7a68` — Bouton install marketplace, scope réduit aux items
   `PLUGIN` gratuits (les 4 autres types n'ont pas la même sémantique
   d'installation, et pas de paiement pour les items payants — voir
   "hors scope" plus bas). Réutilise `ModSource.MANUAL` (déjà dans
   l'enum, pas de migration) + le garde-fou SSRF `assertSafeDownloadUrl`.
9. `1b05917` — Admin roles/permissions (page `admin/roles`, assignation de
   rôle dans `admin/users`) + Scheduled tasks UI (nouvel onglet serveur,
   CRUD complet ; l'exécution différée elle-même —
   `ScheduledTasksService.execute` sur `@Cron(EVERY_MINUTE)` — n'a pas été
   modifiée, donc pas re-testée en conditions réelles, seul le CRUD est
   nouveau).

**Checkout billing (Stripe) : hors scope**, clarifié avec l'utilisateur
(2026-07-02) — le panel est auto-hébergé façon Pterodactyl, pas un
hébergeur revendant des serveurs à des clients. Le module `billing`
backend reste dans le code mais n'a pas besoin d'UI dashboard.

## Vague 2 — audit "panel fini ?" + résolution (tous faits)

Après la vague 1, l'utilisateur a demandé un audit de ce qui manquait
encore pour un panel "parfait". Un agent a passé le dépôt au crible
(endpoints backend jamais appelés côté dashboard, TODO, sécurité,
installateur, tests, lint). Résultat traité point par point :

1. `bd27134` — `eslint --fix` sur tout le backend (335 erreurs, 100%
   formatage, aucune logique) + fix d'un vrai bug React dans
   `stats-panel.tsx` (lecture d'un `useRef` pendant le render, signalé par
   `react-hooks/refs` — remplacé par un `useState`).
2. `57775d4` — Zone dangereuse serveur (suspendre/réactiver/supprimer dans
   `settings-panel.tsx`), gestion admin des comptes (créer/reset
   password/supprimer dans `admin/users`), nouvelle page "Mon compte"
   (changement de mot de passe self-service — nouvel endpoint
   `POST /auth/change-password`, n'existait pas du tout — et
   activation/désactivation 2FA avec QR code + codes de récupération).
   `AuthenticatedUser` a maintenant un champ `twoFactorEnabled`.
3. `fc4603f` — Feature complète de clés API (le modèle Prisma `ApiKey`
   existait, rien n'était branché). Nouveau module `api-keys/`, auth par
   clé via le même en-tête `Authorization: Bearer` que le JWT (distinguée
   par le préfixe `elysia_`), scopes jamais plus larges que les
   permissions de l'utilisateur — recalculé à *chaque requête*, pas figé à
   la création. UI dans la page compte.
4. (ce commit) — Marketplace admin (publier/vérifier un item, page
   `admin/marketplace`), modpacks en un clic exposés dans `mods-panel.tsx`
   (Modrinth `.mrpack` par URL, CurseForge/FTB/ATLauncher/MultiMC par
   upload de zip — le backend le faisait déjà, aucune UI n'existait),
   création de templates de serveur (`admin/templates` — sans le champ
   `isPublic` dans le formulaire : `GET /server-templates` filtre déjà
   `isPublic: true` en dur côté backend, un template créé non-public
   aurait disparu de cette même page juste après création), pagination
   "charger plus" sur les audit logs (`useInfiniteQuery`, au-delà des 100
   entrées fixes précédentes).

Tout testé en conditions réelles (backend + daemon + Docker), y compris :
cycle 2FA complet avec un vrai code TOTP calculé, tentative d'escalade de
privilège sur une clé API (403 confirmé), clé API révoquée qui échoue bien
(401), upload d'un modpack réel avec vérification du contenu écrit dans le
conteneur, template créé qui apparaît bien dans la liste consommée par le
dialog de création de serveur.

### Volontairement laissé de côté (voir décisions utilisateur)

- **Suite de tests automatisés** (0 test Jest/e2e backend au-delà du
  boilerplate cassé de `nest new`, 0 test dashboard, 0 test Go) — identifié
  par l'audit comme le plus gros chantier restant, mais pas demandé par
  l'utilisateur. Cohérent avec la méthodologie de toute la session
  (vérification manuelle en conditions réelles), mais aucun filet de
  non-régression pour l'avenir si le projet grossit encore.
- **UI OAuth (Discord/Google/GitHub)** — endpoints backend présents mais
  `OAUTH_*_CLIENT_ID` vides dans `.env` (non configuré). Pas de manque
  fonctionnel tant qu'aucune app OAuth n'a été créée côté fournisseur ;
  à ajouter si l'utilisateur active un provider un jour.
- **Flow "mot de passe oublié" par email** — demande de configurer un
  serveur SMTP (aucune infra mail dans le projet). Clarifié avec
  l'utilisateur (2026-07-02) : changement self-service suffit, un admin
  reste le recours en cas d'oubli (`reset-password`, déjà câblé en vague 2).

## Points de vigilance pour la suite

- **Toujours tester en conditions réelles** avant de considérer une
  fonctionnalité backend↔daemon terminée : plusieurs bugs cette session
  (chemin proto, race condition WebSocket) étaient invisibles en
  typecheck/build et existaient depuis longtemps malgré des mentions
  "validé en runtime" dans l'historique du projet.
- Pas d'outil de capture d'écran/navigateur dans cet environnement : toute
  vérification UI passe par tsc + `next build` + appels HTTP/WebSocket
  directs reproduisant ce que ferait le dashboard. Le dire explicitement
  plutôt que prétendre une vérification visuelle.
- Le dashboard tourne sur Next.js 16 avec des changements non standards
  (voir `dashboard/AGENTS.md`) — vérifier `node_modules/next/dist/docs/`
  avant tout code touchant à des APIs Next.js peu familières. Le pattern
  actuel est 100% client-side (`"use client"` + `@tanstack/react-query` +
  fetch REST), pas de Server Components/Actions — rester cohérent.
- Nouveau depuis la vague 2 : l'auth par clé API partage le même en-tête
  `Authorization: Bearer` que le JWT (distinguée par le préfixe
  `elysia_`) — si un jour un vrai schéma de token JWT changeait de forme,
  vérifier que `JwtAuthGuard` (le check `startsWith(API_KEY_PREFIX)`) reste
  cohérent.
