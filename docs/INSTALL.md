# Installation — TeslaMateFix

> Guide d'installation pour ajouter TeslaMateFix à une stack TeslaMate
> existante via Docker Compose.
> Version anglaise : [`INSTALL.en.md`](./INSTALL.en.md).

## 1. Installation rapide (zero-config)

Pré-requis : une stack [TeslaMate](https://github.com/teslamate-org/teslamate) opérationnelle, déployée via `docker compose` (services `teslamate`, `database`, `grafana`, `mosquitto`), Docker Engine ≥ 24 et `docker compose` v2.

> **Sauvegarde recommandée.** Avant la première utilisation, faire un `pg_dump` complet de la base TeslaMate — voir [`INTEGRATION_TESLAMATE.md`](./INTEGRATION_TESLAMATE.md#sauvegarde-postgres-recommandée).

Coller le bloc [`docker/docker-compose.example.yml`](../docker/docker-compose.example.yml) dans votre `docker-compose.yml`, puis :

```bash
docker compose up -d teslamatefix
```

Aucune variable d'env spécifique à TeslaMateFix n'est requise : l'image réutilise `DATABASE_USER` / `DATABASE_PASS` / `DATABASE_NAME` du compose TeslaMate pour assembler le DSN, et bootstrappe ses secrets internes (clé de session, hash bcrypt par défaut) dans un volume nommé `teslamatefix-data`.

## 2. Premier login

1. Ouvrir `http://<host>:3001` (ou l'URL HTTPS du reverse-proxy).
2. Login : **`admin`** / **`admin`**.
3. L'application redirige automatiquement vers `/change-password` (pattern Grafana) : choisir un nouveau mot de passe (≥ 12 caractères, lettres + chiffres).
4. Une fois validé, le dashboard est accessible.

Le nouveau hash est persisté dans le volume `teslamatefix-data` (fichier `password_hash`). Survit aux `docker compose restart` et aux mises à jour d'image.

## 3. Mise à jour

```bash
docker compose pull teslamatefix
docker compose up -d teslamatefix
```

Compose recrée le conteneur avec la nouvelle image. Le volume `teslamatefix-data` est préservé, donc le mot de passe et la clé de session restent inchangés. Lire les release notes : si une nouvelle migration TeslaMate apparaît (côté schéma TeslaMate), TeslaMateFix peut nécessiter une version compatible.

## 4. Désinstallation

```bash
docker compose stop teslamatefix
docker compose rm -f teslamatefix
docker volume rm <stack>_teslamatefix-data
docker image rm wkerkeni/teslamatefix:latest
```

## 5. Hardening avancé (optionnel)

Cette section concerne les déploiements production / multi-utilisateurs / publics. Le mode rapide §1 est suffisant pour un usage personnel sur réseau local.

### 5.a. Reverse-proxy HTTPS

**Obligatoire en production.** Le cookie de session est marqué `Secure` quand `NODE_ENV=production` (déjà le cas dans l'image), ce qui suppose une terminaison TLS. Exemples nginx / Caddy / Traefik dans [`INTEGRATION_TESLAMATE.md`](./INTEGRATION_TESLAMATE.md#exemples-reverse-proxy).

### 5.b. Rôle PostgreSQL dédié

Par défaut, TeslaMateFix se connecte avec l'utilisateur `teslamate` (super-user du DB côté compose). Pour un setup plus sécurisé, créer un rôle restreint qui :

- peut lire/écrire les tables métier (drives, charges, positions, addresses, geofences, states, updates, settings, cars, car_settings, charging_processes) ;
- **n'a aucun accès** à `public.tokens` (jetons API Tesla chiffrés) ni à `public.schema_migrations` ;
- **n'a aucun accès** au schéma `private`.

```bash
TMFIX_DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')"
docker compose exec -T database \
  psql -U postgres -d teslamate \
  -v tmfix_password="'$TMFIX_DB_PASSWORD'" \
  < docker/init-teslamatefix-user.sql
```

Puis dans le service `teslamatefix` du compose, remplacer `DATABASE_USER/PASS/NAME` par :

```yaml
environment:
  DATABASE_URL: "postgresql://teslamatefix:${TMFIX_DB_PASSWORD}@database:5432/teslamate?schema=public"
```

(Le DSN explicite a priorité sur la reconstruction automatique.)

### 5.c. Hash bcrypt fourni en env (mode legacy)

Si vous préférez gérer le hash bcrypt hors container (CI, secret manager externe, etc.), fournir les variables d'env :

```yaml
environment:
  AUTH_USERNAME: "admin"
  AUTH_PASSWORD_HASH: '$2b$12$abcdef...'  # 60 caractères, échapper les $ dans .env (\$)
  AUTH_SECRET: "<32 octets base64 — openssl rand -base64 32>"
```

Quand `AUTH_PASSWORD_HASH` est défini en env, l'app **ne lit pas** le volume pour le hash et **désactive** la page `/change-password` (l'env serait re-imposée au prochain redémarrage). Pour rebasculer en mode volume : retirer la var d'env et redémarrer.

Générer un hash :

```bash
docker run --rm -i wkerkeni/teslamatefix:latest \
  node scripts/hash-password.mjs <<< 'MotDePasse'
```

### 5.d. Mode lecture seule (READ_ONLY)

Pour une phase pilote ou une consultation multi-utilisateurs sans risque, ajouter à l'env :

```yaml
READ_ONLY: "true"
```

L'UI continue d'afficher toutes les entités et tous les détails, mais les boutons de mutation (Save, Delete, Recalc) sont masqués. Aucune mutation possible.

## 6. Publication d'image (mainteneur)

Cette section concerne uniquement le mainteneur du repo.

### 6.a. Workflow GitHub Actions

Le workflow [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml) se déclenche sur chaque push de tag `v*` et publie une image multi-architectures (`linux/amd64` + `linux/arm64`) sur Docker Hub :

```bash
git tag -a v0.2.0 -m "v0.2.0 — …"
git push origin v0.2.0
```

Tags publiés : `wkerkeni/teslamatefix:0.2.0` + `wkerkeni/teslamatefix:latest`.

**Secrets requis** sur le repo GitHub (Settings → Secrets and variables → Actions) :

- `DOCKERHUB_USERNAME` : `wkerkeni` (namespace Docker Hub, ≠ namespace GitHub `kerkeniw`).
- `DOCKERHUB_TOKEN` : access token créé sur https://hub.docker.com/settings/security (scope `read,write,delete` sur le repo).

### 6.b. Build manuel local

Pour tester avant un tag ou pour des builds hors release : [`scripts/docker-publish.sh`](../scripts/docker-publish.sh).

```bash
# Build local single-archi (linux/amd64) chargé dans le daemon :
./scripts/docker-publish.sh v0.2.0

# Build multi-archi + push sur Docker Hub (nécessite `docker login` au préalable) :
./scripts/docker-publish.sh v0.2.0 --push
```

Pré-requis : Docker Engine ≥ 24, plugin `buildx`. Pour le multi-archi local, QEMU est installé automatiquement par le builder.
