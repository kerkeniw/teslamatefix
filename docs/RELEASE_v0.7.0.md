# Release v0.7.0 — checklist

> Document de suivi pour la mise en production de **TeslaMateFix v0.7.0**.
> Cette release **regroupe quatre chantiers** livrés ensemble :
> 1. **Assistant de création de trajet** — géocodage d'adresses + calcul d'itinéraire.
> 2. **Trajets** — édition en layout large + carte du trajet, listing façon Grafana
>    « Drives », détection et correction d'anomalies depuis les positions.
> 3. **Positions** — carte géographique + filtres quick-range + chargement AJAX incrémental.
> 4. **Charges (stabilisation)** — faux chevauchement des sessions ouvertes, coût
>    calculé depuis la géofence, autonomies depuis le SOC, listing aligné.

## État

- Branche d'intégration : `release/v0.7.0` (worktree dédié `.claude/worktrees/release+v0.7.0`),
  issue de la fusion de trois branches branchées depuis `origin/main` (v0.5.2) :
  - `feat/drive-edit-map` (édition trajet + carte) — était numérotée v0.6.0 ;
  - `worktree-feat+drive-create-wizard` (assistant de création) — était numérotée v0.6.0 ;
  - `feat/positions-map` (carte positions) — v0.7.0.
- `package.json` version : `0.7.0`.
- Nature : **évolution de code** (nouvelle couche géo, nouvelles server actions,
  refonte des écrans trajet/positions). Rebuild de l'image Docker requis.
- Tests : `npm test` (vitest) — **129 tests OK** au 2026-09-23 (dont `drive-synth`,
  `drives` — correction —, `nearest-by-date`, `charge-cost`, chevauchement).
- Commits ajoutés après la consolidation initiale (documentés ci-dessous) :
  `bd4a7b4`, `76eed11` (raffinements de l'assistant). Les commits `91d9f9b`,
  `125f489`, `f4d8a79`, `981aada` venus de `feat/drive-edit-map` (listing +
  correction) sont désormais décrits en Partie 2 bis.
- Typecheck : propre (`npm run typecheck`).
- Lint : 3 issues **pré-existantes** inchangées (data-table TanStack `useReactTable`,
  `ChargeCreateWizard:585`, `_ignored` dans `charges/actions.ts`). Aucune dans les
  nouveaux fichiers.
- Build : `next build` OK (nécessite `AUTH_SECRET` ≥ 32 c. + `DATABASE_URL` en env,
  fournis par l'entrypoint Docker ; en local, exporter des valeurs factices).

## Périmètre

- **Trajets — création (`/drives/new`)** : réécriture en assistant, **nouvelles**
  server actions de lecture/calcul et **écriture** (insertion trajet + positions).
- **Trajets — édition (`/drives/[id]`)** : layout + carte (UI/lecture, détail dans
  [`RELEASE_v0.6.0.md`](RELEASE_v0.6.0.md)) **et nouvelle écriture** : correction
  d'anomalies (`applyCorrectDriveAction`, écrit `drives` + `positions.drive_id`,
  contourne `READ_ONLY`). Schéma de validation du formulaire inchangé.
- **Trajets — listing (`/drives`)** : lecture seule, nouvelle requête SQL brute
  (`list-query.ts`).
- **Positions (`/positions`)** : évolution **UI/lecture** ; une seule server action
  de **lecture** ajoutée (lots carte). Schéma Zod, actions d'écriture et
  `/positions/[id]` **inchangés**. Tableau borné à 31 j maintenu ; carte sans plafond.

---

## Partie 1 — Assistant de création de trajet (`/drives/new`)

### Contexte

L'écran de création de trajet n'était qu'un formulaire vide qui n'enregistrait que
la ligne `drives`. Il devient un **assistant** : on saisit l'adresse de départ et
d'arrivée (recherche dans les adresses connues), la date/heure de départ,
puis on clique **Calculer**. L'app récupère l'état de départ (dernière position
connue avant cette date, sinon saisie manuelle), calcule l'itinéraire, en déduit les
infos d'arrivée et **génère les positions** (~1 toutes les 30 s). La sauvegarde
persiste le trajet **et toutes ses positions** en une transaction, avec
`start/end_position_id` renseignés.

### Nouveautés

- Adresses de départ/arrivée **obligatoires**, recherchées **dans la table
  `addresses`** (`searchAddressOptionsWithCoords`, `src/app/actions/search-addresses.ts`).
- Si la recherche ne renvoie rien : lien **« Créer une nouvelle adresse »** ouvrant
  une **boîte de dialogue** qui interroge Nominatim (`addressdetails=1` → numéros de
  rue) et liste les adresses les plus proches. À la sélection, tous les champs
  `addresses` sont remplis ; « Sauvegarder » crée l'adresse (dédup
  `osm_id/osm_type`) et la sélectionne.
- À la validation d'une adresse, si le point tombe dans une **géofence** existante,
  elle est **auto-sélectionnée** (départ/arrivée).
- La **date de départ** n'est plus pré-remplie avec l'heure courante, mais reste
  **obligatoire**.
- Bouton **Calculer** (actif quand départ + arrivée + date sont renseignés) :
  récupère l'état de départ depuis la dernière position avant la date, sinon demande
  **odomètre / batterie / autonomie / température** ; calcule l'itinéraire (OSRM) et
  **génère les positions** + infos d'arrivée. Aperçu du **tableau des positions**.
- **Sauvegarder** n'est actif qu'après calcul ; enregistre le trajet **et toutes les
  positions** (`prisma.$transaction`).

### Raffinements (`bd4a7b4`, `76eed11`)

- **Capacité datée** : `estimateFullRange` utilise la mesure de capacité la plus
  proche de la date de départ (helper pur `pickNearestByDate`,
  `src/lib/integrity/nearest-by-date.ts`, testé).
- **Résumé calculé éditable** : inputs contrôlés liés à `computed.drive` ; la
  sauvegarde persiste les valeurs saisies. Les positions se régénèrent via
  « Calculer ».
- **État de départ manuel** : nouvelle action `estimateStartRangesAction` qui déduit
  les autonomies ideal/rated du % batterie (remplissage automatique avec délai,
  champs éditables) + bouton **Calculer** dans la section, qui active « Créer le
  trajet ».

### Nouvelle couche géo (`src/lib/geo/`)

- `geocode.ts` — Nominatim search + reverse, mapping vers l'entité `addresses`.
- `route.ts` — OSRM `routeBetween` (distance, durée, géométrie).
- `geofence.ts` — `findContainingGeofence` (réutilise `haversineKm`).
- `src/lib/integrity/drive-synth.ts` — synthèse **pure** des positions + résumé du
  trajet (modèle de consommation Wh/km configurable), testée unitairement.

---

## Partie 2 — Édition d'un trajet : layout large + carte

L'écran d'édition d'un trajet adopte la mise en page large de l'édition de charge et
gagne une **carte du trajet parcouru** :

- **Layout deux colonnes** (1/3 – 2/3) : sections *Temps* / *Énergie–Autonomie* /
  *Performances* / *Météo* à gauche ; localisation + odomètre + carte à droite.
- **Énergie consommée estimée** dérivée du delta d'autonomie *rated* (à défaut
  *ideal*) × `cars.efficiency`.
- **Carte Leaflet** du trajet : marqueurs départ/arrivée, tracé de toutes les
  positions GPS, cadrage automatique, **colorisation** (Trajet / Puissance / Vitesse).

Détail complet et checklist de cette partie : [`RELEASE_v0.6.0.md`](RELEASE_v0.6.0.md)
(conservé comme historique).

---

## Partie 2 bis — Listing des trajets + correction d'anomalies

Commits `91d9f9b`, `125f489`, `f4d8a79`, `981aada` (branche `feat/drive-edit-map`).

### Listing `/drives` façon Grafana « Drives »

- Requête SQL brute `src/lib/drives/list-query.ts` reprenant la CTE Grafana :
  adresses/géofences fusionnées, % batterie départ/arrivée, vitesse moyenne,
  `range_diff` selon `preferred_range`, ❄ autonomie réduite (limitée à la page).
- Filtres Grafana : distance min, vitesse moyenne min (colonne calculée), géofence
  départ **ou** arrivée (`GeofenceMultiSelect`), texte de localisation, dates,
  `open_only`. Pagination offset + `COUNT` exact conservés.
- Unités lues dans les `settings` TeslaMate (`src/lib/units.ts`) ; efficacité/conso
  avec bascule *slope-adjusted* / *by-distance* ; `formatDuration` partagé
  (`src/lib/format/duration.ts`).
- `DataTable` : visibilité des colonnes pilotée par le parent (menu « Colonnes »
  mémorisé en localStorage), `scrollX`, mode `dense` ; `/charges` inchangé.
- Date, départ, arrivée = liens (trajet, géofence ou adresse) ; page pleine largeur.

### Détection + correction d'anomalies

- Anomalies détectées : trajet non fermé, odomètre/autonomie d'arrivée manquants,
  positions au-delà de `end_date`, distance/durée nulle → bandeau compact.
- Moteur unifié `correctDriveFromPositions` / `applyDriveCorrection`
  (`src/lib/integrity/drives.ts`) : recalcule **tous** les champs depuis les
  positions (dates, `*_position_id`, odomètre, autonomies via 1re/dernière valeur
  non nulle, distance, durée, dénivelés, vitesse max, `power_max/min`, températures
  moyennes, adresse ≤ 50 m, géofence contenante).
- **Absorption des positions orphelines** de fin (`drive_id` NULL jusqu'au premier
  `speed = 0`) et réaffectation de leur `drive_id`, en transaction.
- UI : `DriveCorrectionDialog` (popin, calcul à l'ouverture, aperçu avant/après,
  Appliquer ferme + rafraîchit) ; l'onglet Recalcul et `RecalcPanel` sont supprimés.
- Barre d'actions flottante (Enregistrer / Annuler / Corriger / Supprimer), en-tête
  façon charge, espacement resserré sur tous les écrans d'édition, `isolate` sur
  les cartes Leaflet (les dialogues passent au-dessus).
- Tests purs : `computeDriveCorrection`, `selectTrailingToAbsorb`
  (`tests/unit/drives.test.ts`).
- ⚠️ `applyCorrectDriveAction` **contourne volontairement `READ_ONLY`** et accepte
  le payload `after` calculé côté client sans le revalider (cf.
  [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md), addendum v0.7.0).

---

## Partie 3 — Positions : carte géographique + filtres

### Contexte

La page `/positions` n'était qu'une liste tabulaire paginée. Or les positions sont
avant tout des **points GPS** : les inspecter et corriger a plus de sens dans leur
**contexte spatial**. Cette partie transforme la page en outil d'exploration
cartographique inspiré du dashboard Grafana de TeslaMate. Sur une table de 4 M+
lignes, la carte est passée en **chargement AJAX par lots** (affichage incrémental),
ce qui lève le plafond de plage côté carte et permet un **filtre de trajets**.

### Layout carte + filtres + tableau

- Page `/positions` élargie `max-w-6xl` → `max-w-[1600px]`.
- Grille `lg:grid-cols-4` : **filtres** (`col-span-1`) + **carte** (`col-span-3`),
  puis **tableau pleine largeur** en dessous.

### Défaut 7 jours + plages rapides (quick ranges façon Grafana)

- À l'ouverture sans paramètre : plage **7 derniers jours** d'office.
- **Menu déroulant groupé** reprenant la liste Grafana **hors fiscales** : Relatives
  (`1h…5y`), Journée (`today, todaySoFar, yesterday…`), En cours (`thisWeek(SoFar)…`),
  Précédentes (`previousWeek/Month/Year`).
- Possible car la **carte n'a plus de plafond de plage** ; le **tableau** reste borné
  à 31 j (`map.tableLimited`).
- Preset actif mémorisé dans l'URL (`?qr=…`) ; saisie manuelle ⇒ « Personnalisé ».
- Définitions dans `src/lib/positions/quick-ranges.ts` (`QUICK_RANGE_GROUPS`,
  `computeQuickRange`).

### Carte multi-trajets

- **`PositionsMap.tsx`** — Leaflet (`react-leaflet`), import dynamique `ssr:false`.
  **Une polyline par trajet** (couleur dérivée du `driveId`, stable carte↔liste),
  marqueurs départ/arrivée, `CircleMarker` gris hors trajet. Popup par point + lien
  d'édition. `FitBounds` **une fois par plage**. Décimation côté client. Hauteur `70vh`.

### Chargement AJAX incrémental (batches)

- **`src/app/[locale]/positions/map-actions.ts`** *(nouveau)* — Server Action
  `fetchPositionMapBatchAction({ driveId, from, to, cursor })` → `{ points, nextCursor,
  done }`. Curseur `id` croissant, `take BATCH_SIZE+1`, scope `car_id`, **sans plafond
  31 j**.
- **`PositionsMapPanel.tsx`** *(refonte — orchestrateur)* — remonté via `key` sur la
  plage, boucle de lots (`runBatchLoop`), append incrémental, arrêt à `SAFETY_CAP =
  60000` puis **« charger plus »**.
- **`src/lib/positions/map-points.ts`** *(refonte)* — helpers purs : `serializeMapPoint`,
  `groupPoints`, `subsampleTrack` (`MAX_POINTS_PER_DRIVE = 400`, `MAX_LOOSE_POINTS =
  600`), `driveColor`. `BATCH_SIZE = 2000`, `SAFETY_CAP = 60000`.

### Filtre de trajets (cases à cocher)

- **`DriveFilterList.tsx`** *(nouveau)* — liste cochable (`#id · date · distance`,
  pastille couleur), case **« hors trajet »**, boutons **« tout / aucun »**. Filtre
  **client** instantané, alignée sur la hauteur de la carte (scroll interne).
- **Liste chronologique et progressive** dérivée des points déjà chargés
  (`loadedDriveIds`/`firstDateByDrive` → `displayedDrives` triés `start_date` asc.).
  Métadonnées via la requête SSR `drives` (`take: 1000`). Sélection modélisée par
  `hiddenDrives` (défaut vide = tout visible).

### Tableau complet

- `PositionListClient` affiche désormais **tous les champs** de `positions`
  (`SCALAR_COLUMNS`) dans un conteneur `overflow-x-auto`. Booléens `✓/✗/—`. Sélection
  multiple + suppression en masse conservées.

---

## Partie 4 — Stabilisation des charges

Retours d'usage du 2026-09-23 sur l'édition des charges, corrigés directement sur
`main` avant publication.

### 1. Listing des charges aligné sur les trajets

- La **date de début** est un lien vers l'édition de la charge (même style que
  `/drives`) ; la colonne « stylo » est supprimée
  (`ChargeDataTableColumns.tsx`).

### 2. « Chevauche une autre session » à tort (cas charge 297)

- **Cause** : TeslaMate laisse parfois une session interrompue **ouverte**
  (`end_date` NULL). Ici les sessions **248** (30/07) et **251** (31/07).
  `findOverlappingSession` la considérait sans fin → elle chevauchait **toute**
  charge postérieure : impossible de modifier les dates d'une charge après le 30/07.
- **Correctif** (`src/lib/integrity/charges.ts`) : une session ouverte a désormais
  une **fin effective** = date de son dernier tick (ou `start_date` sans tick).
  Helper pur `overlapsEffective`, testé.
- Le message d'erreur **nomme la session en conflit** : « Chevauche la session de
  charge #248 (30/07/2026 02:58 → non terminée). »

### 3. Coût calculé depuis le tarif de la géofence

- Helper pur `computeChargeCost` (`src/lib/integrity/charge-cost.ts`), règle
  TeslaMate : `per_kwh` → tarif × max(énergie consommée, ajoutée) ; `per_minute` →
  tarif × durée ; + frais de session.
- Écran d'édition : quand l'utilisateur modifie l'énergie consommée ou ajoutée, la
  géofence ou les dates (tarif à la minute), **le coût est recalculé
  automatiquement**. Une aide sous le champ montre le calcul (ex. « 11.17 kWh ×
  0.16 — Domicile Corbeil = 1.79 ») ou signale l'absence de tarif. Le coût reste
  modifiable ; rien n'est écrasé à l'ouverture.
- Plomberie : action `getGeofenceBillingAction` (`src/app/actions/geofence-billing.ts`),
  `onChange` optionnel sur `FKCombobox`, géofence hissée dans `ChargeTabs`.

### 4. Autonomies déduites du SOC

- Quand l'utilisateur modifie le **SOC de départ** (resp. **d'arrivée**), les
  autonomies idéale et rated correspondantes sont remplies automatiquement :
  autonomie à 100 % mesurée au plus près de la date de début (resp. de fin) × SOC.
- `estimateFullRange` est extrait des trajets vers `src/lib/integrity/full-range.ts`
  (+ `estimateRangesAtLevel`), partagé avec l'assistant de création de trajet
  (comportement inchangé). Action `estimateChargeRangesAction`
  (`src/app/actions/estimate-charge-ranges.ts`).

### Divers

- `eslint.config.mjs` : `.claude/**` ignoré — `npm run lint` scannait les worktrees
  (copies complètes du repo) et ne se terminait plus.

---

## Configuration (nouvelles variables d'env, toutes optionnelles)

Voir la section *Assistant de création de trajet* de [`.env.example`](../.env.example).

| Variable | Défaut | Rôle |
|---|---|---|
| `GEOCODER_BASE_URL` | `https://nominatim.openstreetmap.org` | Instance Nominatim (search + reverse) |
| `ROUTER_BASE_URL` | `https://router.project-osrm.org` | Instance OSRM (itinéraire) |
| `GEO_USER_AGENT` | `TeslaMateFix/0.7.0 (…)` | User-Agent envoyé à Nominatim (policy) |
| `DRIVE_CONSUMPTION_WH_KM` | `170` | Conso réelle estimée (Wh/km) |
| `DRIVE_RATED_WH_KM` | `150` | Conso de référence de l'autonomie estimée |

> ⚠️ Les instances **publiques** OSM/OSRM sont soumises à une **policy de quota**
> (~1 req/s). Pour un usage régulier, héberger sa propre instance Nominatim/OSRM.

## Commit + tag + push

- [x] `npm run build` OK (2026-09-23 — 129 tests, typecheck propre, lint : 3 pré-existants)
- [x] `git add` ciblé (sans les PNG Playwright)
- [x] Merge `release/v0.7.0` → `main` (fast-forward, en local — 2026-09-23)
- [x] Commit des corrections charges sur `main`
- [x] `git tag -fa v0.7.0 -m "v0.7.0 — trajets (listing, correction, assistant), positions (carte) & stabilisation charges"` (en local, tag déplacé sur ce commit)
- [ ] `git push origin main` ← **à faire manuellement**
- [ ] `git push origin v0.7.0` ← **à faire manuellement**, déclenche `docker-publish`

## Post-push GitHub Actions

- [ ] Workflow sur https://github.com/kerkeniw/teslamatefix/actions (tag `v0.7.0`).
- [ ] `docker manifest inspect wkerkeni/teslamatefix:0.7.0` → 2 manifests
      (linux/amd64 + linux/arm64).
- [ ] `docker pull wkerkeni/teslamatefix:0.7.0` réussit.

## Étapes manuelles / déploiement

- [ ] `pg_dump` de la base TeslaMate avant toute écriture (l'assistant **insère** un
      trajet et des positions réelles).
- [ ] (Optionnel) Renseigner `GEOCODER_BASE_URL` / `ROUTER_BASE_URL` self-hosted.
- [ ] (Optionnel) Ajuster `DRIVE_CONSUMPTION_WH_KM` / `DRIVE_RATED_WH_KM`.
- [ ] Vérifier l'accès sortant du conteneur vers le géocodeur/routeur.
- [ ] Vérifier l'overview Docker Hub `wkerkeni/teslamatefix` (pas de synchro auto ;
      version mentionnée passe à `v0.7.0`).

## Vérification fonctionnelle

### Assistant de création (`/drives/new`)

- [ ] Autocomplétion d'adresse (numéros de rue) ; « Créer une nouvelle adresse »
      ouvre le dialog, crée et sélectionne l'adresse.
- [ ] Géofence auto-sélectionnée quand le point tombe dans une zone.
- [ ] **Calculer** : état de départ (auto ou manuel), itinéraire + positions générées,
      aperçu du tableau ; **Sauvegarder** persiste trajet + positions.

### Édition d'un trajet (`/drives/[id]`)

- [ ] Layout large deux colonnes ; carte du trajet ; colorisation Trajet/Puissance/Vitesse.

### Listing + correction des trajets

- [ ] `/drives` : colonnes Grafana, filtres (distance, vitesse, géofence, texte,
      dates, non fermés), menu « Colonnes » mémorisé, liens des cellules.
- [ ] Trajet en anomalie : bandeau affiché ; « Corriger » → aperçu avant/après ;
      Appliquer met à jour le trajet et rattache les positions orphelines.
- [ ] Barre d'actions flottante visible en bas sur desktop et mobile.

### Positions (`/positions`)

- [ ] Sans paramètre : ouvre sur **7 derniers jours**, points **par lots** (compteur).
- [ ] Menu de plages (Relatives / Journée / En cours / Précédentes) met à jour URL et
      relance carte + tableau ; dates manuelles ⇒ « Personnalisé ».
- [ ] Liste des trajets se remplit **au fil des lots**, **ordre chronologique**,
      scroll interne.
- [ ] Cases à cocher : masquage instantané ; « hors trajet » et « tout / aucun » OK ;
      pastille = couleur trace.
- [ ] Changer de plage en cours de chargement : ancien chargement stoppé.
- [ ] `SAFETY_CAP` atteint : bouton **« charger plus »**.
- [ ] Plage > 31 j : carte complète, tableau affiche `map.tableLimited`.
- [ ] Responsive mobile + **dark mode**.

### Charges (stabilisation)

- [ ] `/charges` : date cliquable, plus de colonne stylo.
- [ ] `/charges/297` : début ramené à 00:00 (heure locale) → enregistrement OK.
- [ ] `/charges/248` puis `/charges/251` : onglet Recalcul → sessions fermées
      (`end_date` renseignée).
- [ ] 297 : modifier l'énergie consommée → coût = énergie × 0.16 ; changer de géofence
      → coût recalculé avec le nouveau tarif ; géofence sans tarif → aide explicite.
- [ ] Modifier le SOC de départ / d'arrivée → autonomies remplies (modifiables).
- [ ] Ouvrir une charge sans rien toucher → coût et autonomies inchangés.

## Limitations connues

- **Dénivelé** (`ascent`/`descent`) non calculé par l'assistant (pas d'API d'élévation
  dans ce lot) — laissé à `NULL`.
- La qualité des adresses/itinéraires dépend du géocodeur/routeur configuré.
- La **correction de trajet** contourne `READ_ONLY` (choix assumé, à réévaluer en
  v0.8.0 — cf. [`ROADMAP.md`](ROADMAP.md)).
- Plan de recette complet : [`TEST_PLAN.md`](TEST_PLAN.md).
