# Release v0.5.1 — checklist

> Document de suivi pour **TeslaMateFix v0.5.1**
> (« Outillage Postman Fleet API + scope `vehicle_location` »).

## État

- Branche : `main` (commit + tag directement, pas de branche dédiée).
- `package.json` version : `0.5.1`.
- Nature : **release doc/outillage uniquement** — aucun changement de code
  applicatif (pas de modif `src/`). Pas de rebuild fonctionnel requis.

## Contexte

Suite à la migration Fleet API (v0.5.0), deux besoins sont apparus :

1. **Tester l'API à la main** pour voir ce que la Fleet API expose réellement
   (Tesla ne publie ni OpenAPI ni collection Postman officielle).
2. **Résoudre un `403` persistant** côté TeslaMate : `vehicle_data` renvoyait
   `Unauthorized missing scopes vehicle_location for vehicle data access` et
   aucune donnée n'était collectée, alors que la migration semblait correcte.

## Périmètre validé

Inchangé depuis v0.3.0 : seuls **création + édition d'une charge** sont validés.
v0.5.1 n'touche pas au scope d'édition — c'est de la doc + de l'outillage.

## Nouveautés

### Collection Postman complète de la Tesla Fleet API

- **`postman/TeslaFleetAPI.postman_collection.json`** — 116 requêtes couvrant
  toute la Fleet API (auth OAuth, user, vehicle data & management, 68 commandes
  véhicule, charging, energy, partner). Endpoints extraits 1:1 de la lib
  open-source `Teslemetry/python-tesla-fleet-api`.
- **`postman/TeslaFleetAPI-EU.postman_environment.json`** — environnement EU
  pré-rempli (base URL régionale, variables token/VIN/scope).
- **`postman/README.md`** — mode d'emploi (import, auth, base_url régional,
  rappel commandes signées vs REST).

### Fix scope `vehicle_location` (403 `vehicle_data`)

- **`docs/FLEET_API_MIGRATION.md`** — `vehicle_location` ajouté aux scopes de
  l'app (étape 1) et à l'URL d'autorisation (étape 6.1), + section dépannage
  enrichie « 403 qui persiste après ré-auth ».

## Pièges documentés (dépannage)

- TeslaMate demande **toujours** `location_data;drive_state` dans `vehicle_data`
  (codé en dur) → le scope `vehicle_location` est **obligatoire**, sinon `403` et
  aucune collecte.
- ⚠️ **Le scope se gère à deux endroits distincts** (cause racine du 403 persistant) :
  - `developer.tesla.com` = scopes *déclarés* par l'application ;
  - **`account.tesla.com`** (Compte → applications tierces) = scopes **réellement
    accordés** par le propriétaire du véhicule. C'est **ici** qu'il faut accorder
    `vehicle_location`, sinon Tesla émet un token sans le scope.
- **Vérifier le token réel** en décodant le JWT (claim `scp`) :
  `echo '<ACCESS_TOKEN>' | cut -d. -f2 | base64 -d | python3 -m json.tool`.
- **Faux positif Postman** : un appel `vehicle_data` sans le paramètre `endpoints`
  /`location_data` passe même avec un token sans le scope → ne pas s'y fier.

## Commit + tag + push

- [ ] `git commit -m "release: v0.5.1 — outillage Postman Fleet API + scope vehicle_location"`
- [ ] `git tag -a v0.5.1 -m "v0.5.1 — Postman Fleet API + vehicle_location"`
- [ ] `git push origin main`
- [ ] `git push origin v0.5.1` ← déclenche `docker-publish`

## Post-push GitHub Actions

- [ ] Vérifier le workflow sur https://github.com/kerkeniw/teslamatefix/actions
      (déclenché par le push du tag `v0.5.1`).
- [ ] `docker pull wkerkeni/teslamatefix:0.5.1` réussit (image inchangée
      fonctionnellement vs 0.5.0).

## Étapes manuelles

- [ ] Vérifier la page Docker Hub `wkerkeni/teslamatefix` (overview à jour, pas
      de synchro nécessaire — release doc only).
