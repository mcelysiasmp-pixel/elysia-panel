# Installateur Elysia Panel (étape 17)

```bash
sudo ./install.sh --domain panel.example.com
```

## Ce que fait `install.sh`

1. Pré-vérifications : OS (Debian/Ubuntu), détection non-bloquante d'un
   Pterodactyl existant (avertissement seulement), vérification que les
   ports Elysia n'entrent pas en collision avec les ports standards
   Pterodactyl/Wings (80, 443, 8080, 2022).
2. Dépendances système : Docker (script officiel), Node.js 22, Go 1.23.
3. Utilisateur système `elysia` (jamais root), arborescence
   `/opt/elysia`, `/etc/elysia`, `/var/lib/elysia`, `/var/log/elysia`,
   `/srv/elysia`.
4. Génération des secrets (JWT, mots de passe DB/Redis) — une seule fois,
   conservés au ré-exécution.
5. Infrastructure (PostgreSQL, Redis, Prometheus, Grafana) via le
   `docker-compose.yml` du repo, réseau Docker `elysia-net` dédié.
6. Build et installation du Backend, du daemon Elysia Node, du Dashboard.
7. CA interne + certificat mTLS pour la communication Backend↔Elysia Node.
8. Services systemd `elysia-backend`, `elysia-node`, `elysia-dashboard`.
9. vhost nginx dédié sur les ports 9080/9443 (jamais 80/443), SSL via
   certbot si un domaine réel est fourni.
10. Pare-feu (ufw) : n'ouvre que les ports nginx Elysia exposés au public.

## Options

| Option | Effet |
|---|---|
| `--dry-run` | N'exécute aucune commande destructive/mutante, affiche ce qui serait fait. Utilisable sans root. |
| `--domain FQDN` | Domaine du panel (défaut `elysia.local`). |
| `--skip-ssl` | Ne configure pas certbot. |
| `--skip-firewall` | Ne touche pas à ufw. |

## Validation effectuée

- `bash -n install.sh` (syntaxe) et `shellcheck install.sh` (0 avertissement).
- Exécution complète en `--dry-run` sur une machine de développement réelle
  (celle utilisée pour construire ce repo) : a révélé et permis de corriger
  deux bugs réels avant qu'ils n'atteignent une vraie installation :
  1. un message d'avertissement concaténait plusieurs chemins sans
     séparateur, illisible ;
  2. `build_daemon`/`build_dashboard` écrivaient leurs fichiers `.env` via
     un `cat > fichier <<EOF` **hors** du garde-fou `--dry-run`, donc
     systématiquement en écriture réelle même en mode simulation — corrigé
     pour respecter le même contrat que le reste du script.

## Non testé dans ce dépôt

L'exécution réelle (sans `--dry-run`, avec root) sur une machine vierge
n'a pas été effectuée ici — un environnement de développement partagé
n'est pas le bon endroit pour installer des services système, créer des
utilisateurs Unix ou modifier la configuration nginx/ufw. À valider sur
une VM de test avant un premier déploiement en production.
