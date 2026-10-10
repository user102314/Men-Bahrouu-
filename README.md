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

Le seed écrit aussi `.devices.dev.json` à la racine. Ce fichier contient les jetons en clair de la tablette et du PC caisse. Il est ignoré par Git. Ne le commettez pas, et ne lancez pas `pnpm db:reset` en production : le reset change les jetons.

## Démonstration commandes et impression

Dans quatre terminaux, après `pnpm install` :

```text
docker compose up -d
pnpm db:reset
pnpm fake-printers
pnpm dev
pnpm demo:flow
```

`pnpm fake-printers` écoute sur `127.0.0.1:9101` (bar) et `127.0.0.1:9102` (cuisine), affiche chaque ticket et l'enregistre dans `tools/fake-printer/out/`. Pour simuler une panne : `pnpm fake-printers -- --fail`.

`pnpm demo:flow` se connecte comme Mohamed (tablette, PIN `1234`), envoie une commande sur la table T3, ajoute un tiramisu, puis demande l'annulation d'un café. Sonia (PC caisse, PIN `4321`) ne peut pas approuver sans l'override admin (`admin@resto.local` / `Admin#2026dev`). Le script affiche ensuite les tickets lus depuis les imprimantes simulées.
