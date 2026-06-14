# Migration TeslaMate → Tesla Fleet API (option B : self-hosted natif)

> **Contexte.** Depuis le ~12 juin 2026, Tesla a coupé `owner-api.teslamotors.com`
> pour les particuliers (`403 forbidden, see https://developer.tesla.com/docs/fleet-api`).
> Le token Owner API se renouvelle encore via `auth.tesla.com` mais l'access token
> est rejeté (mauvais `audience` dans le JWT). **C'est définitif** : il faut migrer
> vers la Fleet API.
>
> Ce guide couvre l'**option B** : application Tesla Developer en propre, sans proxy
> tiers (ni MyTeslaMate ni Teslemetry). TeslaMate reste 100 % local ; seul un fichier
> `.pem` est exposé publiquement pour la vérification de domaine.
>
> **Impact TeslaMateFix** : aucun changement de schéma DB → l'outil reste valable.
> Seule la résolution des *nouvelles* données collectées sera plus grossière (à garder
> en tête pour les corrections de charges).

## Prérequis

- TeslaMate **≥ 4.0.0** (support Fleet API natif).
- Un nom de domaine + reverse-proxy HTTPS (Nginx/Traefik/Caddy) déjà en place. ✅
- `openssl` et `curl` sur ta machine.
- Compte Tesla avec **e-mail vérifié + MFA activé** (obligatoire pour developer.tesla.com).
- Région : **Europe** dans ce guide → host `fleet-api.prd.eu.vn.cloud.tesla.com`.
  (NA/APAC : `...na...` ; Chine : `...cn.vn.cloud.tesla.cn`.)

Variables à remplacer dans tout le doc :

| Placeholder        | Valeur                                                   |
|--------------------|----------------------------------------------------------|
| `<DOMAIN>`         | ton domaine, ex. `tesla.mondomaine.fr`                   |
| `<CLIENT_ID>`      | fourni par Tesla à l'étape 1                             |
| `<CLIENT_SECRET>`  | fourni par Tesla à l'étape 1                             |

---

## Étape 1 — Créer l'application Tesla Developer

1. Aller sur <https://developer.tesla.com> → se connecter avec son compte Tesla (MFA requis).
2. **Create a new application** / *Request App Access*. Remplir :
   - **App name** : `TeslaMate` (libre).
   - **Description** : usage personnel, suivi des données de mon véhicule.
   - **Purpose of usage** : *Personal data logging for my own vehicle.*
   - **OAuth Grant Types** : cocher **Authorization Code & Machine-to-Machine**
     (il faut les deux : *Authorization Code* pour le login TeslaMate, *Client
     Credentials* pour générer le partner token de l'étape 4).
   - **Scopes** : `vehicle_device_data` (lecture des données — suffisant pour
     TeslaMate). Pas besoin des scopes `vehicle_cmds` / charging (TeslaMate ne
     pilote rien → pas de proxy de commandes requis). Les scopes `openid` et
     **`offline_access`** sont standard et indispensables : c'est `offline_access`
     qui permet d'obtenir un **refresh token** (étape 6).
   - **Allowed Origin (URL)** : `https://<DOMAIN>`
   - **Allowed Redirect URI** : `https://<DOMAIN>/callback`
     (une URL sous TON domaine — elle n'a rien à servir, le navigateur y atterrira
     juste avec le `code` dans l'URL. Doit correspondre **exactement** au
     `redirect_uri` utilisé à l'étape 6).
3. Valider. Tesla affiche **Client ID** et **Client Secret** → les noter
   précieusement (`<CLIENT_ID>`, `<CLIENT_SECRET>`).

---

## Étape 2 — Générer la paire de clés EC

La Fleet API impose une clé publique hébergée sur ton domaine pour prouver que tu
le possèdes. On génère une clé EC P-256 :

```bash
# clé privée — À GARDER SECRÈTE, ne JAMAIS publier
openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem

# clé publique dérivée — celle-ci sera hébergée publiquement
openssl ec -in private-key.pem -pubout -out public-key.pem
```

---

## Étape 3 — Héberger la clé publique sur le domaine

Tesla lira **exactement** cette URL :

```
https://<DOMAIN>/.well-known/appspecific/com.tesla.3p.public-key.pem
```

### Option recommandée — laisser TeslaMateFix servir la clé (aucun service en plus)

Depuis v0.5.0, TeslaMateFix sert lui-même ce fichier : pas besoin d'un vhost
statique dédié. Mécanique : un *rewrite* interne (`next.config.ts`) mappe l'URL
Tesla vers la route publique `src/app/api/tesla-public-key/route.ts`, exclue de
l'auth dans `src/proxy.ts`. Le fichier est monté en lecture seule, lu à chaud
(rotation possible sans rebuild).

1. Déposer la clé publique côté hôte, dans le dossier monté (cf.
   `docker-compose.example.yml`) :

   ```bash
   mkdir -p ./tesla-well-known
   cp public-key.pem ./tesla-well-known/com.tesla.3p.public-key.pem
   ```

2. Le service `teslamatefix` monte déjà ce dossier sur `/well-known:ro` et
   définit `TESLA_PUBLIC_KEY_FILE`. `docker compose up -d teslamatefix`.

3. Router ce chemin vers TeslaMateFix sur le **domaine enregistré chez Tesla**
   (`<DOMAIN>`). Si TeslaMateFix est déjà servi sur `<DOMAIN>`, rien à faire.
   Sinon, ajouter au vhost de `<DOMAIN>` une règle qui proxifie **uniquement**
   ce chemin vers le container (port 3001), ex. Nginx :

   ```nginx
   location = /.well-known/appspecific/com.tesla.3p.public-key.pem {
       proxy_pass http://127.0.0.1:3001;
   }
   ```

4. Vérifier (doit renvoyer le PEM, HTTPS valide, 200) :

   ```bash
   curl -i https://<DOMAIN>/.well-known/appspecific/com.tesla.3p.public-key.pem
   ```

Puis passer directement à l'**étape 4**.

### Option alternative — fichier statique via ton reverse-proxy

Si tu préfères servir le `.pem` sans passer par TeslaMateFix, dépose-le et
sers-le directement depuis ton reverse-proxy.

**Exemple Nginx :**

```nginx
location = /.well-known/appspecific/com.tesla.3p.public-key.pem {
    alias /var/www/tesla/public-key.pem;
    default_type application/x-pem-file;
}
```

**Exemple Caddy :**

```
handle /.well-known/appspecific/com.tesla.3p.public-key.pem {
    root * /var/www/tesla
    file_server
}
```

**Vérifier** (doit renvoyer le contenu PEM, en HTTPS valide, code 200) :

```bash
curl -i https://<DOMAIN>/.well-known/appspecific/com.tesla.3p.public-key.pem
```

> ⚠️ Le certificat HTTPS doit être valide et publiquement résolvable. Tesla
> n'acceptera pas un certificat auto-signé ni une IP privée.

---

## Étape 4 — Générer le partner authentication token

Token machine-to-machine (`client_credentials`) servant uniquement à enregistrer
le domaine (étape 5). Endpoint OAuth tiers :

```bash
curl --request POST \
  --url 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data 'grant_type=client_credentials' \
  --data 'client_id=<CLIENT_ID>' \
  --data 'client_secret=<CLIENT_SECRET>' \
  --data 'scope=openid vehicle_device_data' \
  --data 'audience=https://fleet-api.prd.eu.vn.cloud.tesla.com'
```

Réponse → champ `access_token`. Le stocker en variable shell pour l'étape suivante :

```bash
PARTNER_TOKEN='<colle_ici_access_token>'
```

> ⚠️ **Ce token n'est PAS celui que TeslaMate te réclame.** Le grant
> `client_credentials` ne renvoie **jamais** de refresh token (c'est voulu) et ne
> sert **que** à enregistrer le domaine (étape 5). Le token *utilisateur* (access +
> refresh) demandé par l'écran de connexion TeslaMate se génère à l'**étape 6**.

---

## Étape 5 — Enregistrer le domaine (partner account)

Une seule fois, **par région**. Associe ta clé publique à ton compte partenaire :

```bash
curl --request POST \
  --url 'https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/partner_accounts' \
  --header "Authorization: Bearer ${PARTNER_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data '{"domain": "<DOMAIN>"}'
```

**Vérifier que Tesla a bien lu la clé** (doit renvoyer ta clé publique) :

```bash
curl --request GET \
  --url "https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/partner_accounts/public_key?domain=<DOMAIN>" \
  --header "Authorization: Bearer ${PARTNER_TOKEN}"
```

> Si erreur : c'est presque toujours l'étape 3 (URL `.well-known` inaccessible,
> mauvais content-type, ou certificat HTTPS invalide). Re-tester le `curl` de
> l'étape 3 depuis une machine externe.

---

## Étape 6 — Générer les tokens utilisateur (access + refresh)

C'est **le** token que TeslaMate réclame. Il s'obtient par le flux **Authorization
Code** (login navigateur), pas par `client_credentials`. Le scope `offline_access`
est obligatoire pour récupérer le `refresh_token`.

### 6.1 — Autoriser dans le navigateur

Construire l'URL ci-dessous (remplacer `<CLIENT_ID>` et `<DOMAIN>`) et l'ouvrir
dans un navigateur **connecté à ton compte Tesla** :

```
https://auth.tesla.com/oauth2/v3/authorize?response_type=code&client_id=<CLIENT_ID>&redirect_uri=https://<DOMAIN>/callback&scope=openid%20offline_access%20vehicle_device_data&state=tm123
```

Se connecter + **autoriser l'application** pour ton véhicule. Le navigateur est
redirigé vers :

```
https://<DOMAIN>/callback?code=<CODE>&state=tm123
```

La page peut afficher une 404 — **aucune importance**. Copier la valeur `<CODE>`
depuis la barre d'adresse.

> ⏱️ Le `code` expire en quelques minutes : enchaîner vite avec 6.2.
> Pas besoin de PKCE ici puisqu'on fournit le `client_secret` (client confidentiel).

### 6.2 — Échanger le code contre les tokens

⚠️ L'échange se fait sur `fleet-auth.prd.vn.cloud.tesla.com` (≠ host d'autorisation) :

```bash
curl --request POST \
  --url 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data 'grant_type=authorization_code' \
  --data 'client_id=<CLIENT_ID>' \
  --data 'client_secret=<CLIENT_SECRET>' \
  --data 'code=<CODE>' \
  --data 'audience=https://fleet-api.prd.eu.vn.cloud.tesla.com' \
  --data 'redirect_uri=https://<DOMAIN>/callback'
```

La réponse contient **les deux** valeurs attendues par TeslaMate :

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 28800,
  "token_type": "Bearer"
}
```

### 6.3 — Coller dans TeslaMate

Sur l'écran de connexion de TeslaMate, choisir l'option **« token »** (et non
e-mail/mot de passe), puis coller `access_token` et `refresh_token`.

> 🔁 **Cycle de vie du refresh token** : il est **à usage unique** et expire après
> ~3 mois. Une fois injecté, TeslaMate le **renouvelle automatiquement** à chaque
> rafraîchissement → tu ne refais cette étape 6 que si TeslaMate perd ses tokens
> ou reste inactif > 3 mois.
>
> ⚠️ **`tesla_auth` ne convient PAS ici.** L'outil `tesla_auth` (créateur de
> TeslaMate) ne fait que le **login SSO Owner API** : il n'accepte aucun
> `--client-id` / `--scope` / `--audience`, et produit donc un token d'audience
> Owner API — exactement celui qui renvoie 403 désormais. À éviter pour la Fleet API.
>
> 💡 **Alternative “in control” sans copier le `code` à la main** : le script
> open-source [`MyTeslaMate/tesla-fleet-api-tokens`](https://github.com/MyTeslaMate/tesla-fleet-api-tokens)
> s'exécute **en local sur ta machine**, prend ton `client_id`/`client_secret` et
> déroule le flux Authorization Code (scopes inclus) pour te restituer
> `access_token` + `refresh_token`. Tu restes maître des secrets ; aucune donnée
> ne transite par un tiers. Sinon, le flux curl 6.1→6.2 ci-dessus suffit.

---

## Étape 7 — Reconfigurer TeslaMate (docker-compose)

Dans le `docker-compose.yml` de **TeslaMate** (pas celui de TeslaMateFix),
service `teslamate`, ajouter sous `environment:` :

```yaml
    environment:
      # ... variables existantes (DATABASE_*, MQTT, etc.) ...
      - TESLA_API_HOST=https://fleet-api.prd.eu.vn.cloud.tesla.com
      - TESLA_AUTH_HOST=https://auth.tesla.com
      - TESLA_AUTH_PATH=/oauth2/v3
      - TESLA_AUTH_CLIENT_ID=<CLIENT_ID>
```

> **Streaming** : la Fleet API ne fournit pas le streaming temps réel sans
> infra dédiée (Fleet Telemetry + PubSub). Si tu ne la montes pas, **désactive
> manuellement le streaming** dans les *Settings* de TeslaMate, sinon erreurs.

---

## Étape 8 — Basculer TeslaMate sur la Fleet API

```bash
# dans le répertoire du docker-compose de TeslaMate
docker compose down
docker compose up -d
```

Puis dans l'UI TeslaMate :

1. ⚠️ **Se déconnecter d'abord** (**Settings → sign out** de l'ancienne session
   Owner API). **Les nouvelles variables `TESLA_*` ne sont prises en compte
   qu'après ce sign-out** : tant que la session Owner API existe, TeslaMate
   continue de taper `owner-api` et tu restes en 403.
2. L'écran de connexion réapparaît et réclame un **token** + **refresh token** :
   coller ceux générés à l'**étape 6** (`access_token` et `refresh_token`).
3. Valider → TeslaMate se connecte désormais via
   `fleet-api.prd.eu.vn.cloud.tesla.com`.

---

## Étape 9 — Vérification

Suivre les logs : plus aucun `403` vers `owner-api`, et des requêtes 200 vers
`fleet-api.prd.eu.vn.cloud.tesla.com` :

```bash
docker compose logs -f teslamate | grep -Ei 'fleet-api|owner-api|403|200'
```

Attendu :

```
GET https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/vehicles/... -> 200
```

Vérifier que de nouveaux points apparaissent dans Grafana / la DB.

---

## Rollback / dépannage

- **403 persiste vers `owner-api`** → TeslaMate utilise encore l'ancienne session :
  refaire l'étape 8.1 (**sign out** — indispensable pour que les `TESLA_*` soient
  relus) ; vérifier que `TESLA_API_HOST` est bien injecté
  (`docker compose config | grep TESLA`).
- **`login_required` / pas de `refresh_token` dans la réponse 6.2** → le scope
  `offline_access` manquait dans l'URL d'autorisation (6.1) ou dans les scopes de
  l'app (étape 1). Le refresh token n'est émis **qu'**avec `offline_access`.
- **`invalid_grant` à l'étape 6.2** → le `code` a expiré (quelques minutes) ou le
  `redirect_uri` ne correspond pas **exactement** à celui enregistré (étape 1).
- **`invalid audience` / login échoue** → vérifier que `audience` (étape 4) et
  `TESLA_API_HOST` (étape 6) pointent la **même région**.
- **partner_accounts échoue** → étape 3 (clé publique non lisible publiquement).
- **Limites de débit** : la Fleet API est plus restrictive que l'Owner API ;
  espacer les intervalles de polling dans TeslaMate si besoin.

---

## Références

- TeslaMate — Fleet API config : <https://docs.teslamate.org/docs/configuration/api/>
- Tesla Fleet API — Auth overview : <https://developer.tesla.com/docs/fleet-api/authentication/overview>
- Tesla Fleet API — Announcements : <https://developer.tesla.com/docs/fleet-api/announcements>
- Discussion tokens Fleet API TeslaMate : <https://github.com/teslamate-org/teslamate/discussions/5291>
