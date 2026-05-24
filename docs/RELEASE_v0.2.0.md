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

## Bug ouvert — à fixer avant tag

- [ ] **`npm ci` échoue dans le container** : conflit Next 16.2.4 entre
      `dependencies.@swc/helpers = "0.5.15"` (épinglé) et
      `peerDependencies.@swc/helpers = ">=0.5.17"` (optionnel).
      Le `npm` du container veut résoudre le peer et installer 0.5.21
      en plus, ce qui manque au lock.
      Fix proposé (à valider) : ajouter une `overrides` dans `package.json` :
      ```json
      "overrides": { "@swc/helpers": "0.5.15" }
      ```
      Puis `npm install` pour régénérer le lock, commit, re-build.
      *Alternative légère* : passer `--legacy-peer-deps` au `npm ci` du
      Dockerfile (moins propre car ça désactive globalement la validation
      des peers).

## Avant le tag

- [ ] Fixer le bug `@swc/helpers` ci-dessus.
- [ ] Re-build local du container :
      ```bash
      ./scripts/docker-publish.sh v0.2.0          # build amd64, charge dans le daemon
      docker images wkerkeni/teslamatefix         # vérifier la présence
      ```
- [ ] **Test container end-to-end** :
      ```bash
      docker run --rm -p 3001:3001 -v tmfix-data:/data \
        -e DATABASE_URL="postgresql://teslamate:<pass>@host.docker.internal:5432/teslamate" \
        wkerkeni/teslamatefix:0.2.0
      ```
      - [ ] Container démarre sans erreur (regarder les logs entrypoint).
      - [ ] `docker exec <id> ls -la /data` → 4 fichiers présents
            (`auth_secret`, `username`, `password_hash`, `force_password_change`),
            mode 600, owner `node`.
      - [ ] Ouvrir `http://localhost:3001/login`, login `admin` / `admin`.
      - [ ] Redirigé vers `/fr/change-password` (ou `/en/change-password`).
      - [ ] Saisir mauvais ancien mot de passe → message d'erreur.
      - [ ] Saisir nouveau mot de passe valide (≥ 12 chars + lettre + chiffre) →
            redirection vers `/`, dashboard accessible.
      - [ ] `docker exec <id> ls /data` → `force_password_change` disparu,
            `password_hash` modifié.
      - [ ] `docker restart` → mot de passe persistant.

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
