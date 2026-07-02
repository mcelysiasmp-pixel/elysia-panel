# extensions/

Emplacement prévu pour un système de plugins du panel (extensions
backend et/ou dashboard chargées dynamiquement), distribuables via le
Marketplace.

**État actuel** : non implémenté dans ce MVP. Le Backend NestJS est
structuré en modules indépendants (voir `backend/src/*/`), ce qui rend
l'ajout d'un mécanisme de chargement dynamique de modules tiers
envisageable sans réécriture majeure — reste à concevoir : sandboxing,
permissions par extension, versionnement de l'API interne exposée aux
extensions.
