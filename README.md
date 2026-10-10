# Men Bahrouu

Hub local d'un restaurant. Ce n'est pas une caisse fiscale certifiée. Les tickets imprimés sont des bons de préparation (bar et cuisine).

## Prérequis

- Node.js 24 en tête du `PATH`
- pnpm 12 (via Corepack)
- Docker, pour PostgreSQL 16

PostgreSQL n'écoute que sur `127.0.0.1`. Le hub écoute sur toutes les interfaces du réseau local.

## Base de développement

```text
pnpm install
docker compose up -d
pnpm db:reset
```

`pnpm db:reset` et `pnpm db:seed` **refusent de tourner si `NODE_ENV=production`**. Ne jamais les lancer en production : le reset détruit le schéma, puis le seed régénère les jetons d'appareil. L'ancien jeton en clair n'est plus valable, et le nouveau n'est affiché qu'une fois dans la console.

Les identifiants de développement (mot de passe admin, PIN, jetons) sont réservés à cette base locale.
