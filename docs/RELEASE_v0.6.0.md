# Release v0.6.0 — checklist

> Document de suivi pour la mise en production de **TeslaMateFix v0.6.0**
> (« Édition d'un trajet : layout large + carte du trajet parcouru »).

## État

- Branche : `feat/drive-edit-map` (worktree dédié, branché depuis `origin/main`).
- `package.json` version : `0.6.0`.
- Tests : `npm test` (vitest) — non impactés (aucune logique serveur modifiée).
- Typecheck : propre (`npm run typecheck`).
- Lint : 3 issues **pré-existantes** inchangées (data-table TanStack `useReactTable`,
  `ChargeCreateWizard:585`, `_ignored` dans `charges/actions.ts`). Aucune dans les
  fichiers `drives`.
- Build : `next build` à valider avant tag.

## Contexte

L'écran d'édition d'une charge avait déjà été refondu en layout large à deux
colonnes (formulaire + panneau localisation/carte). L'édition d'un **trajet**
restait sur l'ancien layout étroit mono-colonne et n'exploitait pas les positions
GPS déjà stockées par TeslaMate (`positions.drive_id`). Cette release aligne
l'ergonomie et ajoute la **visualisation cartographique du trajet parcouru**.

## Périmètre

Évolution **UI/lecture** sur l'entité trajet. Aucune modification du schéma de
validation ni des server actions : les noms de champs du formulaire sont
inchangés, les positions sont en lecture seule.

## Nouveautés

### Layout (mirroir de l'édition de charge)

- Page `/drives/[id]` élargie `max-w-4xl` → `max-w-6xl`, idem `/drives/new`.
- Grille `lg:grid-cols-3` : colonne gauche (`col-span-1`) = sections *Temps*,
  *Énergie / Autonomie*, *Performances*, *Météo* ; colonne droite (`col-span-2`)
  = localisation + odomètre + carte.

### Énergie consommée estimée

- Ligne lecture seule « Énergie consommée ≈ X kWh » recalculée en direct dans
  `DriveForm` : `max(0, rated_départ − rated_arrivée) × cars.efficiency`
  (fallback sur le delta *ideal* si *rated* absent ; « — » si efficiency nulle).
- `cars.efficiency` (kWh/km) récupéré côté serveur dans la page d'édition.

### Carte du trajet

- **`src/components/entities/drives/DriveTrackMap.tsx`** *(nouveau)* — carte
  Leaflet (`react-leaflet`), import dynamique `ssr:false`. Marqueurs départ
  (vert) / arrivée (rouge) en `divIcon` (pas de dépendance CDN), cadrage auto
  (`fitBounds`). Hauteur 360px.
- **Colorisation** via boutons radio :
  - *Trajet* : polyline bleue unique.
  - *Puissance* : segments colorés vert foncé (`#006400`) → rouge foncé
    (`#8b0000`), normalisés sur min/max de `positions.power`.
  - *Vitesse* : segments vert → jaune → rouge, normalisés sur min/max de
    `positions.speed`.
  - Garde-fou perf : sous-échantillonnage au-delà de ~800 segments.

### Composants / fichiers

- *Nouveaux* : `DriveTrackMap.tsx`, `DriveLocationPanel.tsx` (panneau droit :
  adresses/géofences, odomètre, carte + sélecteur).
- *Modifiés* : `DriveForm.tsx` (devient la colonne gauche, accepte `locationPanel`
  + `efficiency`), `DriveTabs.tsx`, `DriveCreateClient.tsx`,
  `drives/[id]/page.tsx` (fetch tracé complet `take:5000` + efficiency),
  `drives/new/page.tsx`, `src/messages/{fr,en}.json`.

## Commit + tag + push

- [ ] `npm run build` OK
- [ ] `git add` ciblé (sans les PNG Playwright)
- [ ] `git commit -m "release: v0.6.0 — édition trajet : layout large + carte du trajet (power/vitesse)"`
- [ ] Merge `feat/drive-edit-map` → `main` (ou PR)
- [ ] `git tag -a v0.6.0 -m "v0.6.0 — drive edit map"`
- [ ] `git push origin main`
- [ ] `git push origin v0.6.0` ← déclenche `docker-publish`

## Post-push GitHub Actions

- [ ] Workflow sur https://github.com/kerkeniw/teslamatefix/actions (tag `v0.6.0`).
- [ ] `docker manifest inspect wkerkeni/teslamatefix:0.6.0` → 2 manifests
      (linux/amd64 + linux/arm64).
- [ ] `docker pull wkerkeni/teslamatefix:0.6.0` réussit.

## Étapes manuelles

- [ ] Vérifier l'overview Docker Hub `wkerkeni/teslamatefix` (pas de synchro
      automatique ; la version mentionnée passe à `v0.6.0`).

## Vérification fonctionnelle

- [ ] `/drives/<id>` d'un trajet **avec positions** : layout 1/3 – 2/3, carte
      avec pins départ/arrivée + tracé bleu cadré.
- [ ] Radios *Puissance* / *Vitesse* recolorisent le tracé (vert→rouge /
      vert→jaune→rouge).
- [ ] « Énergie consommée ≈ » se met à jour en éditant l'autonomie *rated*.
- [ ] Enregistrement : modifier odomètre/adresse/géofence → toast « Enregistré »,
      valeurs persistées.
- [ ] Trajet **sans position** → placeholder « Aucune position GPS ».
- [ ] Page **création** (`/drives/new`) : champs localisation/odomètre présents,
      pas de carte.
- [ ] Mode lecture seule (`READ_ONLY`) : champs désactivés, carte visible.
