# Release v0.2.0 — checklist

> Document de suivi pour la mise en production de **TeslaMateFix v0.2.0**
> (« zero-config grand public »). Cocher les cases au fur et à mesure.
> Garder ce doc dans le repo : il sert aussi de procédure type pour les
> futures releases.

## État actuel

- Branche : `feat/public-zero-config` (poussée sur `origin`).
- Commit feature : `06c51d7 feat(auth)!: bootstrap "grand public" zero-config (v0.2.0)`.
- `package.json` version : `0.2.0`.
- Tests : 72 verts.
- Tag v0.2.0 : **non créé** (en attente de la validation container locale).

## Bugs résolus

- [x] **`npm ci` échoue dans le container** (fix `a55b095`) :
      `overrides.@swc/helpers = "0.5.15"` ajouté à `package.json` +
      lock régénéré. Build container local OK.
- [x] **`next build` échoue sur AUTH_SECRET au stage builder**
      (fix `0fcf34f`) : placeholders `AUTH_SECRET` + `DATABASE_URL`
      ajoutés au stage builder du Dockerfile (multi-stage isolation,
      le runner n'hérite pas).
- [x] **Boucle redirect `/change-password`** : la server action
      `changePasswordAction` était interceptée par `requireSession()`
      avant d'écrire le nouveau hash. Fix : opt-in
      `{ skipPasswordChangeRedirect: true }` (commit `eb2e321`).
- [x] **Workflow GHA échoue au login Docker Hub** : les secrets étaient
      stockés dans un environment GitHub `DockerHub` mais le job ne
      le déclarait pas, donc `${{ secrets.* }}` lisait les repo secrets
      (vides). Fix : ajout de `environment: DockerHub` au job.

## Avant le tag

- [x] Fixer le bug `@swc/helpers` (commit `a55b095`).
- [x] Fixer le bug AUTH_SECRET au build (commit `0fcf34f`).
- [x] Fixer la boucle redirect dans `changePasswordAction` (commit `eb2e321`).
- [x] Re-build local du container OK.
- [x] **Test container end-to-end OK** (validé manuellement) :
      - Container démarre sans erreur, bootstrap des 4 fichiers dans /data.
      - Login `admin`/`admin` → redirection vers `/change-password`.
      - Saisie d'un nouveau mot de passe → flag supprimé, hash rotaté,
        redirection vers le dashboard.
      - Persistance après redémarrage validée.

## Merge + tag + push

- [ ] `git switch main`
- [ ] `git merge --no-ff feat/public-zero-config -m "release: v0.2.0 — zero-config grand public"`
- [ ] `git tag -a v0.2.0 -m "v0.2.0 — bootstrap grand public..."`
- [ ] `git push origin main`
- [ ] `git push origin v0.2.0`  ← déclenche le workflow GHA Docker Hub.

## Post-push GitHub Actions

- [ ] Vérifier le workflow sur https://github.com/kerkeniw/teslamatefix/actions
      (run `docker-publish.yml` sur tag `v0.2.0`).
- [ ] Si le workflow échoue au step `Login to Docker Hub` → vérifier les
      secrets repo (Settings → Secrets and variables → Actions) :
      - `DOCKERHUB_USERNAME` = `wkerkeni`
      - `DOCKERHUB_TOKEN` = access token créé sur
        https://hub.docker.com/settings/security
        (scope `read,write,delete` sur le repo `teslamatefix`).
- [ ] Re-déclencher si nécessaire :
      ```bash
      git tag -d v0.2.0
      git push --delete origin v0.2.0
      git tag -a v0.2.0 -m "..."
      git push origin v0.2.0
      ```

## Vérification image publiée

- [ ] `docker manifest inspect wkerkeni/teslamatefix:0.2.0`
      → 2 manifests (linux/amd64 + linux/arm64).
- [ ] `docker pull wkerkeni/teslamatefix:0.2.0` réussit.
- [ ] Tester sur machine prod (ou un compose minimal séparé) :
      compose minimal + `docker compose up` → login `admin`/`admin` → change pwd → OK.

## Configuration GitHub (one-shot)

À ne faire qu'**une fois**, idéalement avant le premier tag :

- [ ] Sur GitHub Settings → Branches → **Default branch** : changer
      `feat/cockpit-design` → `main`. (Actuellement la HEAD du remote
      pointe encore sur l'ancienne branche.)
- [ ] Vérifier la visibilité du repo (public si on veut que les utilisateurs
      grand public puissent forker / contribuer).
- [ ] Optionnel : ajouter une description de repo, des topics
      (`tesla`, `teslamate`, `nextjs`, `docker`), un site web.
