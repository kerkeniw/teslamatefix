# TeslaMateFix

Outil web mobile-first pour **corriger et compléter** les données collectées par
[TeslaMate](https://github.com/teslamate-org/teslamate). Quand la voiture perd sa
connexion (parking souterrain, zone blanche, panne API), des trajets et sessions
de charge sont enregistrés incomplets — fin manquante, kilométrage faux, énergie
absente, état bloqué sur `online`. Aujourd'hui, la seule façon de corriger ces
données est `psql` à la main, ce qui est risqué et pénible.

TeslaMateFix s'ajoute au `docker-compose.yml` de TeslaMate, se connecte à la base
PostgreSQL existante et expose une UI sécurisée pour gérer chaque entité métier
(`drives`, `charges`, `positions`, `addresses`, `geofences`, `states`, `updates`,
`cars`, `settings`).

## Stack

- **Next.js 16** (App Router, src-dir, Turbopack, output `standalone`)
- **React 19** + **TypeScript 5**
- **Tailwind CSS 4** + **shadcn/ui** (preset `base-nova`, bâti sur `@base-ui/react`)
- **Prisma 6** (introspection read-only du schéma TeslaMate, **jamais** de
  `prisma migrate` sur la base partagée)
- **iron-session** (cookie chiffré) pour l'auth single-user
- **next-intl 4** pour i18n FR/EN
- **TanStack Table** pour les listes paginées
- **pino** pour les logs structurés
- **Vitest** + **Playwright** pour les tests

## Démarrage rapide (dev)

```bash
# 1) Pointer DATABASE_URL vers une base TeslaMate accessible
cp .env.example .env
# 2) Générer un AUTH_SECRET et un AUTH_PASSWORD_HASH
openssl rand -base64 32          # → AUTH_SECRET
echo -n "MotDePasse" | npm run auth:hash --silent  # → AUTH_PASSWORD_HASH
# 3) Compléter .env, puis :
npm install
npm run dev
# Accès : http://localhost:3000 (login : la valeur de AUTH_USERNAME)
```

## Production (Docker)

Voir [`docs/INSTALL.md`](docs/INSTALL.md) (FR) / [`docs/INSTALL.en.md`](docs/INSTALL.en.md) (EN)
pour le guide d'intégration au compose TeslaMate, et
[`docs/INTEGRATION_TESLAMATE.md`](docs/INTEGRATION_TESLAMATE.md) pour les détails
de mise en place du reverse-proxy et du backup préalable.

Le `docker-compose.example.yml` à coller dans la stack TeslaMate est dans
[`docker/`](docker/).

## Tests

```bash
npm run test       # Vitest unit (lib/integrity)
npm run test:e2e   # Playwright e2e (login → dashboard → logout)
npm run typecheck  # tsc --noEmit
npm run build      # next build (Turbopack)
```

## Sécurité

- Une seule paire identifiant/mot-de-passe via env (`AUTH_USERNAME`,
  `AUTH_PASSWORD_HASH` bcrypt, `AUTH_SECRET` 32+ chars).
- Cookie session `httpOnly` + `sameSite=lax` + `secure` en production.
- Rate limit 5 tentatives / 5 min / IP sur `/login`.
- Mode `READ_ONLY=true` pour bloquer toute mutation (utile en phase pilote ou
  en backup).
- **Recommandé** : créer un utilisateur PostgreSQL dédié avec privilèges
  minimaux via [`docker/init-teslamatefix-user.sql`](docker/init-teslamatefix-user.sql).
  Pas de privilège sur les tokens OAuth chiffrés Cloak ni sur `schema_migrations`.

## Plan & journal

- **Plan d'exécution** : `~/.claude/plans/nous-allons-cr-er-une-woolly-donut.md`
- **Journal d'implémentation** : [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md)

## Statut

En développement actif. Pas encore publié.

## Licence

MIT
