# Tesla Fleet API — collection Postman

Collection **complète** de la Tesla Fleet API (116 requêtes), générée à partir du mapping 1:1 de la lib open-source [`Teslemetry/python-tesla-fleet-api`](https://github.com/Teslemetry/python-tesla-fleet-api) avec la doc officielle [developer.tesla.com/docs/fleet-api](https://developer.tesla.com/docs/fleet-api).

> ℹ️ TeslaMateFix n'appelle aucune API Tesla — c'est **TeslaMate** qui consomme la Fleet API. Cette collection sert à explorer/tester ce que l'API permet.

## Fichiers
- `TeslaFleetAPI.postman_collection.json` — la collection (à importer)
- `TeslaFleetAPI-EU.postman_environment.json` — environnement pré-rempli pour l'Europe

## Import dans Postman
1. **Import → Files** → sélectionne les deux fichiers `.json`.
2. En haut à droite, sélectionne l'environnement **« Tesla Fleet API - EU »**.

## Variables à renseigner
| Variable | Description |
|---|---|
| `client_id` / `client_secret` | identifiants de ton app sur developer.tesla.com |
| `redirect_uri` | doit correspondre exactement à celui déclaré sur le portail |
| `base_url` | URL régionale (voir ci-dessous) |
| `vin` | VIN du véhicule à tester |
| `energy_site_id` | id d'un site d'énergie (obtenu via `Products`) |

### base_url régional
- **Europe / MEA** : `https://fleet-api.prd.eu.vn.cloud.tesla.com`
- Amérique du Nord / APAC : `https://fleet-api.prd.na.vn.cloud.tesla.com`
- Chine : `https://fleet-api.prd.cn.vn.cloud.tesla.cn`

`GET /api/1/users/region` renvoie l'URL exacte de ton compte.

## Authentification (dossier « Authentication »)
1. **1. Authorize** — copie l'URL `raw` dans un navigateur, connecte-toi, récupère le `?code=` de l'URL de redirection.
2. Colle ce code dans la variable `code`, puis lance **2. Exchange code → tokens**. Les `access_token` / `refresh_token` sont **enregistrés automatiquement** (test-script).
3. **3. Refresh** quand l'access_token expire (~8 h).
4. **4. Partner token** (client_credentials) — requis seulement pour les endpoints `/partner_accounts`.

Toutes les autres requêtes utilisent `{{access_token}}` en Bearer au niveau de la collection.

## ⚠️ Commandes véhicule
Depuis fin 2024, la plupart des commandes (dossier **« Vehicle Commands »**) doivent être **signées** via le Tesla Vehicle Command Protocol. En REST direct elles renvoient une erreur de signature sur les véhicules récents — c'est attendu. L'endpoint `signed_command` attend un `RoutableMessage` protobuf signé (produit par le SDK / `tesla-http-proxy`), pas un body écrit à la main.

✅ Fonctionnent en REST simple : auth, `users/*`, `vehicles` + `vehicle_data`, `products`, `dx/charging/*`, lecture énergie, `partner_accounts`.

## Régénérer
Le script de génération est `/tmp/gen_postman.py` (non versionné). Source des endpoints : `Teslemetry/python-tesla-fleet-api` (dossier `tesla_fleet_api/tesla/`).
