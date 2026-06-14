# Release v0.5.0 — checklist

> Document de suivi pour la mise en production de **TeslaMateFix v0.5.0**
> (« Fleet API : TeslaMateFix sert la clé publique Tesla + guide migration »).

## État

- Branche : `main` (commit + tag directement, pas de branche dédiée).
- `package.json` version : `0.5.0`.
- Tests : voir `npm test` (vitest).
- Typecheck : propre.
- Lint : 3 issues pré-existantes inchangées (data-table TanStack `useReactTable`,
  `ChargeCreateWizard:585`, `_ignored` dans `actions.ts`).
- Build : `next build` OK (valide la regex du rewrite `.well-known`).

## Contexte

Tesla a coupé `owner-api.teslamotors.com` pour les particuliers (~12 juin 2026,
`403 forbidden, see developer.tesla.com/docs/fleet-api`). TeslaMate ne collecte
plus rien sans migration vers la **Fleet API native** (TeslaMate ≥ 4.0.0).

La Fleet API impose d'héberger une clé publique EC sur le domaine de
l'application, à l'URL exacte :

```
https://<DOMAIN>/.well-known/appspecific/com.tesla.3p.public-key.pem
```

Cette release permet à **TeslaMateFix de servir lui-même** ce fichier, sans
monter de service web statique dédié.

## Périmètre validé

Inchangé depuis v0.3.0 : seuls **création + édition d'une charge** sont validés.
Les autres entités restent en consultation. v0.5.0 est une **feature
infra/ops** (support de migration Fleet API), sans extension du scope d'édition.

## Nouveauté — serving de la clé publique Tesla

- **`src/app/api/tesla-public-key/route.ts`** *(nouveau)* — route handler
  (`export const dynamic = "force-dynamic"`) qui lit le fichier pointé par
  `TESLA_PUBLIC_KEY_FILE` (défaut `/well-known/com.tesla.3p.public-key.pem`) et
  le renvoie en `application/x-pem-file`. `404` si absent/illisible (log
  `tesla.public_key.read_error`). Lecture à chaud → rotation sans rebuild.
- **`next.config.ts`** — `rewrites()` mappant
  `/.well-known/appspecific/com.tesla.3p.public-key.pem` → `/api/tesla-public-key`.
  Les points littéraux sont échappés (`\\.`) car `source` est interprété en
  path-to-regexp (cf. doc Next 16 embarquée).
- **`src/proxy.ts`** — `/api/tesla-public-key` ajoutée à l'allowlist publique
  (à côté de `/api/health`) : Tesla doit lire le fichier sans session. Le chemin
  `.well-known` est de toute façon hors du matcher du proxy (exclusion des
  chemins contenant un point) → pas d'auth.
- **`docker/Dockerfile`** — `mkdir -p /well-known` (chown `node`) +
  `ENV TESLA_PUBLIC_KEY_FILE=/well-known/com.tesla.3p.public-key.pem`.
- **`docker/docker-compose.example.yml`** — montage
  `./tesla-well-known:/well-known:ro` + rappel de la variable d'env.

## Guide opérationnel

Migration complète Owner API → Fleet API (app Tesla Developer, clés EC,
enregistrement de domaine, tokens utilisateur `access`+`refresh`,
reconfiguration TeslaMate) dans **`docs/FLEET_API_MIGRATION.md`** (9 étapes).

Pièges documentés :
- Le token `client_credentials` (enregistrement domaine) **n'a jamais** de
  refresh token ; le token TeslaMate vient du flux **Authorization Code** avec
  scope **`offline_access`** obligatoire.
- **`tesla_auth`** (adriankumpf) **ne convient pas** : login SSO Owner API
  uniquement → token d'audience Owner API (403). Préférer le flux curl ou le
  script local `MyTeslaMate/tesla-fleet-api-tokens`.
- **Se déconnecter** dans TeslaMate pour que les variables `TESLA_*` soient relues.

## Commit + tag + push

- [ ] `git add` ciblé (sans les PNG Playwright, ignorés via `.gitignore`)
- [ ] `git commit -m "release: v0.5.0 — Fleet API : TeslaMateFix sert la clé publique Tesla + guide migration"`
- [ ] `git tag -a v0.5.0 -m "v0.5.0 — Fleet API migration"`
- [ ] `git push origin main`
- [ ] `git push origin v0.5.0` ← déclenche `docker-publish`

## Post-push GitHub Actions

- [ ] Vérifier le workflow sur https://github.com/kerkeniw/teslamatefix/actions
      (déclenché par le push du tag `v0.5.0`).
- [ ] `docker manifest inspect wkerkeni/teslamatefix:0.5.0` → 2 manifests
      (linux/amd64 + linux/arm64).
- [ ] `docker pull wkerkeni/teslamatefix:0.5.0` réussit.

## Étapes manuelles

- [ ] Copier-coller `docker/README-DOCKERHUB.md` sur la page Docker Hub
      `wkerkeni/teslamatefix` (overview + full description). La version
      mentionnée est `v0.5.0`, la section Tags liste `0.5.0`.

## Vérification fonctionnelle

- [ ] Déposer la clé : `mkdir -p ./tesla-well-known && cp public-key.pem
      ./tesla-well-known/com.tesla.3p.public-key.pem`.
- [ ] `docker compose up -d teslamatefix`.
- [ ] Depuis l'hôte/container :
      `curl -i http://127.0.0.1:3001/.well-known/appspecific/com.tesla.3p.public-key.pem`
      → `200` + contenu PEM (pas de redirection vers `/login`).
- [ ] Via le domaine public :
      `curl -i https://<DOMAIN>/.well-known/appspecific/com.tesla.3p.public-key.pem`
      → `200` + PEM (HTTPS valide), prérequis à l'enregistrement partner Tesla.
- [ ] Fichier absent → la route renvoie bien `404`.
