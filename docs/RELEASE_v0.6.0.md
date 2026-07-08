# Release v0.6.0 — checklist

> Document de suivi pour **TeslaMateFix v0.6.0**
> (« Assistant de création de trajet : géocodage d'adresses + calcul d'itinéraire »).

## État

- Branche : `worktree-feat+drive-create-wizard` (worktree dédié `.claude/worktrees/feat+drive-create-wizard`).
- `package.json` version : `0.6.0`.
- Nature : **évolution de code** (nouvelle couche géo, nouvelles server actions,
  réécriture de l'écran de création de trajet). Rebuild de l'image requis.

## Contexte

L'écran de création de trajet (`/drives/new`) n'était qu'un formulaire vide qui
n'enregistrait que la ligne `drives`. Il devient un **assistant** : on saisit
l'adresse de départ et d'arrivée (autocomplétion géocodée avec numéros de rue),
la date/heure de départ, puis on clique **Calculer**. L'app récupère l'état de
départ (dernière position connue avant cette date, sinon saisie manuelle),
calcule l'itinéraire, en déduit les infos d'arrivée et **génère les positions**
(~1 toutes les 30 s). La sauvegarde persiste le trajet **et toutes ses positions**
en une transaction, avec `start/end_position_id` renseignés.

## Nouveautés

### Assistant de création de trajet (`/drives/new`)

- Adresses de départ/arrivée **obligatoires**, saisies via un **combobox géocodé**
  (Nominatim, `addressdetails=1` → numéros de rue).
- Si la recherche ne renvoie rien : lien **« Créer une nouvelle adresse »** qui
  ouvre une **boîte de dialogue** pré-remplie avec le texte saisi, listant les
  adresses les plus proches (géocodeur). À la sélection, tous les champs de
  l'entité `addresses` sont remplis ; « Sauvegarder » crée l'adresse (dédup sur
  `osm_id/osm_type`) et la sélectionne dans le combobox.
- À la validation d'une adresse, si le point tombe dans une **géofence**
  existante, elle est **auto-sélectionnée** (départ/arrivée).
- La **date de départ** n'est plus pré-remplie avec l'heure courante, mais reste
  **obligatoire**.
- Bouton **Calculer** (actif quand départ + arrivée + date sont renseignés) :
  - récupère l'état de départ depuis la dernière position avant la date ;
  - sinon demande **odomètre / niveau batterie / autonomie / température** de départ ;
  - calcule l'itinéraire (OSRM) et **génère les positions** + les infos d'arrivée.
- Aperçu du **tableau des positions** généré.
- **Sauvegarder** n'est actif qu'une fois le calcul effectué ; il enregistre le
  trajet **et toutes les positions** (`prisma.$transaction`).

### Nouvelle couche géo (`src/lib/geo/`)

- `geocode.ts` — Nominatim search + reverse, mapping vers l'entité `addresses`.
- `route.ts` — OSRM `routeBetween` (distance, durée, géométrie).
- `geofence.ts` — `findContainingGeofence` (réutilise `haversineKm`).
- `src/lib/integrity/drive-synth.ts` — synthèse **pure** des positions + résumé
  du trajet (modèle de consommation Wh/km configurable), testée unitairement.

## Configuration (nouvelles variables d'env, toutes optionnelles)

Voir la section *Assistant de création de trajet* de [`.env.example`](../.env.example).

| Variable | Défaut | Rôle |
|---|---|---|
| `GEOCODER_BASE_URL` | `https://nominatim.openstreetmap.org` | Instance Nominatim (search + reverse) |
| `ROUTER_BASE_URL` | `https://router.project-osrm.org` | Instance OSRM (itinéraire) |
| `GEO_USER_AGENT` | `TeslaMateFix/0.6.0 (…)` | User-Agent envoyé à Nominatim (policy) |
| `DRIVE_CONSUMPTION_WH_KM` | `170` | Conso réelle estimée (Wh/km) |
| `DRIVE_RATED_WH_KM` | `150` | Conso de référence de l'autonomie estimée |

> ⚠️ Les instances **publiques** OSM/OSRM sont soumises à une **policy de quota**
> (~1 req/s). Pour un usage régulier, héberger sa propre instance Nominatim/OSRM
> et renseigner `GEOCODER_BASE_URL` / `ROUTER_BASE_URL`.

## Étapes manuelles / checklist de déploiement

1. `pg_dump` de la base TeslaMate avant toute écriture (l'assistant **insère**
   un trajet et des positions réelles).
2. (Optionnel) Renseigner `GEOCODER_BASE_URL` / `ROUTER_BASE_URL` vers des
   instances self-hosted, sinon les défauts publics s'appliquent.
3. (Optionnel) Ajuster `DRIVE_CONSUMPTION_WH_KM` / `DRIVE_RATED_WH_KM` selon le
   véhicule.
4. Rebuild de l'image Docker (nouveau code) puis redéploiement.
5. Vérifier l'accès sortant du conteneur vers le géocodeur/routeur.

## Limitations connues

- **Dénivelé** (`ascent`/`descent`) non calculé (pas d'API d'élévation dans ce
  lot) — laissé à `NULL`.
- La qualité des adresses/itinéraires dépend du géocodeur/routeur configuré.
