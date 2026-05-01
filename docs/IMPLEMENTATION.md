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

## Étape 3 — Auth iron-session + login + middleware

**Commit** : `4f85925` — *feat(auth): iron-session + login flow + proxy middleware*

- Lecture des docs Next 16 livrées dans `node_modules/next/dist/docs/` (suite au warning de `AGENTS.md`). Deux changements structurants :
  - **`middleware.ts` → `proxy.ts`** : runtime nodejs (plus d'edge), nouveau nom de fichier et de fonction.
  - **`cookies()`, `headers()`, `params`, `searchParams`** sont **async** — partout, plus de sync.
- `src/lib/env.ts` : validation au chargement, `AUTH_SECRET` ≥ 32 caractères, fail-fast explicite.
- `src/lib/auth.ts` : iron-session (cookie `teslamatefix_session`, httpOnly, sameSite=lax, secure en prod, TTL 7j). `verifyCredentials` compare bcrypt même quand le username ne correspond pas (timing constant).
- `src/lib/rate-limit.ts` : LRU in-memory, **5 tentatives / 5 min / IP** sur `/login`. `clientIp()` lit `x-forwarded-for` puis `x-real-ip` puis fallback `unknown`.
- `src/lib/logger.ts` : pino structuré (sera complété en step 10 pour les mutations CRUD).
- `src/proxy.ts` : redirection vers `/login?from=…` pour toute route non-authentifiée, sauf `/login` et `/api/health`. Matcher exclut les assets statiques.
- `src/app/login/page.tsx` + `login-form.tsx` (client, `useActionState`) + `actions.ts` (server action Zod-validée + rate limit + audit).
- `src/app/api/auth/logout/route.ts` : POST, détruit la session puis redirige vers `/login`.
- `src/app/api/health/route.ts` : 200 JSON sans accès DB.
- Home page (`/`) protégée par `requireSession()` ; affiche l'utilisateur connecté + bouton logout.
- `scripts/hash-password.mjs` exposé via `npm run auth:hash`.
- `.env` peuplé avec des credentials de dev (`admin`/`admin`) + `AUTH_SECRET` généré via `openssl rand -base64 32` ; gitignored.
- Build : ✅.

---

## Étape 4 — Layout, thème Tesla, composants UI partagés

**Commit** : `1546f74` — *feat(ui): shadcn shell + Tesla theme + shared form/table components*

- `npx shadcn@latest init -d` (preset `base-nova` → composants bâtis sur **`@base-ui/react`** et non Radix). Memory `feedback_shadcn_base_ui.md` ajoutée pour ne plus se faire piéger par l'API `render` au lieu d'`asChild`.
- Composants shadcn ajoutés : button, card, input, label, select, dialog, alert-dialog, badge, separator, table, tabs, sheet, skeleton, sonner, tooltip.
- `TooltipProvider` + `Toaster` (sonner) dans le root layout (sera déplacé en step 5 sous `[locale]/layout.tsx`).
- `src/app/globals.css` : surcharge `--primary` à `oklch(0.585 0.224 25.7)` (= `#E31937`), expose `--tesla-red` et `--tesla-red-hover` comme tokens `@theme` (utilisables en `bg-tesla-red`, `text-tesla-red`).
- App shell (réutilisable par toutes les entités) :
  - `components/app-shell/header.tsx` — sticky header (Logo + slot droit + form logout).
  - `components/app-shell/main-nav.tsx` — barre horizontale des 9 entités, surlignée en rouge Tesla sur la route active.
- Tesla branding :
  - `components/tesla/logo.tsx` — wordmark + glyphe éclair rouge.
  - `components/tesla/firmware-link.tsx` — lien sortant vers les release notes notateslaapp pour une version donnée.
  - `components/tesla/confirm-dialog.tsx` — wrapper `AlertDialog` avec état pending. **Utilise `render={trigger}`** (base-ui) au lieu d'`asChild` (Radix).
- Helpers form :
  - `components/form/form-field.tsx` — Label + child + hint/error.
  - `components/form/number-input.tsx` — `<Input type="number">` typé.
  - `components/form/datetime-input.tsx` — `<Input type="datetime-local">` avec sérialisation ISO locale.
- DataTable :
  - `components/data-table/data-table.tsx` — wrapper TanStack Table 8.x avec skeleton de chargement. Pagination/tri/filtres serveur attendus côté URL.
  - `components/data-table/pagination.tsx` — pagination offset basée sur `?page=&pageSize=` (cursor variant à ajouter pour positions/charges au step 8).
- `src/lib/firmware.ts` — `buildReleaseNotesUrl(version)` (source unique de l'URL notateslaapp).
- `src/lib/utils.ts` (créé par shadcn) — helper `cn`.
- Build : ✅.

---

## Étape 5 — i18n next-intl FR/EN

**Commit** : `0880ff8` — *feat(i18n): next-intl FR/EN with locale-aware routing and locale switcher*

- next-intl 4.11.0 installé.
- `src/i18n/routing.ts` : locales `['fr','en']`, default `fr`, `localePrefix: 'as-needed'` (l'URL `/drives` reste `/drives` pour le français, `/en/drives` est l'override explicite).
- `src/i18n/request.ts` : resolver `getRequestConfig` qui charge `messages/<locale>.json`.
- `src/i18n/navigation.ts` : `Link`, `redirect`, `usePathname`, `useRouter`, `getPathname` locale-aware (réexports `createNavigation(routing)`).
- `next.config.ts` : wrap avec `createNextIntlPlugin('./src/i18n/request.ts')` ; `output: 'standalone'` ajouté pour le Docker.
- `src/messages/fr.json` + `en.json` — sections `common`, `auth`, `nav`, `dashboard`. Les agents d'entités ajouteront leurs propres sections.
- **Restructure `src/app/`** :
  - `src/app/[locale]/layout.tsx` (auparavant `src/app/layout.tsx`) — `setRequestLocale`, `hasLocale` + `notFound()` pour locale invalide, `NextIntlClientProvider` au-dessus de `TooltipProvider`/`Toaster`.
  - `src/app/[locale]/page.tsx` — home traduite.
  - `src/app/[locale]/login/*` (page, login-form, actions) — utilisent `getTranslations`/`useTranslations`.
  - `src/app/api/*` reste à la racine (pas de locale).
  - `src/app/globals.css` reste à la racine.
- `src/proxy.ts` chaîne désormais auth + intl :
  1. `/api/health` → public.
  2. autres `/api/*` → 401 si pas de session.
  3. `/(<locale>/)login` → passe directement par `intlMiddleware`.
  4. autres routes UI → vérifie session, sinon redirige `/login?from=…`, sinon `intlMiddleware`.
- `LocaleSwitcher` (FR/EN) intégré dans le header via `rightSlot`.
- `MainNav` réécrit avec `Link` locale-aware + `useTranslations('nav')`.
- Build : ✅ — routes générées : `/[locale]`, `/[locale]/login`, `/api/auth/logout`, `/api/health`.

---

## Étape 6 — Entités simples (addresses, geofences, updates)

**Commit** : `cdfe99e` — *feat(entities): step 6 — addresses/geofences/updates CRUD*

Délégué à un sub-agent en foreground (~18 min). Brief : `~/.claude/plans/...md` + références aux patrons existants. **Aucune touche aux fichiers fondateurs.**

- `addresses` : recherche ILIKE serveur sur `display_name`/`road`/`city`/`country`, sections Identité/Localisation/OSM (read-only)/Raw avec validation `JSON.parse` client+serveur. `Prisma.DbNull` pour les nuls JSON. Confirm dialog avec décompte des drives + charging_processes qui passeront en SET NULL.
- `geofences` : cartes (volume = dizaines), sections Identité/Localisation/Tarification, billing_type Select.
- `updates` : tableau chronologique avec `<FirmwareLink>`, badge "ongoing" si `end_date IS NULL`. Le CHECK Postgres `end_date >= start_date` arrive en `PrismaClientUnknownRequestError` — fallback regex `/check constraint/i`.
- Chaque action : `env.READ_ONLY` bloque, Zod valide, `logger.info({event, user, id, diff_keys})`, retour `{ok}` discriminé, P2002/P2025 mappés clean.
- `Decimal`/`BigInt` stringifiés à la frontière server→client.
- `messages/fr.json` + `en.json` étendus : `addresses`, `geofences`, `updates` + extensions `common` (saving/deleting/saved/deleted/etc.).
- Build & typecheck ✅. Aucune nouvelle dep.

---

## Étape 7 — Entités véhicule & système (cars, settings, states)

**Commit** : `6d3c1de` — *feat(entities): step 7 — cars/settings/states with integrity rules*

Délégué à un sub-agent en foreground (~22 min).

- `cars` : redirige automatiquement vers `/cars/[id]` quand une seule voiture (cas TeslaMate). Tabs `Véhicule` / `Réglages`. `prisma.$transaction([carUpdate, carSettingsUpdate])` pour l'atomicité. `eid`/`vid`/`vin` désactivés en édition (changer ces ids casserait l'OAuth binding). **Pas de delete par design** (cascade catastrophique). Pas de `/cars/new` (créés par TeslaMate via OAuth).
- `settings` : page unique sans liste/[id]/new. Règle codifiée dans `src/lib/integrity/settings.ts` → `updateSettings()` ne fait que `prisma.settings.update({where:{id:1}})`. INSERT structurellement impossible.
- `states` : timeline desktop + table mobile, `StateBadge` avec couleur par enum, `formatDuration`. Règle dans `src/lib/integrity/states.ts` → `closePreviousOpenState(carId, newStartDate, tx?)`. Quand on crée un état ouvert et qu'un autre est déjà ouvert pour le même `car_id`, l'UI propose une checkbox "fermer le précédent" qui déclenche un `$transaction([closePrev, createNew])`. CHECK `end_date >= start_date` validé Zod + fallback Prisma.
- Server actions retournent des **clés i18n** (ex `errors.openStateExists`) plutôt que des strings traduits — le client `useTranslations` les résout. Plus propre que de threader `getTranslations` dans chaque action.
- `messages/fr.json` + `en.json` : sections `cars`, `settings`, `states`.
- Build & typecheck ✅. Aucune nouvelle dep.

---

## Étape 8 — Entités cœur métier (drives, charges, positions)

**Commit** : `9b0cea2` — *feat(entities): step 8 — drives/charges/positions with recalc and cursor pagination*

Délégué à un sub-agent en foreground (~35 min — la plus grosse étape).

- `drives` : 3 onglets `Trajet` / `Positions` / `Recalcul`. `src/lib/integrity/drives.ts` → `recalcFromPositions()` Haversine cumulé, ascent/descent (deltas signés sommés en absolu), `(end-start)/60000` pour duration_min. Bornes par l'index `positions_drive_id_date_index`. Filtres liste : car_id, range date, "ouverts uniquement".
- `charges` : 3 onglets `Session` / `Mesures` / `Recalcul`. `src/lib/integrity/charges.ts` → `recalcFromTicks()` via `prisma.aggregate` (MIN/MAX date + MAX énergie) + premier/dernier tick pour SOC. Pagination cursor scopée par tab (`?tcursor/tdir/tps` pour ne pas écraser les params session). AC/DC dérivé via une requête bornée à la page courante (jamais de scan complet sur 33k+ ticks). Suppression unitaire d'un tick ne touche PAS le parent (recalc explicite requis).
- `positions` (4.4M lignes) : **filtre obligatoire** côté UI — soit `drive_id`, soit `(car_id + plage ≤ 31 jours)`. Sans filtre, placeholder + return early serveur. Pagination cursor par id (lecture pageSize+1 pour détecter la page suivante), tri date desc. FK Selects bornés à 200 lignes ; si l'id courant n'y est pas, `unshift` en tête. Suppression bulk refuse les positions référencées par `charging_processes.position_id` (FK NOT NULL). Lien sortant vers OSM, pas de carte intégrée.
- `src/components/data-table/cursor-pagination.tsx` créé (composant partagé avec param de cursor configurable).
- `messages/fr.json` + `en.json` : sections `drives`, `charges`, `positions`.
- Build & typecheck ✅. Aucune nouvelle dep.

---

## Étape 9 — Dashboard avec FirmwareLink et anomalies

**Commit** : `edcf985` — *feat(dashboard): step 9 — vehicle status, firmware widget, anomalies*

Codé moi-même (intégrative, point d'entrée visuel).

- `src/lib/dashboard.ts` → `getDashboardData()` : tous les `await` en parallèle via `Promise.all` — un seul aller-retour vers Postgres (statut, firmware, dernier drive, dernière charge, comptes du mois, 3 familles d'anomalies).
- `src/components/dashboard/dashboard.tsx` :
  - Header card : marketing/model + nom + 6 derniers chars du VIN, état courant (online/offline/asleep) avec helper `timeSince`, version firmware via `<FirmwareLink>` (lien sortant vers `notateslaapp.com/.../version/<v>/release-notes`).
  - Quick actions : 4 cartes — Dernière charge, Dernier drive (chacune liée à `/charges/[id]` ou `/drives/[id]`), Nouvelle charge, Nouveau drive (vers `/.../new`).
  - Summary card : drives ce mois + charges ce mois, liens vers les listes.
  - Anomalies : drives ouverts > 24h, charging_processes ouverts > 24h, états ouverts > 7j. Chaque ligne est un Link vers la page d'édition. Section masquée si aucune anomalie.
- `messages/fr.json` + `en.json` : section `dashboard` étendue (statusLabel, quickActions, newChargeHint/newDriveHint, edit, create, drivesThisMonth, chargesThisMonth, openSince).
- Build ✅. Mobile-first : cartes empilées sur mobile, grille à 4 colonnes desktop.

---

## Étape 10 — Logger pino + healthcheck + READ_ONLY

**Commit** : `ee689f1` — *feat(observability): step 10 — audit helper + /api/health/db + READ_ONLY audit*

La majorité de la surface était déjà en place (logger pino, env.READ_ONLY, /api/health). Cette étape consolide :

- `src/lib/logger.ts` : commentaire de contrat d'audit + helper `audit({event, user, id, diff, meta})` standardisant la forme. Les actions existantes continuent d'appeler `logger.info` directement (pas de churn) ; ce helper est la voie recommandée pour les nouvelles.
- `src/app/api/health/db/route.ts` : ping Postgres via `prisma.$queryRaw\`SELECT 1\`` — 200 si OK, 503 sinon. À la différence de `/api/health` qui reste DB-free (liveness), `/api/health/db` est la readiness (compose/k8s).
- `src/proxy.ts` : `/api/health/db` ajouté à l'allowlist publique.
- Audit `READ_ONLY` confirmé sur les 9 entités (grep cohérent : tous les actions de mutation testent `env.READ_ONLY` avant la moindre opération DB).

---

## Étape 11 — Dockerfile, compose example, docs FR/EN

**Commit** : `f99741a` — *feat(docker): step 11 — Dockerfile, compose example, docs FR/EN*

Délégué à un sub-agent en background — interrompu par un plafond d'usage avant la fin (a livré Dockerfile + compose + INSTALL FR/EN + script SQL + .dockerignore mais pas INTEGRATION_TESLAMATE.md ni le README). J'ai complété moi-même la doc d'intégration et le README.

- `docker/Dockerfile` : multi-stage `deps → builder → runner` sur `node:22-alpine`. Builder lance `prisma generate` + `next build` (Turbopack standalone). Runner copie `.next/standalone` + `.next/static` + `public` + le client Prisma (.prisma/client + @prisma/client + libquery_engine). USER node, EXPOSE 3001, HEALTHCHECK `/api/health`. Cache mount BuildKit sur `npm ci`.
- `docker/docker-compose.example.yml` : bloc service à coller dans le compose TeslaMate, avec `depends_on: database` + healthcheck wired.
- `docker/init-teslamatefix-user.sql` : crée un user PG `teslamatefix` avec uniquement SELECT/INSERT/UPDATE/DELETE sur les 11 tables métier nommées explicitement, USAGE sur `public`, USAGE+SELECT sur les sequences. **Aucun grant** sur `tokens`, `schema_migrations`, ni le futur schéma `private`. Le mot de passe est passé via `psql -v tmfix_password=…`.
- `docs/INSTALL.md` (FR) + `docs/INSTALL.en.md` (EN) : prérequis, génération bcrypt + AUTH_SECRET, SQL user bootstrap, snippet compose, premier login + hardening, mise à jour de l'image.
- `docs/INTEGRATION_TESLAMATE.md` (FR) : procédure pg_dump, diff before/after du compose, snippets reverse-proxy nginx + Caddy (avec `X-Forwarded-{For,Proto}` propagés pour le rate limit + le cookie Secure), FAQ (mode lecture seule, rotation mdp, sans-Docker, "et si je casse la base").
- `README.md` : remplacé le default create-next-app par un README orienté projet (pitch, stack, dev quickstart, Docker prod pointer, tests, sécurité, plan/journal, MIT).

---

## Étape 12 — Tests Vitest + Playwright

**Commit** : `d6818c2` — *test: step 12 — Vitest unit tests on integrity rules + Playwright e2e*

Délégué à un sub-agent en background, en parallèle de l'étape 11 — interrompu par le même plafond d'usage avant la fin de Playwright. L'agent a livré Vitest config + 4 fichiers de tests unitaires + scripts npm et installé les deps. J'ai complété `playwright.config.ts` + le test e2e + l'entrée `.gitignore`.

- `vitest.config.ts` + 20 tests sur `src/lib/integrity/*` (tous verts) :
  - **drives** (9 tests) : Haversine sur triangle connu, single-position, positions identiques, ascent/descent (deltas signés), duration_min, speed_max, return safe sans position.
  - **charges** (4 tests) : MAX charge_energy_added, MIN/MAX battery_level (SOC bornes), duration via premier/dernier tick, return safe sans tick.
  - **states** (4 tests) : `closePreviousOpenState` — pas d'état ouvert → null, ouvert avant new start → ferme à `start-1s`, ouvert après → throw, transaction client wired.
  - **settings** (3 tests) : `updateSettings` n'appelle que `prisma.settings.update({where:{id:1}})`, jamais `.create` ni `.upsert`.
- Refactor mineur de `src/lib/integrity/drives.ts` : Haversine + ascent/descent reducer extraits en fonctions pures exportées (testables sans fixture Prisma). Pas de changement de comportement.
- `playwright.config.ts` : chromium uniquement, retries=2 en CI, `webServer: npm run start` qui attend `/api/health`. `E2E_BASE_URL` pour pointer une instance déjà déployée.
- `e2e/login-edit-drive.spec.ts` : anonyme → /login → soumet creds → dashboard rendu → clique "Modifier" sur le dernier drive (skip si vide) → logout → /login. Non-destructif.
- npm scripts : `test`, `test:watch`, `test:e2e`. Variables `E2E_USERNAME`/`E2E_PASSWORD` (défaut `admin/admin`).
- `.gitignore` étendu : `/test-results`, `/playwright-report`, `/playwright/.cache`.

---

## Synthèse — état final

| Critère | Statut |
|---|---|
| Build (`npm run build`) | ✅ |
| Typecheck (`npm run typecheck`) | ✅ |
| Tests unit (`npm run test`) | ✅ 20/20 |
| 9 entités CRUD livrées | ✅ |
| 4 règles d'intégrité dans `lib/integrity/` | ✅ |
| Dashboard avec firmware + anomalies | ✅ |
| i18n FR/EN | ✅ |
| Docker image + compose example + docs | ✅ |
| Routes générées | 26 routes (1 home, 8 entités liste/[id]/new, 1 settings, 4 routes API) |

**Architecture par entité métier confirmée** : aucune route `tables/[table]` générique. Chaque entité a son dossier `app/[locale]/<entity>/` + `components/entities/<entity>/` + (le cas échéant) `lib/integrity/<entity>.ts`.

**Sécurité au design** : auth obligatoire (cookie chiffré iron-session), rate limit login, mode `READ_ONLY`, recommandation user PG dédié sans grant sur tokens/schema_migrations.
