# marketplace/

Point d'entrée réservé par l'architecture du monorepo pour un futur
marketplace autonome (build/packaging séparé pour les soumissions
tierces).

**État actuel** : le marketplace (étape 14) est implémenté comme module
NestJS dans le Backend — voir
[`backend/src/marketplace/`](../backend/src/marketplace/) (catalogue de
plugins/thèmes/templates/images Docker, publication, vérification) — et
comme page dans le Dashboard — voir
[`dashboard/src/app/(panel)/marketplace/`](../dashboard/src/app/(panel)/marketplace/).
