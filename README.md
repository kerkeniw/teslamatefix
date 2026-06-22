# TeslaMateFix

Outil web mobile-first pour **corriger et compléter** les données collectées par
[TeslaMate](https://github.com/teslamate-org/teslamate). Quand la voiture perd sa
connexion (parking souterrain, zone blanche, panne API), des trajets et sessions
de charge sont enregistrés incomplets — fin manquante, kilométrage faux, énergie
absente, état bloqué sur `online`. TeslaMateFix s'ajoute au `docker-compose` de
TeslaMate, se connecte à sa base PostgreSQL et expose une UI sécurisée pour
réparer chaque entité (`drives`, `charges`, `positions`, `addresses`,
`geofences`, `states`, `updates`, `cars`, `settings`).

> **Statut v0.5.1** — seuls les modules de **création et de modification
> des charges** ont été testés et validés. Les autres entités (trajets,
> positions, adresses, géofences, états, mises à jour de firmware, voitures,
> paramètres) sont accessibles en **consultation** mais leurs flux d'édition
> n'ont pas encore été validés. À utiliser avec précaution et **toujours sur
> une base sauvegardée** (`pg_dump` recommandé avant la première utilisation).

## Nouveautés v0.5.1

Outillage et correctifs autour de la Fleet API (release **doc only**, aucun
changement de code applicatif) :

- **Collection Postman complète de la Fleet API** (116 requêtes : auth OAuth,
  vehicle data & commandes, charging, energy, partner, user) pour explorer/tester
  ce que l'API expose — Tesla ne publiant ni OpenAPI ni collection officielle.
  Environnement EU pré-rempli inclus : [`postman/`](postman/).
- **Fix `403 missing scopes vehicle_location`** : le scope `vehicle_location` est
  désormais documenté (scopes de l'app + URL d'autorisation), avec un dépannage du
  **403 qui persiste après ré-auth**. Piège clé : le scope doit être accordé dans
  **`account.tesla.com`** (applications tierces), pas seulement déclaré sur
  `developer.tesla.com`. Voir [`docs/FLEET_API_MIGRATION.md`](docs/FLEET_API_MIGRATION.md).

Détails et checklist : [`docs/RELEASE_v0.5.1.md`](docs/RELEASE_v0.5.1.md).

## Nouveautés v0.5.0

Tesla a coupé l'**Owner API** pour les particuliers (juin 2026, erreurs `403`) :
TeslaMate ne collecte plus de données sans migration vers la **Fleet API**.
Celle-ci impose d'héberger une clé publique sur un domaine pour valider
l'application — TeslaMateFix sait désormais le faire :

- **Clé publique Tesla servie par TeslaMateFix** sur
  `/.well-known/appspecific/com.tesla.3p.public-key.pem` — **aucun service web
  supplémentaire** : un *rewrite* interne route l'URL vers une route handler
  publique, le fichier `.pem` est monté en lecture seule (`/well-known:ro`) et
  lu à chaud (rotation possible sans rebuild). Variable `TESLA_PUBLIC_KEY_FILE`.
- **Guide de migration Owner API → Fleet API** pas-à-pas (app developer Tesla,
  clés EC, enregistrement de domaine, tokens utilisateur `access`+`refresh`,
  reconfiguration TeslaMate) :
  [`docs/FLEET_API_MIGRATION.md`](docs/FLEET_API_MIGRATION.md).

Détails techniques et checklist de release :
[`docs/RELEASE_v0.5.0.md`](docs/RELEASE_v0.5.0.md).

## Nouveautés v0.4.0

Refonte UI majeure de l'écran d'édition d'une charge et adaptation mobile :

- **Carte géographique** centrée sur la position de la charge, avec marqueur
  Leaflet + tuiles OpenStreetMap. Affichée uniquement sur l'onglet Session.
- **Delta SOC dans le titre** (`32 % → 80 %`) avec picto pile rempli vert
  proportionnel à la capacité atteinte ; bouton pour basculer entre % et km
  d'autonomie idéale.
- **Bloc Borne scindé** : type + puissance + *Appliquer* / *Annuler* en haut,
  détails (V, A, phases, marque, câble, …) repliables — bloc Batterie remonté
  juste sous le bloc principal.
- **Header mobile compacté** : logo + sélecteur véhicule visibles ; navigation
  principale + fuseau horaire + thème + langue + déconnexion regroupés dans
  un menu burger `☰` (panneau latéral).
- **`outside_temp_avg`** propagé sur les ticks selon la règle métier
  *Appliquer à tous les ticks* (même verrouillage qu'AC/DC).

Détails complets, schéma serveur et dépendances :
[`docs/RELEASE_v0.4.0.md`](docs/RELEASE_v0.4.0.md).

## Installation

Ajouter ce bloc à votre `docker-compose.yml` TeslaMate, à côté des services
`teslamate` / `database` / `grafana` / `mosquitto` :

```yaml
services:
  teslamatefix:
    image: wkerkeni/teslamatefix:latest
    restart: always
    depends_on:
      - database
    ports:
      - "3001:3001"
    environment:
      DATABASE_USER: "${DATABASE_USER:-teslamate}"
      DATABASE_PASS: "${DATABASE_PASS}"
      DATABASE_NAME: "${DATABASE_NAME:-teslamate}"
    volumes:
      - teslamatefix-data:/data

volumes:
  teslamatefix-data:
```

Puis :

```bash
docker compose up -d teslamatefix
```

Ouvrir `http://<host>:3001`, se connecter avec **`admin`** / **`admin`** et
choisir un nouveau mot de passe lors de la redirection (premier login obligatoire,
pattern Grafana).

C'est tout. Le secret de session et le hash bcrypt sont générés
automatiquement au premier démarrage et persistés dans le volume
`teslamatefix-data`.

## Mise à jour

```bash
docker compose pull teslamatefix
docker compose up -d teslamatefix
```

Compose recrée le conteneur avec la nouvelle image. Le volume
`teslamatefix-data` est préservé, donc mot de passe et clé de session
survivent. Détails et compatibilité TeslaMate :
[`docs/INSTALL.md`](docs/INSTALL.md#3-mise-à-jour).

## Aller plus loin

- **Sécuriser la mise en prod** (HTTPS reverse-proxy, rôle PostgreSQL dédié,
  hash fourni en env, mode lecture seule) — voir
  [`docs/INSTALL.md`](docs/INSTALL.md) (FR) /
  [`docs/INSTALL.en.md`](docs/INSTALL.en.md) (EN).
- **Intégration TeslaMate détaillée** (sauvegarde Postgres, reverse-proxy
  nginx/Caddy/Traefik) —
  [`docs/INTEGRATION_TESLAMATE.md`](docs/INTEGRATION_TESLAMATE.md).
- **Stack technique** — Next.js 16, React 19, Prisma 6 (introspection
  read-only de TeslaMate), iron-session, next-intl FR/EN, Tailwind 4 +
  shadcn/ui.

## Licence

MIT.
