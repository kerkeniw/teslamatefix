# Release v0.4.0 — checklist

> Document de suivi pour la mise en production de **TeslaMateFix v0.4.0**
> (« refonte UI de l'écran charge + header mobile »).

## État

- Branche : `main` (commit + tag directement, pas de branche dédiée).
- `package.json` version : `0.4.0`.
- Tests : 93 verts.
- Typecheck : propre.
- Lint : 3 issues pré-existantes inchangées (data-table TanStack `useReactTable`,
  `ChargeCreateWizard:585`, `_ignored` dans `actions.ts`).

## Périmètre validé

Inchangé depuis v0.3.0 : seuls **création + édition d'une charge** sont
validés. Les autres entités restent en consultation. La v0.4.0 est une
**refonte d'expérience utilisateur** sans extension fonctionnelle du scope.

## Nouveautés UX

### Écran charge `/charges/[id]`

- **Carte Leaflet** (`react-leaflet@5` + `leaflet@1.9`) — panneau droit
  sur l'onglet Session uniquement, centrée sur la position de la charge,
  marker OSM. Implémentée dans `LeafletMap.tsx` (dynamic import `ssr: false`
  + patch des icônes via CDN).
- **`ChargeBatteryDeltaToggle`** dans le titre : affichage `start → end`
  (SOC ou km) avec picto SVG inline (corps + terminal en `currentColor`,
  fill `green-500` proportionnel à `endSoc`). Bouton ghost pour basculer
  entre `%` et `km` d'autonomie idéale.
- **`ChargeLocationPanel`** : carte + odomètre + température extérieure
  + checkbox *Appliquer aux ticks* + adresse + géofence dans un seul card.
  Les inputs cachés (`outside_temp_avg`, `outside_temp_avg_initial`,
  `outside_temp_avg_apply_all`, `address_id`, `geofence_id`) sont rattachés
  au formulaire principal via l'attribut HTML5 `form="charge-session-form"`.
- **Section Borne scindée** : type + puissance + *Appliquer défauts* /
  *Annuler* + bouton *Détails* en colonne gauche après Énergie ; les 10
  champs (`charger_voltage`, `charger_phases`, `charger_actual_current`,
  `charger_pilot_current`, `charger_power`, `conn_charge_cable`,
  `fast_charger_brand`, `fast_charger_type`, `battery_heater_on`,
  `battery_heater`) sont conditionnellement rendus si
  `chargerDetailsExpanded === true`. *Appliquer défauts* auto-déplie.
- **Bloc Énergie remonté** en colonne gauche (donnée prioritaire à
  corriger sur une charge).
- **`charge_energy_added`** : suppression du suffixe `(tick : X)` dans
  son libellé (passage `tickValue={null}` pour libérer la largeur).
- **Suppression de la section Météo** standalone (champ déplacé dans le
  panneau carte avec la propagation aux ticks).
- **Header inline** : *Back* à droite du titre (gain ~40 px vertical).

### Header global

- **`MobileMenu`** (`Sheet side="right"`) sur < `md` : nav verticale + 9
  liens, TimezonePicker, ThemeSwitcher, LocaleSwitcher, bouton Logout.
  Trigger `☰` (lucide `Menu`). État `open` local, fermé au clic d'un lien.
- **Constante partagée `NAV_ITEMS`** (`nav-items.ts`) entre `MainNav`
  (desktop chips) et `MobileMenu` (panneau).
- **Suppression du prop `rightSlot`** d'`AppHeader` : `LocaleSwitcher` est
  monté directement dans le header. Les 25 pages ont été swappées
  mécaniquement (sed + cleanup import orphelin).

## Schéma / serveur

- **`ChargeSchema`** (`src/app/[locale]/charges/schema.ts`) — ajout :
  - `outside_temp_avg_initial: optionalNumber.optional().default(null)`
  - `outside_temp_avg_apply_all: applyAllField`
- **`updateChargeAction`** (`src/app/[locale]/charges/actions.ts`) — nouveau
  bloc de propagation `outside_temp` sur les ticks dans la même transaction
  que les champs charger. Règle inchangée :
  - `apply_all=true` *et* `ticksCount === 2` → update firstTick + lastTick.
  - sinon, si la valeur a changé → update lastTick uniquement.
- **`FKCombobox`** (`src/components/form/fk-combobox.tsx`) — accepte
  désormais une prop `form?: string` rattachée à l'`<input type="hidden">`
  pour la soumission depuis un form distant.

## Dépendances

- `leaflet@^1.9.4`
- `react-leaflet@^5.0.0` (React 19 compatible — `4.x` reste sur React 18)
- `@types/leaflet@^1.9.21` (dev)

## i18n

Clés ajoutées (`messages/{fr,en}.json`) :
- `common.menu` / `common.theme` / `common.language`
- `charges.actions.showChargerDetails` / `hideChargerDetails` / `toggleBatteryUnit`
- `charges.hints.noPosition`

## Commit + tag + push

- [x] `git add` ciblé (sans les PNG Playwright, ignorés via `.gitignore`)
- [x] `git commit -m "release: v0.4.0 — UI refresh (carte, delta SOC, charger split, burger mobile)"`
- [x] `git tag -a v0.4.0`
- [x] `git push origin main`
- [x] `git push origin v0.4.0` ← déclenche `docker-publish`

## Post-push GitHub Actions

- [ ] Vérifier le workflow sur https://github.com/kerkeniw/teslamatefix/actions
      (déclenché par le push du tag `v0.4.0`).
- [ ] `docker manifest inspect wkerkeni/teslamatefix:0.4.0` → 2 manifests
      (linux/amd64 + linux/arm64).
- [ ] `docker pull wkerkeni/teslamatefix:0.4.0` réussit.

## Étapes manuelles

- [ ] Copier-coller `docker/README-DOCKERHUB.md` sur la page Docker Hub
      `wkerkeni/teslamatefix` (overview + full description). La version
      mentionnée est `v0.4.0`, la section Tags liste `0.4.0`.

## Vérification fonctionnelle

- [ ] Login admin/admin → change pwd → dashboard.
- [ ] `/charges/<id>` desktop 1440×900 :
      - Header une ligne (titre + delta `32 % → 80 %` + 🔋 vert + ← Back).
      - Top grid : Temps + Énergie + Borne summary | Carte + Météo + Loc.
      - Détails Borne masqués au chargement ; bouton *Appliquer défauts*
        déplie les 10 champs.
      - Onglet Mesures : table full-width, pas de carte.
- [ ] `/charges/<id>` mobile 375×812 :
      - Header = Logo + véhicule + ☰ ; nav horizontale masquée.
      - Tap ☰ → Sheet droite avec 9 liens + TZ/Theme/Lang + Log out.
      - Tap sur un lien → navigation + Sheet refermé.
- [ ] Charge 2 ticks : cocher *Appliquer aux ticks* sur la température,
      modifier la valeur, save → vérifier en `psql` que `outside_temp`
      est mis à jour sur les deux ticks.
