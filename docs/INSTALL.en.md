# Installation — TeslaMateFix

> Guide to add TeslaMateFix to an existing TeslaMate stack via Docker Compose.
> French version: [`INSTALL.md`](./INSTALL.md).

## 1. Quick install (zero-config)

Prerequisites: a running [TeslaMate](https://github.com/teslamate-org/teslamate) stack deployed via `docker compose` (services `teslamate`, `database`, `grafana`, `mosquitto`), Docker Engine ≥ 24 and `docker compose` v2.

> **Backup recommended.** Before first use, take a full `pg_dump` of the TeslaMate database — see [`INTEGRATION_TESLAMATE.md`](./INTEGRATION_TESLAMATE.md#sauvegarde-postgres-recommandée).

Paste the block from [`docker/docker-compose.example.yml`](../docker/docker-compose.example.yml) into your `docker-compose.yml`, then:

```bash
docker compose up -d teslamatefix
```

No TeslaMateFix-specific env var is required: the image reuses `DATABASE_USER` / `DATABASE_PASS` / `DATABASE_NAME` from the TeslaMate compose to assemble the DSN, and bootstraps its internal secrets (session key, default bcrypt hash) into a named volume `teslamatefix-data`.

## 2. First login

1. Open `http://<host>:3001` (or the HTTPS URL of the reverse-proxy).
2. Login: **`admin`** / **`admin`**.
3. The app automatically redirects to `/change-password` (Grafana pattern): choose a new password (≥ 12 chars, letters + digits).
4. Once submitted, the dashboard is reachable.

The new hash is persisted in the `teslamatefix-data` volume (file `password_hash`). It survives `docker compose restart` and image upgrades.

## 3. Updating

```bash
docker compose pull teslamatefix
docker compose up -d teslamatefix
```

Compose recreates the container with the new image. The `teslamatefix-data` volume is preserved, so the password and session key remain. Read release notes: if a new TeslaMate migration shows up (schema side), TeslaMateFix may need a compatible version.

## 4. Uninstall

```bash
docker compose stop teslamatefix
docker compose rm -f teslamatefix
docker volume rm <stack>_teslamatefix-data
docker image rm wkerkeni/teslamatefix:latest
```

## 5. Hardening (optional)

This section is for production / multi-user / public deployments. The quick mode in §1 is enough for personal use on a local network.

### 5.a. HTTPS reverse-proxy

**Mandatory in production.** The session cookie is marked `Secure` when `NODE_ENV=production` (already set in the image), which assumes TLS termination. Examples for nginx / Caddy / Traefik in [`INTEGRATION_TESLAMATE.md`](./INTEGRATION_TESLAMATE.md#exemples-reverse-proxy).

### 5.b. Dedicated PostgreSQL role

By default, TeslaMateFix connects with the `teslamate` user (DB super-user from the compose). For a more secure setup, create a restricted role that:

- can read/write business tables (drives, charges, positions, addresses, geofences, states, updates, settings, cars, car_settings, charging_processes);
- has **no access** to `public.tokens` (encrypted Tesla API tokens) nor to `public.schema_migrations`;
- has **no access** to the `private` schema.

```bash
TMFIX_DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')"
docker compose exec -T database \
  psql -U postgres -d teslamate \
  -v tmfix_password="'$TMFIX_DB_PASSWORD'" \
  < docker/init-teslamatefix-user.sql
```

Then in the `teslamatefix` service of your compose, replace `DATABASE_USER/PASS/NAME` with:

```yaml
environment:
  DATABASE_URL: "postgresql://teslamatefix:${TMFIX_DB_PASSWORD}@database:5432/teslamate?schema=public"
```

(An explicit DSN takes precedence over auto-reconstruction.)

### 5.c. Bcrypt hash from env (legacy mode)

If you prefer to manage the bcrypt hash outside the container (CI, external secret manager, etc.), provide env vars:

```yaml
environment:
  AUTH_USERNAME: "admin"
  AUTH_PASSWORD_HASH: '$2b$12$abcdef...'  # 60 chars; escape $ in .env (\$)
  AUTH_SECRET: "<32 bytes base64 — openssl rand -base64 32>"
```

When `AUTH_PASSWORD_HASH` is set in env, the app **does not read** the volume for the hash and **disables** the `/change-password` page (env would override at next restart). To go back to volume mode: remove the env var and restart.

Generate a hash:

```bash
docker run --rm -i wkerkeni/teslamatefix:latest \
  node scripts/hash-password.mjs <<< 'MyPassword'
```

### 5.d. Read-only mode (READ_ONLY)

For a pilot phase or multi-user consultation without risk, add to env:

```yaml
READ_ONLY: "true"
```

The UI still shows all entities and details, but mutation buttons (Save, Delete, Recalc) are hidden. No mutation possible.

## 6. Image publishing (maintainer)

This section is for the repo maintainer only.

### 6.a. GitHub Actions workflow

The workflow [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml) triggers on every push of a `v*` tag and publishes a multi-arch image (`linux/amd64` + `linux/arm64`) to Docker Hub:

```bash
git tag -a v0.2.0 -m "v0.2.0 — …"
git push origin v0.2.0
```

Published tags: `wkerkeni/teslamatefix:0.2.0` + `wkerkeni/teslamatefix:latest`.

**Required secrets** on the GitHub repo — stored in the `DockerHub` environment (Settings → Environments → New environment → add the secrets). The workflow job declares `environment: DockerHub` to access them; plain repository secrets are not enough.

- `DOCKERHUB_USERNAME`: `wkerkeni` (Docker Hub namespace, ≠ GitHub namespace `kerkeniw`).
- `DOCKERHUB_TOKEN`: access token from https://hub.docker.com/settings/security (scope `read,write,delete` on the repo).

### 6.b. Manual local build

To test before tagging or for off-release builds: [`scripts/docker-publish.sh`](../scripts/docker-publish.sh).

```bash
# Local single-arch build (linux/amd64) loaded in the daemon:
./scripts/docker-publish.sh v0.2.0

# Multi-arch build + push to Docker Hub (requires `docker login` first):
./scripts/docker-publish.sh v0.2.0 --push
```

Requirements: Docker Engine ≥ 24, `buildx` plugin. For local multi-arch, QEMU is installed automatically by the builder.
