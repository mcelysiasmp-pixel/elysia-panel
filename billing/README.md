# billing/

Ce dossier est un point d'entrée réservé par l'architecture du monorepo
pour un futur micro-service de facturation autonome.

**État actuel** : la facturation (étape 13) est implémentée comme module
NestJS à l'intérieur du Backend — voir
[`backend/src/billing/`](../backend/src/billing/) (produits, plans,
coupons, factures, intégration Stripe). Ce choix évite la complexité
d'un service séparé tant que le volume ne le justifie pas.

Si la facturation doit un jour être extraite en service indépendant
(ex: pour isoler les paiements sur son propre cycle de déploiement/scaling),
ce dossier est l'emplacement prévu à cet effet.
