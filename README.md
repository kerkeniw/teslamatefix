# TeslaMateFix

Outil web mobile-first pour **corriger et compléter** les données collectées par
[TeslaMate](https://github.com/teslamate-org/teslamate). Quand la voiture perd sa
connexion (parking souterrain, zone blanche, panne API), des trajets et sessions
de charge sont enregistrés incomplets — fin manquante, kilométrage faux, énergie
absente, état bloqué sur `online`. TeslaMateFix s'ajoute au `docker-compose` de
TeslaMate, se connecte à sa base PostgreSQL et expose une UI sécurisée pour
réparer chaque entité (`drives`, `charges`, `positions`, `addresses`,
`geofences`, `states`, `updates`, `cars`, `settings`).

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
