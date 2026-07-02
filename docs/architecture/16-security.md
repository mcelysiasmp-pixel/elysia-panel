# Elysia Panel — Étape 16 : Sécurité

Ce document résume les mesures de sécurité en place et les vulnérabilités
trouvées et corrigées pendant le développement (le meilleur moment pour
les corriger — avant qu'un vrai attaquant ne les trouve).

## Mesures en place

| Domaine | Implémentation |
|---|---|
| Authentification | JWT access (courte durée) + refresh token opaque (rotation à chaque usage, révocable), hashé en base (sha256) |
| 2FA | TOTP (speakeasy) + codes de récupération à usage unique |
| OAuth2/OIDC | Discord, Google, GitHub via Passport |
| RBAC | Permissions granulaires par rôle, wildcard `*` réservé au rôle admin, vérifiées par `PermissionsGuard` sur chaque route |
| Anti-bruteforce | `@nestjs/throttler` global (100 req/min/IP) + limites dédiées sur `/auth/login` et `/auth/register` (5/min/IP) |
| Mots de passe | bcrypt (12 rounds), longueur minimale 10 caractères |
| Headers HTTP | `helmet()` global |
| CORS | Origine unique en production via `DASHBOARD_URL` (pas de reflect-any-origin) |
| Validation d'entrée | `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`) sur toutes les routes |
| Audit log | Toutes les actions sensibles tracées (`AuditService`), sévérité INFO/WARNING/CRITICAL |
| Isolation réseau | Un réseau Docker dédié par serveur (`elysia_srv_<uuid>`), aucune communication directe entre conteneurs de clients différents |
| Isolation fichiers | `filemgr.go` résout et borne tout chemin à la racine du serveur (anti path-traversal) |
| Isolation conteneurs | Utilisateur non-root (uid/gid 1000) dans toutes les images Docker Elysia |
| Transport interne | gRPC Backend↔Elysia Node en mTLS (obligatoire en production, voir `installer/`) |
| Secrets | Refus de démarrage en production (`ELYSIA_ENV=production`) si les secrets JWT par défaut du dépôt sont encore utilisés |
| SSRF | Téléchargements de mods/modpacks limités à une liste blanche de CDN connus (`common/url-safety.ts`) avant tout fetch serveur |
| Upload | Taille de fichier limitée (500 Mo) sur l'upload d'archives de modpack |

## Vulnérabilités trouvées et corrigées pendant cette étape

1. **IDOR sur les tâches planifiées** (`ScheduledTasksService`) — les
   méthodes `create`/`listForServer`/`setEnabled`/`delete` ne vérifiaient
   jamais que l'utilisateur authentifié avait accès au serveur ciblé.
   N'importe quel client authentifié (la permission `servers.update` fait
   partie du rôle "client" par défaut) pouvait planifier des actions
   (démarrage/arrêt/exécution de commande) sur **n'importe quel serveur du
   panel**, pas seulement les siens. Corrigé en faisant systématiquement
   passer l'utilisateur courant et en appelant
   `ServersService.findAccessibleOrThrow` avant toute opération.
2. **Élévation de privilège à la création de serveur** (`ServersService.create`) —
   le champ `ownerId` du DTO était accepté de n'importe quel appelant sans
   vérification de permission : un client pouvait créer un serveur en
   l'attribuant à un autre compte (facturation ou nuisance sur le compte
   de la victime). Corrigé : `ownerId` n'est autorisé à différer de
   l'appelant que si celui-ci possède la permission wildcard `*` (admin).
   Le contrôle est placé avant toute autre opération (fail-fast).

Les deux corrections ont été vérifiées par des requêtes réelles contre le
Backend (deux comptes utilisateurs distincts, tentative d'attaque
reproduite, réponse HTTP 403/404 confirmée après correction) — voir
l'historique de commits pour le détail des requêtes de test.

## Limitations connues / hors scope de ce MVP

- CSRF non applicable (authentification par `Authorization: Bearer`, pas
  de cookies de session porteurs de droits).
- Pas de scanning antivirus des fichiers uploadés (modpacks, fichiers du
  gestionnaire de fichiers) — à ajouter avant une mise en production
  ouverte à des utilisateurs non vérifiés.
- Pas de détection d'anomalies / SIEM sur les audit logs (recommandé :
  exporter vers un puits externe en production).
- Le rate limiting est en mémoire par instance Backend (`@nestjs/throttler`
  sans store Redis) : insuffisant si le Backend est scalé horizontalement
  derrière un load balancer sans sticky sessions — passer au store Redis
  officiel de throttler avant un déploiement multi-instance.
