# Elysia Panel — Étape 1 : Architecture globale

## 1. Contexte et contrainte structurante

Un panel Pterodactyl tourne déjà sur les mêmes machines. Cette contrainte n'est
pas un détail de configuration : elle **détermine la forme du système**.
Elysia n'est pas "un panel qu'on installe à côté" au sens logiciel applicatif
seulement — c'est un système qui doit prouver, à chaque couche
(filesystem, réseau Docker, ports, processus, base de données, utilisateur
système), qu'il ne peut pas entrer en collision avec Pterodactyl/Wings, même
en cas d'erreur de configuration.

Conséquence directe sur l'architecture : **chaque composant Elysia est
namespacé et paramétrable**, jamais codé en dur sur un port ou un chemin par
défaut connu de Pterodactyl.

| Ressource | Pterodactyl / Wings (référence, à NE PAS toucher) | Elysia |
|---|---|---|
| Panel web | nginx sur 80/443, PHP-FPM, MySQL/MariaDB | nginx dédié sur 9080/9443 (configurable), Next.js + NestJS, PostgreSQL |
| Daemon | Wings, Go, API sur :8080, SFTP sur :2022 | Elysia Node, Go, API/gRPC sur :9500-9502, SFTP sur :9522 |
| Réseau Docker | `pterodactyl_nw`, 172.18.0.0/16 (par défaut) | `elysia-net`, 172.30.0.0/16 |
| Base de données | MySQL/MariaDB propre à Pterodactyl | PostgreSQL 16 propre à Elysia, port 55432 |
| Cache | Redis propre à Pterodactyl (souvent) | Redis propre à Elysia, port 63790, mot de passe dédié |
| Utilisateur système | `pterodactyl` | `elysia` (nouveau, permissions distinctes) |
| Arborescence | `/var/www/pterodactyl`, `/etc/pterodactyl`, `/var/lib/pterodactyl` | `/opt/elysia`, `/etc/elysia`, `/var/lib/elysia`, `/var/log/elysia`, `/srv/elysia` |
| systemd | `pterodactyl.service`, `wings.service` | `elysia-backend.service`, `elysia-node.service`, `elysia-dashboard.service` |
| Docker images | Images `ghcr.io/pterodactyl/...` | Images `elysia/...` construites indépendamment, aucun `FROM` sur une image Ptero |

Aucune API Pterodactyl n'est appelée, aucun binaire Wings n'est requis comme
dépendance runtime, et le code source d'Elysia ne dérive d'aucun fichier
Pterodactyl (licence MIT propre, base de code originale).

## 2. Vue d'ensemble des composants

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              UTILISATEURS                                 │
│                 (admin, client, sous-utilisateur, API tierce)             │
└───────────────┬───────────────────────────────────────┬──────────────────┘
                │ HTTPS                                  │ HTTPS (API/SDK)
                ▼                                         ▼
        ┌───────────────┐                        ┌────────────────┐
        │  nginx Elysia  │◄──────────────────────►│  API publique   │
        │ (reverse proxy)│                        │ (REST + OpenAPI)│
        └───────┬────────┘                        └────────┬────────┘
                │                                           │
                ▼                                           ▼
        ┌────────────────┐    WebSocket (logs,     ┌─────────────────┐
        │  Dashboard      │◄──console, métriques───►│  Backend NestJS  │
        │  (Next.js SSR)  │        temps réel       │  (API + Gateway) │
        └────────────────┘                          └────┬────┬───┬───┘
                                                           │    │   │
                                        ┌──────────────────┘    │   └───────────────┐
                                        ▼                        ▼                    ▼
                               ┌────────────────┐      ┌────────────────┐   ┌────────────────┐
                               │  PostgreSQL     │      │     Redis       │   │  Message/Job    │
                               │  (état durable) │      │ (cache, queues, │   │  queue (BullMQ  │
                               │                 │      │  pub/sub, sess) │   │  sur Redis)     │
                               └────────────────┘      └────────────────┘   └────────────────┘

                Backend NestJS ──── gRPC + mTLS ────► Elysia Node (par serveur physique)
                                                              │
                                                              ▼
                                                    ┌──────────────────────┐
                                                    │   Elysia Node (Go)    │
                                                    │  - Docker Engine SDK  │
                                                    │  - gestion fichiers   │
                                                    │  - sauvegardes        │
                                                    │  - métriques (cAdvisor│
                                                    │    style)             │
                                                    │  - WS console/stats   │
                                                    └──────────┬───────────┘
                                                               │
                                                               ▼
                                                   ┌───────────────────────┐
                                                   │  Docker (elysia-net)   │
                                                   │  conteneurs de jeu     │
                                                   │  (1 par instance de    │
                                                   │  serveur client)       │
                                                   └───────────────────────┘
```

### Rôle de chaque brique

- **Dashboard (Next.js/React/TS/Tailwind/ShadCN)** : SSR pour le SEO/perf des
  pages publiques (landing, docs) + SPA riche pour le panel authentifié.
  Ne parle jamais directement à PostgreSQL ni à Elysia Node : tout passe par
  le Backend (séparation stricte front/back, sécurité, testabilité).
- **Backend (NestJS/TS)** : source de vérité applicative. Expose REST +
  OpenAPI (documenté, généré vers les SDK), un Gateway WebSocket (console,
  métriques live, notifications), et un client gRPC vers chaque Elysia Node.
  Contient toute la logique métier : permissions RBAC, facturation, quotas,
  audit log, orchestration multi-node.
- **Elysia Node (Go)** : daemon exécuté sur chaque serveur physique/VM
  hébergeant des conteneurs de jeu. Équivalent fonctionnel de Wings mais
  codebase et protocole propres. Responsable de tout ce qui touche
  directement Docker et le filesystem local : cycle de vie des conteneurs,
  I/O fichiers, sauvegardes, statistiques, streaming de logs. Communique
  avec le Backend via gRPC authentifié en mTLS (jamais exposé publiquement
  en HTTP nu).
- **PostgreSQL** : état durable (utilisateurs, serveurs, nodes, facturation,
  audit). Choisi pour ses contraintes fortes (JSONB pour les configs
  flexibles par jeu, transactions sérialisables pour la facturation, RLS
  possible pour un futur mode multi-tenant strict).
- **Redis** : cache, sessions, rate-limiting, pub/sub pour diffuser les
  événements aux instances Backend (scalabilité horizontale du Backend), et
  file de jobs (BullMQ) pour les tâches asynchrones (installation modpack,
  sauvegarde, migration de serveur).
- **Docker** : isolation par conteneur, un réseau bridge dédié `elysia-net`
  avec un CIDR distinct de celui de Pterodactyl.
- **Monitoring (Prometheus/Grafana)** : scrape les métriques exposées par le
  Backend et par chaque Elysia Node (endpoint `/metrics`), dashboards
  préconfigurés livrés dans `monitoring/grafana/dashboards`.

## 3. Pourquoi ce découpage (justifications techniques)

- **Next.js pour le dashboard** : SSR/streaming pour un panel qui doit
  rester réactif même avec des centaines de widgets de monitoring ; App
  Router + React Server Components réduisent le JS envoyé au client pour les
  vues denses (liste de serveurs, tableaux d'audit).
- **NestJS pour le backend** : structure modulaire proche de Spring/Angular
  (DI, décorateurs, guards, interceptors) — nécessaire vu le nombre de
  domaines métier (auth, serveurs, nodes, facturation, marketplace,
  support...). Écosystème mature pour REST + WebSocket + microservices
  (transport gRPC natif via `@nestjs/microservices`).
- **Go pour le daemon** : binaire statique unique, faible empreinte mémoire,
  bonnes bibliothèques Docker SDK (`docker/docker/client`), excellent pour
  la concurrence (streaming de logs de centaines de conteneurs
  simultanément). C'est aussi le choix qui a fait ses preuves pour Wings —
  ici on réutilise le raisonnement technique, pas le code.
- **PostgreSQL plutôt que MySQL** : JSONB indexable (utile pour stocker des
  configurations hétérogènes par type de jeu sans éclater le schéma),
  meilleures garanties transactionnelles pour la facturation, extensions
  utiles (pg_partman pour partitionner les logs d'audit dans le temps).
- **gRPC entre Backend et Node** : contrat fortement typé (protobuf) pour un
  protocole interne critique (démarrage/arrêt de conteneurs, transferts de
  fichiers volumineux via streaming), plus performant que REST/JSON pour ce
  trafic interne à haute fréquence (métriques, logs).
- **REST + OpenAPI pour l'API publique** : compatibilité maximale pour les
  intégrations tierces et génération automatique des SDK (TS/Go/Python).

## 4. Isolation réseau et sécurité inter-composants

- Réseau Docker `elysia-net` (bridge, subnet `172.30.0.0/16`), aucun
  conteneur Elysia n'est attaché au réseau `pterodactyl_nw`.
- Chaque conteneur de jeu client est en outre placé sur un réseau Docker
  **par serveur** (`elysia_srv_<uuid>`) pour empêcher toute communication
  réseau directe entre les serveurs de deux clients différents ; seul
  Elysia Node peut atteindre le conteneur via l'API Docker locale (pas de
  port exposé sur `0.0.0.0` sauf ceux explicitement mappés par le client).
- Communication Backend ↔ Elysia Node : gRPC sur mTLS, certificats émis par
  une CA interne Elysia générée à l'installation (`/etc/elysia/certs/ca.crt`),
  un couple cert/clé par node, rotation supportée.
- Communication Dashboard ↔ Backend : HTTPS uniquement en production
  (derrière le nginx Elysia dédié), cookies `HttpOnly` + `SameSite=Strict`
  pour les refresh tokens, `Authorization: Bearer` pour les access tokens
  côté SPA/API.
- Aucun service Elysia n'écoute sur les ports historiques de Pterodactyl
  (voir tableau §1) ; tous les ports sont définis via `.env` et vérifiés au
  démarrage par un check de collision de port (implémenté à l'étape
  installateur, §17).

## 5. Multi-node, haute disponibilité, clustering

- Le Backend est **stateless** (état dans PostgreSQL/Redis) → scalable
  horizontalement derrière un load balancer.
- Chaque **node physique** = une instance d'Elysia Node. Le Backend maintient
  un registre des nodes (santé, capacité, version) et route les commandes
  vers le bon node via gRPC.
- La haute disponibilité de PostgreSQL (réplication streaming + failover)
  et de Redis (Sentinel/Cluster) est traitée comme une option de déploiement
  documentée (installateur avancé), pas comme une dépendance dure du MVP.
- Migration de serveur entre nodes : orchestrée par le Backend (job en file
  Redis/BullMQ) qui pilote deux Elysia Node (source et destination) via gRPC
  streaming pour le transfert de fichiers, avec un état de migration
  persisté en base (reprise sur erreur).

## 6. Flux d'exemple : création d'un serveur Minecraft (Paper)

1. Le client soumet le formulaire dans le Dashboard → `POST /api/servers`
   sur le Backend (JWT vérifié, quota/permissions vérifiés en DB).
2. Le Backend choisit un node éligible (capacité RAM/CPU/disque disponible,
   région), crée l'enregistrement `server` en PostgreSQL (statut
   `installing`), publie un événement sur Redis pub/sub.
3. Le Backend appelle en gRPC l'Elysia Node ciblé : `CreateServer(spec)`
   (image Docker, limites de ressources, variables d'environnement, volume).
4. Elysia Node crée le volume dédié sous `/srv/elysia/servers/<uuid>`, tire
   l'image Docker `elysia/minecraft-java:paper-latest` si absente, crée le
   conteneur sur son propre réseau `elysia_srv_<uuid>`, lance le script
   d'installation (téléchargement Paper, acceptation EULA, etc.) en
   streamant la sortie via WebSocket au Backend, qui la relaie au Dashboard.
5. Une fois l'installation terminée, Elysia Node notifie le Backend (gRPC),
   qui met à jour le statut en DB (`running`/`offline`) et notifie le
   Dashboard via WebSocket.

Ce flux illustre pourquoi le découpage REST (contrôle) / gRPC (orchestration
interne) / WebSocket (temps réel) est nécessaire plutôt qu'un simple CRUD.

## 7. Ce que cette étape NE couvre PAS (volontairement)

- Schéma détaillé des tables PostgreSQL → **étape 3**.
- Implémentation du Backend NestJS → **étape 4**.
- Implémentation du daemon Go → **étape 5**.
- Détails Modrinth/CurseForge, facturation, marketplace → étapes dédiées.
- Contenu réel de l'installateur (`install.sh`) → **étape 17**, mais les
  conventions de chemins/ports qu'il devra respecter sont déjà fixées ici
  pour éviter tout retour en arrière.

## 8. Prochaine étape

**Étape 2 — Structure des dossiers** : le squelette créé en parallèle de ce
document (voir racine du repo) sera détaillé et complété avec les fichiers
de configuration par sous-projet (package.json du dashboard/backend, go.mod
du daemon, Dockerfiles de base). Dis-moi quand tu veux enchaîner sur
l'étape 3 (schéma PostgreSQL) — c'est la fondation dont dépendent le backend
et une bonne partie du daemon.
