# Release v0.7.0 — checklist

> Document de suivi pour la mise en production de **TeslaMateFix v0.7.0**
> (« Positions : carte géographique + filtres quick-range, chargement AJAX
> incrémental et filtre de trajets »).

## État

- Branche : `feat/positions-map` (worktree dédié, branché depuis `feat/drive-edit-map`
  pour réutiliser la logique carte Leaflet ; à merger **après** v0.6.0).
- `package.json` version : `0.7.0`.
- Tests : `npm test` (vitest) — non impactés (helpers purs ajoutés, aucune logique
  serveur existante modifiée).
- Typecheck : propre (`npm run typecheck`).
- Lint : 3 issues **pré-existantes** inchangées (data-table TanStack `useReactTable`,
  `ChargeCreateWizard:585`, `_ignored` dans `charges/actions.ts`). Aucune dans les
  nouveaux fichiers `positions`.
- Build : `next build` OK (nécessite `AUTH_SECRET` ≥ 32 c. + `DATABASE_URL` en env,
  fournis par l'entrypoint Docker ; en local, exporter des valeurs factices).

## Contexte

La page `/positions` n'était qu'une liste tabulaire paginée, avec un simple filtre
plage de dates / trajet. Or les positions sont avant tout des **points GPS** : les
inspecter et corriger a beaucoup plus de sens dans leur **contexte spatial**. Cette
release transforme la page en outil d'exploration cartographique inspiré du
dashboard Grafana de TeslaMate.

Sur une table `positions` de 4 M+ lignes, charger la carte en une requête serveur
bloquait le rendu et **plafonnait la plage à 31 jours**. La carte est donc passée en
**chargement AJAX par lots** (affichage incrémental), ce qui lève le plafond de plage
côté carte et permet d'ajouter un **filtre de trajets** (cases à cocher).

## Périmètre

Évolution **UI/lecture** sur la liste des positions. Le schéma Zod, les server
actions d'écriture (`create/update/delete/bulkDelete`) et l'écran d'édition
`/positions/[id]` sont **inchangés** (une seule server action de **lecture** ajoutée
pour les lots). La carte n'a plus de plafond de plage ; le **tableau conserve** son
garde-fou 31 jours (`car_id` + plage, ou `drive_id`).

## Nouveautés

### Layout carte + filtres + tableau

- Page `/positions` élargie `max-w-6xl` → `max-w-[1600px]`.
- Grille `lg:grid-cols-4` : **filtres** (`col-span-1`, gauche) + **carte**
  (`col-span-3`, droite), puis **tableau pleine largeur** en dessous.

### Défaut 7 jours + plages rapides (quick ranges façon Grafana)

- À l'ouverture sans paramètre : plage **7 derniers jours** appliquée d'office.
- **Menu déroulant groupé** (`Select` base-ui) reprenant la liste Grafana **hors
  fiscales** :
  - *Relatives* : `1h, 6h, 12h, 24h, 2d, 7d, 30d, 90d, 6mo, 1y, 2y, 5y`.
  - *Journée* : `today, todaySoFar, yesterday, dayBeforeYesterday, thisDayLastWeek`.
  - *En cours* : `thisWeek(SoFar), thisMonth(SoFar), thisYear(SoFar)`.
  - *Précédentes* : `previousWeek, previousMonth, previousYear`.
- Désormais possible car la **carte n'a plus de plafond de plage** (chargement AJAX).
  Le **tableau** reste borné à 31 j (`map.tableLimited`).
- Preset actif mémorisé dans l'URL (`?qr=...`) ; une saisie manuelle de la plage
  efface le preset → le dropdown affiche « Personnalisé ».
- Définitions et groupes dans `src/lib/positions/quick-ranges.ts`
  (`QUICK_RANGE_GROUPS`, `computeQuickRange`).

### Carte multi-trajets

- **`PositionsMap.tsx`** — Leaflet (`react-leaflet`), import dynamique `ssr:false`.
  **Une polyline par trajet** (couleur dérivée du `driveId`, stable entre carte et
  liste), marqueurs départ/arrivée en `divIcon`, `CircleMarker` gris pour les
  positions **hors trajet**. Popup par point (id, date, vitesse, puissance) + lien
  vers l'édition. `FitBounds` **une seule fois par plage** (pas à chaque lot).
  Regroupement + décimation **côté client**. Hauteur `70vh`.

### Chargement AJAX incrémental (batches)

- **`src/app/[locale]/positions/map-actions.ts`** *(nouveau)* — Server Action
  `fetchPositionMapBatchAction({ driveId, from, to, cursor })` → `{ points,
  nextCursor, done }`. Curseur `id` croissant, `take BATCH_SIZE+1`, scope `car_id`,
  **sans plafond de plage 31 j**. Appelée en boucle depuis le client.
- **`PositionsMapPanel.tsx`** *(refonte — orchestrateur)* — remonté via `key` sur la
  plage (état neuf, annulation naturelle). Boucle de lots (`runBatchLoop`, fonction
  module-level → `setState` seulement post-await, lint propre), **append incrémental**,
  progression « N points », arrêt à `SAFETY_CAP = 60000` puis **« charger plus »**.
- **`src/lib/positions/map-points.ts`** *(refonte)* — helpers purs client/serveur :
  `serializeMapPoint`, `groupPoints` (regroupe par trajet + tri date), `subsampleTrack`
  (`MAX_POINTS_PER_DRIVE = 400`, `MAX_LOOSE_POINTS = 600`), `driveColor`. Constantes
  `BATCH_SIZE = 2000`, `SAFETY_CAP = 60000`.

### Filtre de trajets (cases à cocher)

- **`DriveFilterList.tsx`** *(nouveau)* — liste cochable des trajets (`#id · date ·
  distance`, pastille couleur), case **« hors trajet »**, boutons **« tout / aucun »**.
  Filtre **client** (visibilité instantanée, aucun rechargement). Alignée sur la hauteur
  de la carte (`aside` borné `lg:h-[70vh]`, zone scroll `flex-1 min-h-0 max-h-[70vh]`).
- **Liste chronologique et progressive** : la liste affichée est **dérivée des points
  déjà chargés** (`PositionsMapPanel` : `loadedDriveIds`/`firstDateByDrive` mémoïsés →
  `displayedDrives` triés `start_date` ascendant) ; elle **grandit au fil des lots**. La
  requête SSR `drives` (`page.tsx`, `take: 1000`) sert de **source de métadonnées**
  (date/distance). Sélection modélisée par `hiddenDrives` (défaut vide = tout visible),
  cohérente carte↔liste.

### Tableau complet

- `PositionListClient` affiche désormais **tous les champs** de `positions` (colonnes
  générées via `SCALAR_COLUMNS`) dans un conteneur `overflow-x-auto`. Booléens rendus
  `✓/✗/—`. Sélection multiple + suppression en masse conservées. Cartes mobiles :
  champs principaux uniquement.

### Composants / fichiers

- *Nouveaux* : `src/lib/positions/quick-ranges.ts`, `src/lib/positions/map-points.ts`,
  `src/app/[locale]/positions/map-actions.ts`, `PositionsMap.tsx`,
  `PositionsMapPanel.tsx`, `DriveFilterList.tsx`.
- *Modifiés* : `positions/page.tsx` (tableau cursor + requête `drives`, carte déléguée
  en AJAX, défaut 7 j), `PositionFilters.tsx` (layout vertical + quick ranges),
  `PositionListClient.tsx` (tous les champs + `inactiveNotice`),
  `src/messages/{fr,en}.json` (`filters.quickRanges.*`, `map.*`).

## Commit + tag + push

- [ ] `npm run build` OK
- [ ] `git add` ciblé (sans les PNG Playwright)
- [ ] `git commit -m "release: v0.7.0 — positions : carte + filtres quick-range + tableau complet"`
- [ ] Merge `feat/positions-map` → `main` (après merge de `feat/drive-edit-map`)
- [ ] `git tag -a v0.7.0 -m "v0.7.0 — positions map"`
- [ ] `git push origin main`
- [ ] `git push origin v0.7.0` ← déclenche `docker-publish`

## Post-push GitHub Actions

- [ ] Workflow sur https://github.com/kerkeniw/teslamatefix/actions (tag `v0.7.0`).
- [ ] `docker manifest inspect wkerkeni/teslamatefix:0.7.0` → 2 manifests
      (linux/amd64 + linux/arm64).
- [ ] `docker pull wkerkeni/teslamatefix:0.7.0` réussit.

## Étapes manuelles

- [ ] Vérifier l'overview Docker Hub `wkerkeni/teslamatefix` (pas de synchro
      automatique ; la version mentionnée passe à `v0.7.0`).

## Vérification fonctionnelle

- [ ] `/positions` sans paramètre : ouvre sur les **7 derniers jours** ; la page
      s'affiche immédiatement, les points **apparaissent par lots** (compteur qui
      progresse), preset « 7 jours » surligné.
- [ ] **Menu déroulant de plages** : groupes Relatives / Journée / En cours /
      Précédentes ; sélectionner « Last 90 days », « This month », « Previous week »…
      met à jour URL (`?from&to&qr`), relance la carte et le tableau ; le preset
      sélectionné s'affiche dans le trigger ; dates manuelles ⇒ « Personnalisé ».
- [ ] **Liste des trajets** : démarre vide puis **se remplit au fil des lots**, dans
      l'**ordre chronologique** (plus ancien → plus récent) ; occupe la hauteur de la
      carte avec **scroll interne** quand elle dépasse.
- [ ] **Cases à cocher trajets** : décocher un trajet le masque instantanément ;
      « hors trajet » et « tout / aucun » fonctionnent ; couleur pastille = couleur trace.
- [ ] Carte : une **polyline distincte par trajet**, marqueurs départ/arrivée, points
      gris hors trajet ; popup d'un point → lien « Éditer » ouvre `/positions/[id]`.
- [ ] **Changer de quick range en cours de chargement** : l'ancien chargement s'arrête,
      le nouveau repart de zéro (pas de mélange de plages).
- [ ] **Grande plage** atteignant `SAFETY_CAP` : pause + bouton **« charger plus »**
      poursuit le chargement.
- [ ] Plage manuelle **> 31 jours** : la **carte se remplit** sur toute la période ; le
      **tableau** affiche `map.tableLimited` (garde-fou tableau maintenu).
- [ ] Filtre par `drive_id` : carte = ce seul trajet, pas de plage de dates.
- [ ] Responsive mobile (cartes empilées) et **dark mode** (conteneur carte lisible).
