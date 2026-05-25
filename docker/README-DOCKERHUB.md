# TeslaMateFix

> Mobile-first web UI to **fix and complete** data collected by
> [TeslaMate](https://github.com/teslamate-org/teslamate) — drives, charges,
> positions, addresses, geofences, states, updates, cars, settings.

When the car loses its connection (underground parking, dead zone, API
outage), TeslaMate records incomplete trips and charging sessions —
missing end, wrong odometer, missing energy, state stuck on `online`.
TeslaMateFix plugs into the same Docker Compose stack as TeslaMate,
connects to its PostgreSQL database and exposes a secure UI to repair
each entity.

**Source code & full documentation:** https://github.com/kerkeniw/teslamatefix

> **v0.3.0 status** — only the **charges create/edit** module has been
> tested and validated in this release. Other entities (drives, positions,
> addresses, geofences, states, firmware updates, cars, settings) are
> available for **read-only browsing**; their edit flows have not been
> validated yet. Use with care and **always on a backed-up database**
> (`pg_dump` recommended before first use).

## Quick start

Add this block to your TeslaMate `docker-compose.yml`, next to
`teslamate` / `database` / `grafana` / `mosquitto`:

```yaml
services:
  teslamatefix:
    image: wkerkeni/teslamatefix:latest
    restart: always
    depends_on:
      - database
    ports:
      - "3001:3001"
    environment:
      DATABASE_USER: "${DATABASE_USER:-teslamate}"
      DATABASE_PASS: "${DATABASE_PASS}"
      DATABASE_NAME: "${DATABASE_NAME:-teslamate}"
    volumes:
      - teslamatefix-data:/data

volumes:
  teslamatefix-data:
```

Then:

```bash
docker compose up -d teslamatefix
```

Open `http://<host>:3001`, log in with **`admin`** / **`admin`** and pick
a new password on first redirect (Grafana pattern). The session secret
and bcrypt hash are generated automatically on first start and persisted
in the `teslamatefix-data` volume.

## Update

```bash
docker compose pull teslamatefix
docker compose up -d teslamatefix
```

The `teslamatefix-data` volume is preserved across updates, so password
and session key survive. See the
[release notes on GitHub](https://github.com/kerkeniw/teslamatefix/releases)
for breaking changes between versions.

## Tags

- `latest` — most recent stable release.
- `0.3.0`, `0.2.0`, … — semver-pinned releases (recommended for production).

Each tag is built multi-arch (`linux/amd64` + `linux/arm64`) via
[GitHub Actions](https://github.com/kerkeniw/teslamatefix/actions).

## Configuration & hardening

The default setup (above) is zero-config and suitable for personal use on
a local network. For production deployments (HTTPS reverse-proxy,
dedicated PostgreSQL role, env-provided bcrypt hash, read-only mode), see
the full installation guide:

- 🇫🇷 [`docs/INSTALL.md`](https://github.com/kerkeniw/teslamatefix/blob/main/docs/INSTALL.md)
- 🇬🇧 [`docs/INSTALL.en.md`](https://github.com/kerkeniw/teslamatefix/blob/main/docs/INSTALL.en.md)

## Stack

Next.js 16 · React 19 · Prisma 6 (read-only introspection of the TeslaMate
schema) · iron-session · next-intl (FR/EN) · Tailwind 4 · shadcn/ui.

## License

[MIT](https://github.com/kerkeniw/teslamatefix/blob/main/LICENSE).

## Report issues

[GitHub issues](https://github.com/kerkeniw/teslamatefix/issues).
