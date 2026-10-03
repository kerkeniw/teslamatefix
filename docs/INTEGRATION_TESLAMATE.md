# Intégration à une stack TeslaMate existante

Ce document détaille l'ajout de TeslaMateFix à un `docker-compose.yml`
TeslaMate déjà déployé. Le guide pas-à-pas est dans
[`INSTALL.md`](INSTALL.md) (FR) / [`INSTALL.en.md`](INSTALL.en.md) (EN). Cette
page se concentre sur les détails opérationnels.

## Avant d'intégrer : sauvegarder Postgres

**Important.** TeslaMateFix peut éditer/supprimer des lignes en base. Avant la
première utilisation, sauvegarde la base TeslaMate :

```bash
# Depuis l'host hébergeant le compose TeslaMate
docker compose exec database \
  pg_dump -U teslamate -Fc -d teslamate \
  > teslamate-$(date +%Y%m%d-%H%M).pgdump
```

Pour restaurer en cas de soucis :

```bash
cat teslamate-YYYYMMDD-HHMM.pgdump | \
  docker compose exec -T database \
  pg_restore -U teslamate -d teslamate --clean --if-exists
```

## Env de dev : rapatrier la base du NAS

Pour analyser/tester sur une copie locale de la prod, sans toucher au serveur
principal. Pré-requis : un compose TeslaMate local avec le service `database`
(TeslaMate lui-même désactivé pour ne rien pousser), et les scripts
`scripts/teslamate-pull-from-nas.sh` + `scripts/teslamate-restore.sh`
accessibles depuis ce répertoire (symlink conseillé).

```bash
cd ../TeslaMate                       # répertoire du compose local
./teslamate-pull-from-nas.sh          # dump NAS → scp → restore (confirmation)
./teslamate-pull-from-nas.sh --no-restore   # récupère le dump seulement
```

Le script :

1. ouvre une connexion SSH maître vers `NAS_HOST` (mot de passe SSH demandé
   une seule fois) ;
2. lance `sudo /usr/local/bin/docker-compose exec -T database pg_dump …` dans
   `NAS_COMPOSE_DIR` et écrit `teslamate-YYYYMMDD-HHMM.bck` dans
   `NAS_DUMP_DIR` (la copie reste sur le NAS) ; sudo peut demander son mot de
   passe ;
3. vérifie le dump (marqueur de fin), le télécharge dans `LOCAL_DUMP_DIR`
   (`./data`) et contrôle la taille ;
4. enchaîne `teslamate-restore.sh` (destructif : DROP des schémas locaux).

Variables (env ou `.env` local) : `NAS_HOST` (`mynassrv`), `NAS_COMPOSE_DIR`
(`/var/services/homes/Wicem/TeslaMate`), `NAS_DUMP_DIR` (`$NAS_COMPOSE_DIR/backups`),
`LOCAL_DUMP_DIR` (`./data`), `DATABASE_USER` / `DATABASE_NAME` (`teslamate`).
Le nom du service Postgres du NAS est en dur (`NAS_PG_SERVICE="database"`).
Spécificités Synology DSM : `docker-compose` est appelé par son chemin absolu
(le `secure_path` de sudo ne contient pas `/usr/local/bin`) et le
téléchargement utilise `scp -O` (protocole scp legacy, pas de SFTP côté NAS).

Astuces : `ssh-copy-id mynassrv` évite le mot de passe SSH. Les anciens dumps
ne sont jamais supprimés (ni NAS ni local) — à purger manuellement.

## Diff du `docker-compose.yml`

Avant (extrait du compose TeslaMate par défaut) :

```yaml
services:
  teslamate:
    image: teslamate/teslamate:latest
    # …
  database:
    image: postgres:18-trixie
    # …
  grafana:
    image: teslamate/grafana:latest
    # …
  mosquitto:
    image: eclipse-mosquitto:2
```

Après ajout de TeslaMateFix :

```yaml
services:
  teslamate:
    # … inchangé
  database:
    # … inchangé
  grafana:
    # … inchangé
  mosquitto:
    # … inchangé

  teslamatefix:
    image: ghcr.io/<owner>/teslamatefix:latest   # à remplacer par votre image
    restart: always
    depends_on:
      - database
    environment:
      DATABASE_URL: postgresql://teslamatefix:${TMFIX_DB_PASSWORD}@database:5432/teslamate?schema=public
      AUTH_USERNAME: ${TMFIX_USER}
      AUTH_PASSWORD_HASH: ${TMFIX_PASSWORD_HASH}
      AUTH_SECRET: ${TMFIX_AUTH_SECRET}
      DEFAULT_LOCALE: fr
      LOG_LEVEL: info
      READ_ONLY: "false"
    ports:
      - 3001:3001
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--spider", "http://127.0.0.1:3001/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

Et dans le `.env` du compose :

```env
TMFIX_DB_PASSWORD=<voir docker/init-teslamatefix-user.sql>
TMFIX_USER=admin
TMFIX_PASSWORD_HASH=$2b$12$...    # généré via `npm run auth:hash`
TMFIX_AUTH_SECRET=...             # généré via `openssl rand -base64 32`
```

> Note : avec `DEFAULT_LOCALE=fr`, l'app utilise un préfixe d'URL `as-needed` —
> `/drives` est l'URL FR par défaut, `/en/drives` pointe explicitement sur la
> version anglaise.

## Reverse proxy HTTPS

L'app écoute en HTTP sur `:3001`. En production, l'exposer via un reverse proxy
qui termine TLS.

### nginx

```nginx
server {
    server_name teslamatefix.example.com;
    listen 443 ssl http2;
    ssl_certificate     /etc/letsencrypt/live/teslamatefix.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/teslamatefix.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
    }
}
```

`X-Forwarded-For` est lu par le rate limiter de TeslaMateFix. `X-Forwarded-Proto`
permet à iron-session de définir le cookie en `Secure` quand la connexion est
chiffrée.

### Caddy

```caddyfile
teslamatefix.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3001
}
```

Caddy gère TLS automatiquement (Let's Encrypt) et propage `X-Forwarded-*` par
défaut.

## FAQ

### Et si je casse la base ?

- Restaure le `pg_dump` pris avant. C'est pour ça qu'on en fait un.
- Active `READ_ONLY=true` dans l'env et redémarre le service tant que tu
  enquêtes. Aucune mutation ne passera.
- Les logs JSON sur stdout (`docker logs teslamatefix`) tracent chaque mutation
  avec `{event, user, id, diff_keys}` — utile pour reproduire ou rollback à la
  main.

### Puis-je l'utiliser sans Docker ?

Oui. `npm ci`, `npm run build`, `npm run start` avec `.env` configuré. Mais le
projet est avant tout pensé pour s'ajouter au compose TeslaMate ; les variables
d'env sont identiques.

### Comment changer le mot de passe ?

```bash
# Localement ou dans le container
echo -n "NouveauMotDePasse" | npm run auth:hash --silent
# → copier le hash dans AUTH_PASSWORD_HASH puis redémarrer le service
```

### Comment activer le mode lecture seule ?

`READ_ONLY=true` dans l'env, puis `docker compose up -d teslamatefix`. Toutes
les server actions de mutation retourneront alors une erreur "Application en
lecture seule".

### Peut-on désactiver l'auth ?

Non. C'est délibéré : l'app a un accès direct à la base de données et doit être
gardée derrière un mot de passe. Si tu n'as pas besoin de protection sur ton
réseau local, choisis tout de même un mot de passe simple.
