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

Le seed écrit `.devices.dev.json` et `.dev-device-tokens.json` à la racine (tablette, PC caisse, téléphone admin). Les deux fichiers contiennent les jetons en clair, sont ignorés par Git, et ne doivent pas être commités. `pnpm dev:info` affiche les adresses et les noms d'appareils, jamais les jetons. Ne lancez pas `pnpm db:reset` en production : le reset change les jetons.

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

## Voir tourner le système en 5 minutes

Une page ouverte en `http://<IP du PC>` n'est pas un contexte sécurisé : le service worker et l'installation PWA complète ne fonctionnent pas. Ce prototype est une page normale (un raccourci sur l'écran d'accueil reste possible). Sur le PC, `http://localhost` convient. La PWA viendra avec le HTTPS local.

Playwright n'est pas branché : le scénario ci-dessous se joue à la main. Les composants (pavé PIN, aperçu bar/cuisine, montant, lignes verrouillées, garde de rôle) sont couverts par Vitest.

```text
docker compose up -d
pnpm db:reset
pnpm fake-printers
pnpm dev
pnpm dev:web
pnpm dev:info
```

`pnpm dev` lance le hub. `pnpm dev:web` lance la page d’administration sur le port 5173. `pnpm dev:floor` lance la PWA de service sur le port 5174 : un code à 4 chiffres ouvre le rôle (serveur ou caisse), sans l’écran admin.

1. Sur le PC, ouvrir `http://localhost:5173/setup?token=<jeton du PC caisse>` puis entrer avec Sonia, PIN `4321`.
2. Sur la tablette, ouvrir `http://<IP du PC>:5173/setup?token=<jeton de la tablette>` puis entrer avec Mohamed, PIN `1234`.
3. Mohamed ouvre T3, ajoute deux cafés (deux appuis : chaque appui est une ligne, car une annulation retire toute la ligne), une citronnade et un couscous, puis envoie. Le bar et la cuisine impriment un ticket.
4. Sonia voit la carte arriver sans recharger la page et marque la commande servie.
5. Mohamed ajoute un tiramisu et renvoie : ticket cuisine ADD.
6. Mohamed demande l'annulation d'un seul café. Sonia refuse, ou accepte sans mot de passe admin : le café est annulé et le bar imprime un ticket VOID.
7. Mohamed demande l'addition. La table passe à « à encaisser ». Sonia encaisse 50 TND en espèces : la monnaie s'affiche, la commande est payée, la table redevient libre sur la tablette. L'écran rappelle que c'est un enregistrement de gestion, non fiscal.
8. Arrêter l'imprimante cuisine, envoyer une commande : Sonia voit l'échec en rouge. Relancer l'imprimante, puis Réessayer.
9. Avec le jeton téléphone, un serveur n'est pas proposé (l'appareil n'accepte pas le personnel de salle). L'admin Karim, e-mail et mot de passe, ouvre `/admin` : tableau de bord, commandes, alertes, catalogue, réglages, imprimantes et appareils. Le stock, le personnel, la caisse et le journal restent au prochain lot.
10. Arrêter le hub : la page affiche « Hub injoignable » et désactive l'envoi. Au retour du hub, la page se rétablit.

Les jetons sont dans `.dev-device-tokens.json`. Ne pas les coller dans un ticket, un journal, ou Git.
