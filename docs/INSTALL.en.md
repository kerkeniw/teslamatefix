# Installation — TeslaMateFix

> Installation guide to add TeslaMateFix to an existing TeslaMate stack via
> Docker Compose.
> French version: [`INSTALL.md`](./INSTALL.md).

## 1. Prerequisites

- A running [TeslaMate](https://github.com/teslamate-org/teslamate) stack deployed via `docker compose` (services `teslamate`, `database`, `grafana`, `mosquitto`).
- Docker Engine ≥ 24 and `docker compose` v2 on the host.
- Shell access to the host running the TeslaMate compose.
- (Optional but recommended) An HTTPS reverse-proxy (nginx, Caddy, Traefik) — see [`INTEGRATION_TESLAMATE.md`](./INTEGRATION_TESLAMATE.md) (French).

> **Backup — IMPORTANT.** Before first use, run a full `pg_dump` of the TeslaMate database. See [`INTEGRATION_TESLAMATE.md`](./INTEGRATION_TESLAMATE.md#sauvegarde-postgres-recommandée).

---

## 2. Generating the bcrypt hash (admin password)

TeslaMateFix uses a single account (login + password). The password is stored as a **bcrypt** hash in the environment (never in clear text).

Two options.

### 2.a. Via the Docker image (recommended)

```bash
docker run --rm -i wkerkeni/teslamatefix:latest \
  node scripts/hash-password.mjs <<< 'YourPassword'
```

The hash is printed to stdout. Copy it into `TMFIX_AUTH_PASSWORD_HASH`.

### 2.b. Via local Node (if you cloned the repo)

```bash
echo -n 'YourPassword' | npm run -s auth:hash
```

> **Tip.** Prefix the command with a leading space if your shell logs history (zsh `setopt HIST_IGNORE_SPACE`, bash `HISTCONTROL=ignorespace`) to avoid leaking the password.

---

## 3. Generating `AUTH_SECRET`

Symmetric key used to encrypt the session cookie (iron-session). It must be **at least 32 characters**; 32 random bytes in base64 work fine:

```bash
openssl rand -base64 32
```

Copy the output into `TMFIX_AUTH_SECRET`. Do not reuse a secret that lives elsewhere; if leaked, force-logout everyone by regenerating the key.

---

## 4. Creating the dedicated PostgreSQL user

The application does **not** use the `teslamate` account (which is superuser-like for the database). It connects via a restricted role `teslamatefix` that:

- can read/write the business tables (drives, charges, positions, addresses, geofences, states, updates, settings, cars, car_settings, charging_processes);
- has **no access** to `public.tokens` (encrypted Tesla API tokens) or to `public.schema_migrations`;
- has **no access** to the `private` schema.

### 4.a. Pick a DB password

```bash
TMFIX_DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')"
echo "$TMFIX_DB_PASSWORD"   # report it in the .env
```

### 4.b. Run the script

From the directory holding the TeslaMate compose (with the TeslaMateFix repo locally accessible):

```bash
docker compose exec -T database \
  psql -U postgres -d teslamate \
  -v tmfix_password="'$TMFIX_DB_PASSWORD'" \
  < docker/init-teslamatefix-user.sql
```

> The `"'$TMFIX_DB_PASSWORD'"` quoting is intentional — `psql -v` does not add quotes, you must supply them to produce a valid SQL literal.

Quick check:

```bash
docker compose exec database \
  psql "postgresql://teslamatefix:$TMFIX_DB_PASSWORD@127.0.0.1:5432/teslamate" \
  -c "SELECT count(*) FROM cars;"
```

If it returns a number, the role is operational.

---

## 5. Environment variables

Append to your `.env` (the one read by `docker compose`):

```dotenv
# --- TeslaMateFix ---
TMFIX_DB_PASSWORD=<password chosen in step 4.a>
TMFIX_AUTH_USERNAME=admin
TMFIX_AUTH_PASSWORD_HASH=<bcrypt hash from step 2>
TMFIX_AUTH_SECRET=<key from step 3>
TMFIX_DEFAULT_LOCALE=fr        # fr | en
TMFIX_LOG_LEVEL=info           # trace | debug | info | warn | error
TMFIX_READ_ONLY=false          # true to disable every mutation
```

> Never commit this `.env` to git. Check `.gitignore`.

---

## 6. Adding the service to the TeslaMate compose

The full block lives in [`docker/docker-compose.example.yml`](../docker/docker-compose.example.yml). Copy it under `services:` in your `docker-compose.yml`, alongside `teslamate` / `database` / `grafana` / `mosquitto`.

Key points:

- `depends_on: [database]` — TeslaMateFix starts after the database.
- `image: wkerkeni/teslamatefix:latest` — official image published on Docker Hub.
- `ports: ["3001:3001"]` — expose on the host or comment out and route via the reverse-proxy only.
- `healthcheck` — Compose marks the service `unhealthy` if `/api/health` does not respond.

Start it:

```bash
docker compose pull teslamatefix
docker compose up -d teslamatefix
docker compose logs -f teslamatefix
```

---

## 7. First login & security

1. Open `http://<host>:3001` (or the HTTPS URL of the reverse-proxy).
2. Log in with `TMFIX_AUTH_USERNAME` + the password chosen in step 2.
3. Confirm the homepage shows the expected entity counts.

### Minimal best practices

- **HTTPS is mandatory in production.** The session cookie is marked `Secure` when `NODE_ENV=production` (already the case in the image), which assumes TLS termination. See [`INTEGRATION_TESLAMATE.md`](./INTEGRATION_TESLAMATE.md#exemples-reverse-proxy).
- **Pilot phase: `READ_ONLY=true`.** During the first days, keep `TMFIX_READ_ONLY=true`. Every screen stays browsable, but no mutation button is rendered — zero risk to the database.
- **Strong password.** At least 16 characters, randomly generated.
- **Change the password**: regenerate a hash (step 2) and redeploy. See [`INTEGRATION_TESLAMATE.md`](./INTEGRATION_TESLAMATE.md#faq).
- **Limit network exposure**: if the machine is on the public internet, do not open port 3001 directly — sit it behind the reverse-proxy.

---

## 8. Updating the image

```bash
docker compose pull teslamatefix
docker compose up -d teslamatefix
```

Compose recreates the container with the new image. The service is stateless (no volume), so no migration is needed on the TeslaMateFix side.

> Read the release notes between versions: if a new TeslaMate migration shows up (you'll see it when upgrading TeslaMate), TeslaMateFix may need a matching release to stay compatible.

---

## 9. Uninstall

```bash
docker compose stop teslamatefix
docker compose rm -f teslamatefix
docker image rm wkerkeni/teslamatefix:latest
```

To drop the PG role:

```bash
docker compose exec database \
  psql -U postgres -d teslamate -c "DROP OWNED BY teslamatefix; DROP ROLE teslamatefix;"
```

---

## 10. Image publishing (maintainer only)

This section is only for the repo maintainer — end users: ignore.

### 10.a. GitHub Actions workflow (official release)

The workflow [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml) is triggered on every push of a `v*` tag and publishes a multi-arch image (`linux/amd64` + `linux/arm64`) to Docker Hub:

```bash
git tag -a v0.2.0 -m "v0.2.0 — …"
git push origin v0.2.0
```

Published tags on Docker Hub: `wkerkeni/teslamatefix:0.2.0` + `wkerkeni/teslamatefix:latest`.

**Required secrets** on the GitHub repo (Settings → Secrets and variables → Actions):

- `DOCKERHUB_USERNAME`: `wkerkeni` (Docker Hub namespace, ≠ GitHub namespace).
- `DOCKERHUB_TOKEN`: access token created at https://hub.docker.com/settings/security (scope `read,write,delete` on the repo).

### 10.b. Manual local build

To test before a tag or for off-release builds: [`scripts/docker-publish.sh`](../scripts/docker-publish.sh).

```bash
# Local single-arch build (linux/amd64) loaded into the daemon:
./scripts/docker-publish.sh v0.1.0

# Multi-arch build + push to Docker Hub (requires `docker login` first):
./scripts/docker-publish.sh v0.1.0 --push
```

Requirements: Docker Engine ≥ 24, `buildx` plugin. For local multi-arch, QEMU is installed automatically by the builder.
