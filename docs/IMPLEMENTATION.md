# Journal d'implémentation — TeslaMateFix

Référence du plan complet : `~/.claude/plans/nous-allons-cr-er-une-woolly-donut.md`.
Ce journal trace, pas à pas, ce qui a été réalisé.

---

## Étape 1 — Bootstrap Next.js 16 + Tailwind 4 + TypeScript

**Commit** : `c5218e0` — *init: bootstrap Next.js 16 + Tailwind 4 + TypeScript*

- Scaffold via `npx create-next-app@latest /tmp/teslamatefix-init` (le nom de dossier `TeslaMateFix` était refusé par npm pour cause de majuscules), puis copie des fichiers vers le projet en préservant `.git/` et `.claude/`.
- Stack effective : **Next.js 16.2.4 (Turbopack)**, React 19.2.4, TypeScript 5, Tailwind 4, ESLint 9, App Router, `src/` directory, alias `@/*`.
- `package.json` renommé `teslamatefix`, ajouts : `description`, `license: MIT`, `engines.node >= 20`, script `typecheck`.
- `src/app/page.tsx` : démo Vercel remplacée par un placeholder simple.
- `src/app/layout.tsx` : metadata mise à jour (title `TeslaMateFix`).
- `CLAUDE.md` + `AGENTS.md` conservés (warning Next 16 : "This is NOT the Next.js you know").
- `npm run build` : ✅ (8.7s).

**Note** : `npm audit` signale 2 vulnérabilités modérées (`postcss <8.5.10` transitive via `next`). Le fix proposé downgrade Next à v9 — non applicable. Sera résolu par une release patch upstream.

---

## Étape 2 — Prisma + introspection de la base TeslaMate

**Commit** : `9236b14` — *feat(prisma): introspect TeslaMate database and ignore out-of-scope tables*

- Tentative initiale avec **Prisma 7.8.0** : la propriété `url` du `datasource` n'est plus supportée dans `schema.prisma`, il faut un `prisma.config.ts` et un `adapter` au runtime. Trop de churn pour de l'introspection seule + écosystème pas encore aligné.
- **Downgrade vers Prisma 6.19.3** (CLI + client). Connexion testée via `127.0.0.1:5432` (premier essai bash `/dev/tcp` failed, mais `nc` confirme la port joignable — fausse alerte du test bash).
- `prisma db pull` génère **13 modèles + 6 enums** dans `prisma/schema.prisma`.
- **Divergences détectées** par rapport au master TeslaMate (le snapshot DB est antérieur à septembre 2025) :
  - `tokens` est encore dans le schéma `public` (pas `private`) — quand même mis en `@@ignore`.
  - Pas de `cars.version` — la version firmware viendra uniquement de `updates.version`.
  - Pas de `settings.theme_mode` ; à la place une colonne `preferred_range` (enum `ideal|rated`).
  - `positions.date` et `(drive_id, date)` en btree (pas encore BRIN).
  - Colonnes texte en `varchar(255)` plutôt que `text`.
- `@@ignore` ajouté sur `tokens` (chiffrés Cloak) et `schema_migrations` (Ecto).
- `src/lib/db.ts` : singleton `PrismaClient` avec logs `query, error, warn` en dev.
- `.env.example` créé (DSN, AUTH_*, DEFAULT_LOCALE, LOG_LEVEL, READ_ONLY, PORT).
- `.gitignore` : exception `!.env.example`.
- `scripts/check-db.mjs` : smoke test compteur de lignes (exposé via `npm run db:check`).
- `package.json` : scripts `postinstall: prisma generate`, `db:pull`, `db:studio`, `db:check`.
- **Volumes mesurés** : 1 cars · 1 car_settings · 1 684 drives · **4 448 204 positions** · 161 charging_processes · 33 541 charges · 380 addresses · 18 geofences · 2 939 states · 17 updates · 1 settings.
- `npm run build` : ✅.

---
