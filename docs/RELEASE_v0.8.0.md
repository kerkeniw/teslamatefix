# Release v0.8.0 — checklist

> Document de suivi pour **TeslaMateFix v0.8.0**
> (« Durcissement sécurité, mise à jour des dépendances (CVE) + origine des positions dans le détail d'un trajet »).

## État

- Branche : `release/v0.8.0` (worktree `.claude/worktrees/release+v0.8.0`, `.env`
  symlinké, `node_modules` propre), partie de `main` (`f42f34e`), fusionnée en fast-forward et taggée `v0.8.0` le 2026-10-10.
- `package.json` version : `0.8.0`.
- Nature : **évolution** + **mise à jour des dépendances** (Next 16.4, Prisma 7, Node 24 dans l'image). Rebuild de l'image requis. Aucune migration de base.
  Trois variables d'environnement facultatives (`TRUST_PROXY`, `COOKIE_SECURE`,
  `COOKIE_SAMESITE`), toutes avec un défaut qui conserve le comportement actuel,
  sauf pour la limite de connexion (voir ci-dessous).

## 1. Durcissement sécurité

Source : [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) (revue du 2026-05-01 + addendum
v0.7.0). Détail par point dans l'addendum v0.8.0 de ce document.

| # | Correctif | Fichiers |
|---|---|---|
| v0.7 | **Correction de trajet recalculée côté serveur** : l'action d'application relance le calcul depuis le seul `driveId` et n'écrit que ce résultat ; si l'aperçu envoyé par le navigateur diffère (positions modifiées entre-temps, payload forgé), refus avec « relancez la correction ». Les positions absorbées sont celles du recalcul, pas celles du client. **Respecte désormais `READ_ONLY`** (décision : une écriture reste une écriture) | `drives/actions.ts` |
| L17 | Même principe pour le **recalcul d'une charge** depuis ses ticks | `charges/actions.ts` |
| — | Assistant de création de trajet : le trajet calculé renvoyé par le navigateur est validé (bornes plausibles, 20 000 positions max) avant insertion | `drives/actions.ts` |
| M5 | `TRUST_PROXY` : `X-Forwarded-For` / `X-Real-IP` ne sont lus que derrière un proxy de confiance (entrée la plus à droite de XFF). Sinon la limite de connexion est **globale** (5 essais / 5 min pour tous) | `lib/rate-limit.ts`, `login/actions.ts` |
| M6 | Limite de débit des écritures : 60 / min / utilisateur, sur toutes les server actions d'écriture | `lib/rate-limit.ts` + 10 fichiers `actions.ts` |
| M7 | `safeErr(e)` : plus aucun message Prisma (qui recopie les arguments : coordonnées, adresses) dans les journaux | `lib/logger.ts` + 15 fichiers |
| M8 | `npm run auth:hash` : saisie masquée | `scripts/hash-password.mjs` |
| M9 | Correction de trajet : 100 000 positions max, échec explicite au-delà ; contexte des ticks d'une charge borné | `lib/integrity/drives.ts`, `charges.ts` |
| M10 | Suppression de positions en lot : 1 000 max | `positions/actions.ts` |
| L11/12 | `COOKIE_SAMESITE=lax\|strict`, `COOKIE_SECURE=auto\|true\|false` | `lib/env.ts`, `lib/auth.ts`, `proxy.ts` |
| L14 | `rel="noopener noreferrer"` | `OsmLink.tsx` |
| L18 | `addresses.raw` : 64 Ko max | `addresses/actions.ts` |
| L21 | `Cache-Control: private, no-store` sur tout sauf les assets immuables et la clé publique Tesla | `next.config.ts` |

Reste ouvert : mise à jour de Next (≥ 16.3, corrige `postcss`), Prisma, iron-session
— à faire séparément avec une recette complète (cf. roadmap).

## 2. Origine des positions dans le détail d'un trajet

Référence : [`ORIGINE_POSITIONS.md`](ORIGINE_POSITIONS.md) et
[`INTEGRATION_TESLAMATEAPI.md`](INTEGRATION_TESLAMATEAPI.md).

- **Détection de TeslaMateAPI** (`src/lib/teslamateapi/capabilities.ts`) : requête de
  détection du document d'intégration, capacités par table, mémorisée 5 min,
  journalisée au démarrage (`src/instrumentation.ts`, non bloquant) et à chaque
  changement (`teslamateapi.detected`). Aucune erreur ni mention à l'écran si absent.
- **Classement** (`src/lib/positions/origin.ts`, `origin-query.ts`) :
  - avec les capacités `reconstructions` + `fill` : `vehicle_data`, `flux`,
    `flux_complete`, `d13` (+ type d'opération D13), par la requête du document,
    restreinte aux positions du trajet ;
  - sans : `vehicle_data` / `flux` par la signature des colonnes, avec la mention
    « détail indisponible sans TeslaMateAPI » ;
  - en cas d'échec de la requête `telemetry` : repli sur les colonnes, cache invalidé.
- **Écran d'édition d'un trajet** :
  - bandeau « Origine des positions » au-dessus des onglets : effectif et part de
    chaque origine, barre de répartition, avertissement si des positions sont
    reconstruites ou complétées (« à vérifier avant une correction manuelle ») ;
  - carte : nouveau mode **Colorer par › Origine** (une couleur par origine, points
    bleus pour les appels `vehicle_data` isolés dans le flux) avec légende ;
  - la carte n'est plus tronquée à 5 000 points (même source que le tableau,
    20 000 positions).

## 3. Tableau des positions d'un trajet (onglet Positions)

Remplace l'aperçu des 50 premières positions (`ChildrenPositionsTable`, supprimé).

- **Toutes les positions du trajet** (jusqu'à 20 000), paginées par 100 côté client.
- **Colonnes** : id (lien vers l'édition), heure à la seconde, **origine**,
  **Δt** et **Δd** avec la position précédente, lat/lon (lien OSM), puis les colonnes
  scalaires. Par défaut, celles remplies sur au moins 50 % des positions du trajet ;
  le menu « Colonnes » affiche le taux de remplissage de chacune, grise celles vides
  sur tout le trajet, et mémorise le choix (`drives.positions.columns`).
- **Bloc de filtres** (instantanés, compteur de filtres actifs, réinitialisation) :
  - origine (cases à cocher avec effectifs) ;
  - vitesse min/max, puissance min/max + raccourci « régénération seulement » ;
  - écart avec la précédente ≥ N s (trous de collecte) ;
  - saut avec la précédente ≥ N m (sauts GPS) ;
  - colonne vide (avec le nombre de positions concernées) — p. ex. altitude vide.
- Mesures sur la base restaurée (colonnes remplies par trajet) : sur un trajet en
  flux, seules vitesse, puissance, odomètre, altitude et SOC sont « généralement
  remplies » ; autonomies, températures, pneus et climatisation ne le sont que sur
  les 2 appels `vehicle_data`.

## 4. Mise à jour des dépendances (CVE)

Point de départ (`npm audit`, 2026-10-09) : 34 vulnérabilités dont 2 critiques, en
particulier **Next.js < 16.4.0 : contournement du Proxy (middleware)** — notre
authentification passe par `src/proxy.ts` — et DoS des Server Components ; plus
`sharp` (libvips/libheif/librsvg), `postcss`, `vite`/`vitest`, `proxy-addr`, `qs`…

| Paquet | Avant | Après | Remarques |
|---|---|---|---|
| next / eslint-config-next | 16.2.4 | **16.4.0** | Corrige les 2 failles critiques, `postcss` et `sharp`. Nouvel avertissement Turbopack sur `readFile` dynamique dans `api/tesla-public-key` : annotation `turbopackIgnore` (sinon tout le projet partait dans le standalone) |
| react / react-dom | 19.2.4 | 19.3.0 | |
| **prisma / @prisma/client** | 6.19.3 | **7.10.0** | Migration majeure, voir ci-dessous. Prisma 8 est en RC (8.0.0-rc.22, publié le 08/10) : pas en production |
| **iron-session** | 8.0.4 | **9.0.1** | ESM, Node ≥ 22.13 ; cookies v8 toujours valides (pas de déconnexion). `login()` déjà conforme (session neuve après `destroy()`). Nouveau : `onUnsealError` journalisé (`auth.session.rejected`) |
| **@tanstack/react-table** | 8.21.3 | **9.2.8** | `useTable` + `tableFeatures({ columnVisibilityFeature })`, type `AppColumnDef` dans `data-table.tsx` (8 fichiers de colonnes) |
| typescript | 5.9.3 | **6.0.3** | TypeScript 7 (natif Go) non retenu : `typescript-eslint` (lint de Next) exige `< 6.1` |
| eslint | 9.39.4 | 9.39.5 | ESLint 10 non retenu : `eslint-plugin-react`, `-import`, `-jsx-a11y` (via `eslint-config-next`) ne le supportent pas |
| vitest | 4.1.5 | **5.0.3** | Sans changement de config |
| @types/node | 20 | 24 | Aligné sur le runtime (Node 24), pas sur la 26 |
| Autres | | dernières | `@base-ui/react` 1.9, `next-intl` 4.14, `lucide-react` 1.54, `zod` 4.6, `pino` 10.4, `shadcn` 4.21, `tailwindcss` 4.3, `@playwright/test` 1.64… |
| `overrides` | `@swc/helpers` 0.5.15 | `mysql2` ^3.24.5, `deepmerge-ts` ^8.0.2 | L'incohérence de Next 16.2.4 sur `@swc/helpers` a disparu (Next 16.4 l'épingle à 0.5.23). Les deux nouveaux forcent les versions corrigées des dépendances de la CLI Prisma |
| `engines.node` | ≥ 20 | ≥ 22.13 | Minimum d'iron-session 9 |

**Prisma 7** :
- `prisma/schema.prisma` : générateur `prisma-client`, sortie `src/generated/prisma`
  (ignorée par git, ESLint et Docker ; régénérée par `postinstall` et dans l'image) ;
  plus d'`url` dans le `datasource`.
- `prisma.config.ts` : URL de la CLI, `.env` chargé par `process.loadEnvFile` (Prisma 7
  ne le lit plus), `generate` fonctionne sans `DATABASE_URL`.
- `src/lib/db.ts` : `PrismaClient({ adapter: new PrismaPg(...) })`, délai de connexion de
  5 s (comme Prisma 6 ; `pg` n'en a pas par défaut).
- Imports `@prisma/client` → `@/generated/prisma/client` (30 fichiers, `Prisma.Decimal`,
  `Prisma.sql` inchangés).
- Scripts `check-db`, `audit-pick`, `query-carrefour` (devenu `.mjs`) : `pg` direct, avec
  lecture UTC des `timestamp` ; `pg` ajouté en dépendance explicite.
- Vérifié sur la base restaurée : dates UTC identiques à Prisma 6, `Decimal`, paramètres
  tableau (`::int[]`), `bigint`, filtres de date ; origine des positions 2604 / 2621 / 2560
  identique aux mesures de `ORIGINE_POSITIONS.md` ; `prisma db pull --print` OK.

**Docker** : `node:24-bookworm-slim` (LTS active ; npm 11 comme en local), plus
d'OpenSSL ni de copie de `node_modules/.prisma` (plus de moteur Rust), `prisma.config.ts`
copié avant `npm ci`, `src/generated` exclu du contexte.

**Restant** (`npm audit`) : 9 « high » issues de `braces` (toutes versions, aucun
correctif publié) via `micromatch`/`fast-glob`, dans l'outillage de build uniquement
(`eslint-config-next`, CLI `shadcn`, `ts-morph`) — non présent dans l'image runtime,
motifs de glob jamais fournis par un utilisateur.

## 5. Retours du premier tour de recette (2026-10-10)

- **Onglet Positions d'un trajet** : le bandeau « Origine des positions » n'y est plus
  répété (il reste au-dessus des onglets). Les colonnes par défaut sont désormais
  calculées sur les positions **filtrées** : filtrer sur « Fleet API » affiche pneus,
  chauffage, dégivrage, clim, consignes et températures. Vérifié en base : les vraies
  positions `vehicle_data` ont toujours ces colonnes remplies ; seul l'affichage les
  masquait (2 positions sur 735 dans un trajet en flux, sous le seuil de 50 %).
- **Journaux Prisma** désactivés par défaut ; `PRISMA_LOG=query,warn,error` pour les
  réactiver (`src/lib/db.ts`).
- **Fleet API `dx/vehicles/options`** (photo du véhicule) : diagnostic en dev — jeton
  expiré le 09/10 à 17:45 UTC (base restaurée), Tesla répond 401, journal peu explicite
  noyé dans les requêtes Prisma. Désormais :
  - jeton expiré détecté **avant** l'appel : `tesla.token.expired` avec `expired_at`,
    `expired_since_min` et la cause probable, sans appel inutile à Tesla ;
  - erreurs HTTP explicites (`401` jeton refusé, `403` scope, `404` VIN / région, `412`
    enregistrement, `429` quota, `5xx`) avec l'URL de base et le corps de réponse Tesla ;
  - échec de déchiffrement : rappel de vérifier `TESLAMATE_ENCRYPTION_KEY` et l'échappement
    des `$` ;
  - avertissements répétés **toutes les 10 min** (`warnThrottled`) au lieu d'une seule
    fois par processus.
- **Liste des trajets** : plages rapides (comme Positions et Charges) et **synthèse de la
  période** comme le dashboard Grafana « Drives » : trajets, distance, durée, énergie
  consommée (net, Σ écart d'autonomie × efficacité) et Ø consommation (net) — vérifiée
  contre une requête SQL directe (septembre : 99 trajets, 577 km, 85,4 kWh, 148 Wh/km).
- **Hauteur des pages** :
  - `PageHeader` partagé (22 pages) : titre, `#id` et sous-titre sur une ligne en petite
    police, comme l'écran d'édition des charges ; actions (Colonnes, Nouveau, Comparer
    avec Tesla) à droite du titre ;
  - filtres des listes Trajets et Charges : 6 critères par ligne → 2 lignes, case
    « ouverts » et boutons dans la dernière cellule, Entrée applique les filtres ;
  - synthèse en une seule ligne (`SummaryBar`), marges réduites.
- Composants partagés : `QuickRangeSelect`, `ColumnsMenu`, `SummaryBar`, `PageHeader`.
- **Répertoire de travail `var/`** (`TMFIX_WORK_DIR`, défaut `var/` relatif au lancement :
  racine du projet en dev, `/app/var` dans l'image) : accueille les **imports Privacy
  Tesla** (`privacy-charging.json`). Non versionné, exclu du contexte Docker, non servi par
  le web. En production il peut être vidé à chaque rebuild : réimporter le CSV.
  - L'import échouait en dev : sans `TMFIX_SECRETS_DIR`, l'écriture visait `/data`, absent
    en local.
  - **`/data` est inchangé** (`TMFIX_SECRETS_DIR`, volume monté en production) : secrets
    bootstrappés et cache des options du véhicule. Une variable vide vaut désormais
    absente (défaut `/data`) au lieu de viser le répertoire courant.
  - Annotation `turbopackIgnore` sur la résolution du chemin, sinon Turbopack copiait
    `src/lib` dans la sortie standalone.

## Vérifications faites

- [x] `npm test` : 175/175 (nouveaux : `security.test.ts`, `drive-positions.test.ts`, `logs.test.ts`),
      aussi après la mise à jour des dépendances.
- [x] `npx tsc --noEmit`, `npx eslint` : 0 erreur, 0 avertissement.
- [x] `npx next build` (Next 16.4.0, sans avertissement).
- [x] `docker build -f docker/Dockerfile` (Node 24) puis conteneur jetable sur le réseau
      `teslamate_default` : démarrage, `teslamateapi.detected` (requête Prisma 7 OK),
      `/api/health`, en-têtes `Cache-Control: private, no-store` et `X-Frame-Options`.
- [x] Requête d'origine restreinte à un trajet, sur la base restaurée : trajet 2604 →
      851 `flux_complete`, 127 `EXTEND` + 20 `SPLIT` (`d13`), comme dans
      `ORIGINE_POSITIONS.md`.
- [ ] Rendu dans le navigateur (non fait : pas de serveur lancé depuis l'agent).

## Étapes manuelles

- [ ] Le worktree a désormais son **propre `node_modules`** (le symlink vers celui de
      `main` a été remplacé, pour ne pas casser `main` avec Prisma 7). Après le merge,
      dans le dépôt principal : `npm ci` (lance `prisma generate`).
- [ ] Recette sur la base locale restaurée : `npm run dev` **dans le worktree**
      `.claude/worktrees/release+v0.8.0` (plus toutes les pages : listes trajets /
      charges / états avec menu Colonnes — TanStack 9 —, connexion / déconnexion —
      iron-session 9 —, édition et enregistrement — Prisma 7) :
  - [ ] `/drives/2604` : bandeau 2 / 851 / 147, avertissement « reconstruites » ;
        carte › Origine ; onglet Positions, filtre `d13` → 147 lignes avec le type ;
  - [ ] `/drives/2621` : 733 flux + 2 Fleet API ; colonnes par défaut sans
        autonomies ni températures ; menu Colonnes → autonomies à 0 % environ ;
  - [ ] `/drives/2560` (septembre) : 20 Fleet API, toutes les colonnes remplies ;
  - [ ] filtres : `écart ≥ 30 s`, `saut ≥ 500 m`, « régénération seulement »,
        « colonne vide › Altitude » ;
  - [ ] base sans TeslaMateAPI (ou rôle sans droits sur `telemetry`) : mention
        « détail indisponible », seulement Fleet API / Flux, aucune erreur ;
  - [ ] « Corriger » un trajet : l'application fonctionne ; modifier une position
        entre l'aperçu et l'application → message « relancez la correction » ;
  - [ ] `READ_ONLY=true` : « Corriger » refuse désormais d'écrire ;
  - [ ] journaux (`teslamateapi.detected` au démarrage, pas de coordonnées dans
        les `*.error`).
- [ ] **Déploiement derrière un reverse proxy** : ajouter `TRUST_PROXY=true` au
      service TeslaMateFix (sinon la limite de connexion devient globale).
- [ ] Accès en **HTTP simple** avec `NODE_ENV=production` : `COOKIE_SECURE=false`.
- [x] Commit sur `release/v0.8.0`, merge fast-forward sur `main`, tag `v0.8.0`, push
      `main` + tag (2026-10-10, publication Docker Hub par GitHub Actions).
- [ ] Vérifier le workflow GitHub Actions puis
      `docker manifest inspect wkerkeni/teslamatefix:0.8.0` (amd64 + arm64).
- [ ] Dans le dépôt principal : `npm ci` (Prisma 7 : génère `src/generated/prisma`).
- [ ] Production : réimporter le CSV Privacy après mise à jour (les imports passent de
      `/data` au répertoire de travail `var/`, vide dans la nouvelle image).
- [ ] Nettoyage : worktree `.claude/worktrees/release+v0.8.0` et branche `release/v0.8.0`.
