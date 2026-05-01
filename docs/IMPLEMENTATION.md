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
