# Reste à faire — Elysia Panel

État au 2026-07-02, après la session sur : SFTP par serveur (façon Ptero) +
audit de parité backend↔dashboard + rattrapage dashboard (file manager,
stats live).

## Bug corrigé cette session

**Stats live serveur (WebSocket) : `stats:subscribe` plantait côté backend.**

- Cause racine trouvée en rejouant la méthode de test ci-dessous avec un
  try/catch temporaire dans `subscribeStats` : `TypeError: Cannot read
  properties of undefined (reading 'permissions')` dans
  `ServersService.findAccessibleOrThrow`. **Ce n'était pas un problème de
  sérialisation gRPC/protobuf** (les suspects listés dans une version
  précédente de ce fichier étaient faux pistes) — `socket.data.user` était
  `undefined` au moment du handler.
- Vraie cause : race condition. `handleConnection` (interface
  `OnGatewayConnection`) est asynchrone (vérif JWT + lookup Prisma), mais
  NestJS ne bloque pas le dispatch des messages entrants le temps que cette
  promesse se résolve — un client qui émet un event juste après `connect`
  peut donc atteindre un `@SubscribeMessage` avant que `socket.data.user`
  soit renseigné. `stats:subscribe` plantait de façon systématique (et pas
  `console:subscribe`) simplement parce que le round-trip du dashboard est
  plus rapide sur l'un que sur l'autre dans les faits — un test manuel avec
  un léger délai avant `console:subscribe` masquait le bug par hasard.
- **Fix** : auth déplacée dans un middleware de namespace Socket.IO
  (`afterInit(server) { server.use((socket, next) => {...}) }` au lieu de
  `handleConnection`). Un middleware `server.use()` fait partie du
  handshake — socket.io garantit qu'il est résolu avant que `'connection'`
  soit émis et donc avant tout message. Voir
  `backend/src/websocket/console.gateway.ts`.
- Vérifié en réel (backend + daemon + vrai conteneur Docker démarré, script
  `socket.io-client` reproduisant exactement ce que fait le dashboard) :
  5/5 runs propres avec subscribe immédiat après connect (le cas qui
  plantait à 100% avant le fix), `stats:update` reçus en continu, et
  `console:subscribe` toujours fonctionnel (même chemin d'auth).
- **Bug additionnel trouvé et corrigé au passage** dans
  `dashboard/src/components/panel/stats-panel.tsx` : le backend charge le
  proto avec `longs: String` (@grpc/proto-loader), donc les champs int64
  comme `memory_used_mb` arrivent en **string** sur le WebSocket (vérifié :
  `"memory_used_mb":"0"` vs `"cpu_usage_pct":0` sans guillemets côté
  `double`). Le composant appelait `.toFixed()` dessus directement →
  `TypeError` runtime au premier `stats:update` reçu, jamais détecté avant
  car jamais testé en conditions réelles. Corrigé par `Number(...)` à la
  réception de l'event.
- Les trois fichiers dashboard (`stats-panel.tsx`, câblage dans
  `servers/[id]/page.tsx`, tokens couleur dans `globals.css`) sont
  maintenant committés.

### Méthode pour retester (déjà rodée cette session)

1. `cd backend && pnpm run start:dev` (arrière-plan, attendre `/api/docs`
   dispo).
2. `cd daemon && NODE_API_PORT=9590 NODE_GRPC_PORT=9591 NODE_SFTP_PORT=9524
   ELYSIA_RUNTIME_DIR=/tmp/xxx/srv ELYSIA_BACKUPS_DIR=/tmp/xxx/backups
   DOCKER_NETWORK_NAME=elysia-net NODE_INTERNAL_SECRET=dev_test_node_internal_secret
   PANEL_INTERNAL_URL=http://127.0.0.1:9401
   NODE_SFTP_HOST_KEY=/tmp/xxx/certs/key go run ./cmd/elysia-node`
   (arrière-plan).
3. Créer user/node/template de test via un script `ts-node` Prisma
   ponctuel (voir les commits de cette session pour des exemples : ils
   étaient nommés `prisma/verify-*.ts` et systématiquement supprimés après
   usage, ne pas les laisser traîner).
4. Passer le node `ONLINE` via `GET /nodes/:id/health` (sinon
   `POST /servers` échoue avec "Aucun node disponible").
5. `POST /servers` (créer), `POST /servers/:id/power/start` (démarre un
   vrai conteneur Docker — vérifié que ça marche).
6. Se connecter en WebSocket avec un petit script Node utilisant
   `socket.io-client` (déjà une dépendance du dashboard, réutilisable via
   `require("<repo>/dashboard/node_modules/socket.io-client")`), émettre
   `stats:subscribe`, écouter `stats:update`/`stats:error`/`exception`.
7. **Ne pas oublier de nettoyer** après coup : conteneurs Docker
   (`docker rm -f`), réseaux Docker par-serveur (`elysia_srv_<uuid>`),
   lignes de test en base, et surtout **tuer les vrais process** avec
   `pkill -9 -f "dist/src/main"` ET `pkill -9 -f "nest.js start"` (attention,
   `pkill -f "nest start"` ne matche PAS `nest.js start --watch` à cause du
   `.js` — piège rencontré plusieurs fois cette session, qui a fait tourner
   plusieurs backends fantômes en parallèle et donné de faux résultats).

## Fait cette session (committé)

1. `84ec21c` — Endpoints serveurs update/reinstall/allocations + fichiers
   upload/mkdir (backend + daemon), y compris `ReinstallServer` qui
   manquait complètement côté daemon Go.
2. `a7b24e7` — SFTP par serveur façon Wings, port **9522** (pas 2022, pour
   ne jamais entrer en collision avec un Pterodactyl existant — contrainte
   de conception du projet, voir README). Testé avec un vrai client SFTP :
   auth, list/read/mkdir/upload, path traversal bloqué, sub-user lecture
   seule bloqué en écriture.
3. `66ecbbc` — Onglet SFTP dans le dashboard (host/port/user copiables).
4. `b58ca20` — **Bug important corrigé** : le chemin vers `elysia.proto`
   était mal calculé (`__dirname` supposait une exécution ts-node jamais
   utilisée en pratique), ce qui cassait TOUT appel gRPC backend→daemon
   (actions serveur, reinstall, allocations, fichiers...) au runtime, en
   dev comme en prod. Corrigé + installateur mis à jour pour déployer
   `api/` en frère de `backend/`.
5. `d1541ef` — Gestionnaire de fichiers complet dans le dashboard (liste,
   navigation, upload, mkdir, édition de fichiers texte, download, rename,
   delete). Toute la chaîne testée en réel via de vrais appels HTTP.
6. `b87d327` — Fix race condition `stats:subscribe` (voir section ci-dessus)
   + fix bug parsing `memory_used_mb` (string int64) + stats live CPU/RAM
   dans le dashboard.
7. `95a884a` — Onglet Paramètres serveur dans le dashboard : général
   (nom/description/image/startup/env), réinstaller, allocations réseau
   (ajout/suppression), sous-utilisateurs (ajout/suppression avec
   permissions). Nouvel endpoint backend `GET /users/lookup?email=`
   (accessible à tout utilisateur authentifié, sans `users.read`) :
   nécessaire pour qu'un propriétaire de serveur (rôle client, pas admin)
   puisse résoudre l'email d'un ami en `userId` avant de l'ajouter comme
   sub-user — sans ça, `POST /servers/:id/subusers` était inutilisable
   depuis le dashboard pour un non-admin (il exige un `userId`, et
   `GET /users` est admin-only). Toute la chaîne testée en réel : update,
   reinstall (vérifié que le conteneur est recréé avec la nouvelle commande
   de démarrage), add/remove allocation, lookup + add/remove sub-user, y
   compris avec un compte non-admin pour confirmer que `/users/lookup` ne
   nécessite pas `users.read` alors que `GET /users` reste bloqué.
8. `5968e71` — Détail + réponse ticket support côté dashboard (voir section
   ci-dessus).
9. `646f8b4` — Nodes : bouton delete câblé dans `admin/nodes` (le toggle
   maintenance était en fait déjà câblé, juste sans gestion d'erreur/toast
   — refait en `useMutation` propre au passage). Testé en réel : toggle
   maintenance (ONLINE ↔ MAINTENANCE), suppression bloquée avec message
   clair tant qu'un serveur est hébergé sur le node (le backend le vérifie
   déjà), suppression qui réussit une fois le serveur supprimé.
10. (à committer avec cette mise à jour) — Monitoring visualisé
    (`admin/monitoring`) : les 3 stat cards CPU/RAM/Disque sont remplacées
    par des meters colorés (bonne/warning/critique selon seuils, même
    logique que les stats live serveur) et le bloc "Serveurs par statut"
    par un bar chart horizontal trié par count, couleurs reprenant
    exactement le mapping sémantique déjà utilisé par `status-badge.tsx`
    (cohérence badges ↔ graphe). Palette validée avec le script du skill
    dataviz (`validate_palette.js`) : CVD separation PASS, contrast WARN
    attendu pour des couleurs de statut saturées — mitigé par les labels
    texte + valeurs numériques toujours visibles à côté de chaque barre
    (jamais de couleur seule pour porter l'identité). Pas de graphes
    time-series : le résumé `/monitoring/summary` est un instantané ponctuel
    (les gauges Prometheus internes ne sont pas exposées en série
    temporelle interrogeable par le dashboard, seulement en scrape texte
    `/metrics` pour un Prometheus/Grafana externe) — donc meters +
    bar chart plutôt que sparklines ici. Vérifié la forme exacte de la
    réponse `/monitoring/summary` avec de vraies données (node + serveurs
    de plusieurs statuts) contre ce que consomment les nouveaux composants.

## Reste à faire — chantiers dashboard (priorisés avec l'utilisateur)

Cf. mémoire long-terme (`project_elysia_panel.md`) pour le détail de
l'audit initial. Statut mis à jour :

1. ~~File manager~~ ✅ fait (commit `d1541ef`)
2. ~~Stats live serveur (CPU/RAM)~~ ✅ fait (voir section bug corrigé
   ci-dessus)
3. ~~Settings serveur~~ ✅ fait (update/reinstall/allocations/subusers +
   nouvel endpoint `/users/lookup`)
4. ~~Détail + réponse ticket support~~ ✅ fait — page
   `support/[id]/page.tsx` : thread de messages (bulle distincte pour les
   réponses staff), formulaire de réponse, changement de statut réservé aux
   comptes avec `support.reply`. La page liste + la page détail sont
   partagées entre client et staff (le scoping — un client ne voit que ses
   propres tickets — est déjà géré côté backend par `listForUser`/
   `findAccessibleOrThrow`, pas besoin d'une page admin séparée). Testé en
   réel avec un compte client et un compte staff distincts : création,
   réponse staff, changement de statut, et vérifié que le 403 backend sur
   `:id/status` est bien renvoyé à un client qui tente de forcer le statut.
5. **Checkout billing** — pas de flux de paiement Stripe côté dashboard
6. **Bouton install marketplace** — items listés en lecture seule
   seulement
7. **Admin roles/permissions** — RBAC complet côté backend, aucune UI
8. ~~Monitoring Prometheus visualisé~~ ✅ fait (voir section ci-dessus)
9. **Scheduled tasks UI** — équivalent "Schedules" Ptero, 100% absent
10. ~~Nodes : maintenance + delete~~ ✅ fait (voir section ci-dessus)

## Points de vigilance pour la suite

- **Toujours tester en conditions réelles** avant de considérer une
  fonctionnalité backend↔daemon terminée : le bug du chemin proto (point 4
  ci-dessus) était invisible en typecheck/build et existait probablement
  depuis le tout début du projet malgré les mentions "validé en runtime"
  dans le README — deux fonctionnalités (file manager, reinstall/
  allocations) avaient déjà ce défaut caché avant d'être testées cette
  session.
- Pas d'outil de capture d'écran/navigateur dans cet environnement : toute
  vérification UI passe par tsc + `next build` + appels HTTP/WebSocket
  directs reproduisant ce que ferait le dashboard. Le dire explicitement
  plutôt que prétendre une vérification visuelle.
- Le dashboard tourne sur Next.js 16 avec des changements non standards
  (voir `dashboard/AGENTS.md`) — vérifier `node_modules/next/dist/docs/`
  avant tout code touchant à des APIs Next.js peu familières (routing,
  data fetching serveur). Le pattern actuel du projet est 100% client-side
  (`"use client"` + `@tanstack/react-query` + fetch REST), pas de Server
  Components/Actions utilisés — rester cohérent avec ça.
