# Installation — TeslaMateFix

> Guide d'installation pour ajouter TeslaMateFix à une stack TeslaMate
> existante via Docker Compose.
> Version anglaise : [`INSTALL.en.md`](./INSTALL.en.md).

## 1. Prérequis

- Une stack [TeslaMate](https://github.com/teslamate-org/teslamate) opérationnelle, déployée via `docker compose` (services `teslamate`, `database`, `grafana`, `mosquitto`).
- Docker Engine ≥ 24 et `docker compose` v2 sur l'hôte.
- Accès à un terminal sur l'hôte qui héberge le compose TeslaMate.
- (Optionnel mais recommandé) Un reverse-proxy HTTPS (nginx, Caddy, Traefik) — voir [`INTEGRATION_TESLAMATE.md`](./INTEGRATION_TESLAMATE.md).

> **Sauvegarde — IMPORTANT.** Avant la première utilisation, faites un `pg_dump` complet de la base TeslaMate. Voir [`INTEGRATION_TESLAMATE.md`](./INTEGRATION_TESLAMATE.md#sauvegarde-postgres-recommandée).

---

## 2. Génération du hash bcrypt (mot de passe admin)

TeslaMateFix utilise un seul compte (login + mot de passe). Le mot de passe est stocké côté env sous forme de hash **bcrypt** (jamais en clair).

Deux méthodes au choix.

### 2.a. Via l'image Docker (recommandé après pull)

```bash
docker run --rm -i ghcr.io/<owner>/teslamatefix:latest \
  node scripts/hash-password.mjs <<< 'VotreMotDePasse'
```

Le hash s'affiche sur stdout. Copiez-le dans `TMFIX_AUTH_PASSWORD_HASH`.

### 2.b. Via Node local (si vous avez cloné le repo)

```bash
echo -n 'VotreMotDePasse' | npm run -s auth:hash
```

> **Astuce.** Préfixez la commande par un espace si votre shell historise les commandes (zsh `setopt HIST_IGNORE_SPACE`, bash `HISTCONTROL=ignorespace`) pour éviter de laisser le mot de passe en clair dans l'historique.

---

## 3. Génération de `AUTH_SECRET`

Clé symétrique utilisée pour chiffrer le cookie de session (iron-session). Elle doit faire **au moins 32 caractères** ; 32 octets aléatoires en base64 fonctionnent très bien :

```bash
openssl rand -base64 32
```

Copiez la sortie dans `TMFIX_AUTH_SECRET`. Ne réutilisez pas un secret qui sert ailleurs ; en cas de fuite, déconnectez tout le monde en regénérant la clé.

---

## 4. Création de l'utilisateur PostgreSQL dédié

L'application n'utilise **pas** le compte `teslamate` (qui a tous les droits). Elle se connecte avec un rôle restreint `teslamatefix` qui :

- peut lire/écrire les tables métier (drives, charges, positions, addresses, geofences, states, updates, settings, cars, car_settings, charging_processes) ;
- **n'a aucun accès** à `public.tokens` (jetons API Tesla chiffrés) ni à `public.schema_migrations` ;
- **n'a aucun accès** au schéma `private`.

### 4.a. Choisir un mot de passe DB

```bash
TMFIX_DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')"
echo "$TMFIX_DB_PASSWORD"   # à reporter dans le .env
```

### 4.b. Exécuter le script

Depuis le répertoire qui contient le compose TeslaMate (et le repo TeslaMateFix accessible localement) :

```bash
docker compose exec -T database \
  psql -U postgres -d teslamate \
  -v tmfix_password="'$TMFIX_DB_PASSWORD'" \
  < docker/init-teslamatefix-user.sql
```

> Le quoting `"'$TMFIX_DB_PASSWORD'"` est intentionnel — `psql -v` n'ajoute pas de quotes, il faut donc les fournir pour produire un littéral SQL valide.

Vérification rapide :

```bash
docker compose exec database \
  psql "postgresql://teslamatefix:$TMFIX_DB_PASSWORD@127.0.0.1:5432/teslamate" \
  -c "SELECT count(*) FROM cars;"
```

Si la commande renvoie un nombre, le rôle est opérationnel.

---

## 5. Variables d'environnement

Ajoutez à votre fichier `.env` (celui que `docker compose` lit) :

```dotenv
# --- TeslaMateFix ---
TMFIX_DB_PASSWORD=<le mot de passe choisi à l'étape 4.a>
TMFIX_AUTH_USERNAME=admin
TMFIX_AUTH_PASSWORD_HASH=<hash bcrypt issu de l'étape 2>
TMFIX_AUTH_SECRET=<clé issue de l'étape 3>
TMFIX_DEFAULT_LOCALE=fr        # fr | en
TMFIX_LOG_LEVEL=info           # trace | debug | info | warn | error
TMFIX_READ_ONLY=false          # true pour désactiver toutes les mutations
```

> N'engagez **jamais** ce `.env` dans git. Vérifiez `.gitignore`.

---

## 6. Ajout du service au compose TeslaMate

Le bloc complet est dans [`docker/docker-compose.example.yml`](../docker/docker-compose.example.yml). Copiez-le dans la section `services:` de votre `docker-compose.yml`, à côté de `teslamate` / `database` / `grafana` / `mosquitto`.

Points clés :

- `depends_on: [database]` — TeslaMateFix démarre après la base.
- `image: ghcr.io/<owner>/teslamatefix:latest` — adapter au registry effectif.
- `ports: ["3001:3001"]` — exposez sur l'hôte ou commentez et passez par le reverse-proxy uniquement.
- `healthcheck` — Compose marquera le service `unhealthy` si `/api/health` ne répond pas.

Démarrage :

```bash
docker compose pull teslamatefix
docker compose up -d teslamatefix
docker compose logs -f teslamatefix
```

---

## 7. Premier login & sécurité

1. Ouvrez `http://<host>:3001` (ou l'URL HTTPS du reverse-proxy).
2. Connectez-vous avec `TMFIX_AUTH_USERNAME` + le mot de passe choisi à l'étape 2.
3. Vérifiez que la page d'accueil affiche le compteur d'entités attendu.

### Bonnes pratiques minimales

- **HTTPS obligatoire en production.** Le cookie de session est marqué `Secure` quand `NODE_ENV=production` (déjà le cas dans l'image), ce qui suppose une terminaison TLS. Voir [`INTEGRATION_TESLAMATE.md`](./INTEGRATION_TESLAMATE.md#exemples-reverse-proxy).
- **Phase pilote : `READ_ONLY=true`.** Pendant les premiers jours, gardez `TMFIX_READ_ONLY=true`. Tous les écrans restent consultables, mais aucun bouton de mutation n'est rendu — risque zéro pour la base.
- **Mot de passe fort.** Au moins 16 caractères, généré aléatoirement.
- **Changer le mot de passe** : régénérer un hash (étape 2) et redéployer. Voir [`INTEGRATION_TESLAMATE.md`](./INTEGRATION_TESLAMATE.md#faq).
- **Limiter l'exposition réseau** : si la machine est sur Internet, n'ouvrez pas le port 3001 directement, branchez-le derrière le reverse-proxy.

---

## 8. Mise à jour de l'image

```bash
docker compose pull teslamatefix
docker compose up -d teslamatefix
```

Compose recrée le conteneur avec la nouvelle image. Le service est sans état (aucun volume), aucune migration n'est nécessaire côté TeslaMateFix.

> Lisez les notes de release entre deux versions : si une nouvelle migration TeslaMate apparaît (vous la voyez quand vous mettez à jour TeslaMate), TeslaMateFix peut nécessiter une nouvelle version pour rester compatible.

---

## 9. Désinstallation

```bash
docker compose stop teslamatefix
docker compose rm -f teslamatefix
docker image rm ghcr.io/<owner>/teslamatefix:latest
```

Pour supprimer le rôle PG :

```bash
docker compose exec database \
  psql -U postgres -d teslamate -c "DROP OWNED BY teslamatefix; DROP ROLE teslamatefix;"
```
