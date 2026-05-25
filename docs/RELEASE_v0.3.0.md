# Release v0.3.0 — checklist

> Document de suivi pour la mise en production de **TeslaMateFix v0.3.0**
> (« timezone awareness + édition exhaustive des charges »). Cocher les
> cases au fur et à mesure.

## État

- Branche de travail : `feat/v0.3.0` (merge `--no-ff` dans `main`).
- `package.json` version : `0.3.0`.
- Tests : 93 verts (21 datetime + 72 existants).
- Typecheck : propre.
- Lint : 3 issues pré-existantes (data-table TanStack `useReactTable`,
  ChargeCreateWizard `setChargerPilotCurrent` L585) — non régression.

## Features

### Timezone awareness (commit `50a0fda`)

- **Convention BD** : toutes les dates persistent en UTC dans les colonnes
  `DateTime @db.Timestamp(6)` (convention TeslaMate inchangée).
- **Cookie `tmfix_tz`** (httpOnly, 1 an) propagé en SSR via `getRequestConfig`
  et côté client via `NextIntlClientProvider.timeZone`.
- **`TimezonePicker`** dans le header : combobox shadcn avec ~420 fuseaux
  IANA groupés par continent + offset courant, filtrage par recherche.
- **`TimezoneDetector`** : auto-set du cookie au premier mount depuis
  `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **`DateTimeInput` bidirectionnel** : input visible sans `name` (heure dans
  la TZ choisie), `<input type="hidden" name>` synchronisé en ISO UTC.
- Migrations résiduelles : tous les `.toISOString().slice(0,16)` →
  `formatDateTimeIsoShort`/`format.dateTime`.
- 21 tests Vitest dans `tests/unit/datetime.test.ts` (DST printemps/automne,
  offsets fractionnaires, round-trip).

### Exhaustivité des colonnes ticks (commit `4c6ed34`)

L'onglet Mesures expose désormais les **22 colonnes** de la table `charges`
(au lieu de 9), avec scroll horizontal sur le wrapper existant.

13 colonnes ajoutées : `usable_battery_level`, `charger_pilot_current`,
`ideal_battery_range_km`, `rated_battery_range_km`, `outside_temp`,
`conn_charge_cable`, `fast_charger_brand`, `fast_charger_type`,
`battery_heater_on`, `battery_heater`, `battery_heater_no_power`,
`not_enough_power_to_heat`.

### Règle "Appliquer à tous les ticks" + fix propagation (commit `6fed051`)

- **Session > 2 ticks** : case grisée (`disabled`), seul le dernier tick
  est corrigé.
- **Session = 2 ticks** : case cochée par défaut, deux `update` explicites
  (firstTick + lastTick).
- **Fix bug** : la case fonctionne désormais même sans modifier la valeur
  du formulaire (cas typique : aligner le premier tick sur les valeurs du
  dernier sans avoir à les retaper). La condition de skip a été corrigée
  pour ne pas écarter le champ quand `apply_all === true`.

## Merge + tag + push

- [ ] `git switch main`
- [ ] `git merge --no-ff feat/v0.3.0 -m "release: v0.3.0 — timezone, exhaustivité ticks, règle apply_all"`
- [ ] `git tag -a v0.3.0 -m "v0.3.0 — TimeZone awareness, ticks exhaustivity, apply-all rule fix"`
- [ ] `git push origin main`
- [ ] `git push origin v0.3.0` ← déclenche `docker-publish.yml`.

## Post-push GitHub Actions

- [ ] Vérifier le run sur https://github.com/kerkeniw/teslamatefix/actions
      (workflow `docker-publish` sur tag `v0.3.0`).
- [ ] Si échec au step `Login to Docker Hub` → vérifier les secrets de
      l'environment GitHub `DockerHub` (cf. doc v0.2.0 §Post-push).

## Vérification image publiée

- [ ] `docker manifest inspect wkerkeni/teslamatefix:0.3.0` → 2 manifests
      (linux/amd64 + linux/arm64).
- [ ] `docker pull wkerkeni/teslamatefix:0.3.0` réussit.
- [ ] Tester sur machine prod / compose minimal :
      - Login admin/admin → change pwd → dashboard.
      - Header expose le combobox de fuseau (`Europe/Paris` par défaut).
      - Onglet Mesures d'une charge avec ≥ 2 ticks : 22 colonnes scrollables.
      - Charge à 2 ticks : cases `apply_all` cochées, save → premier tick
        aligné sur le dernier (vérifier en `psql`).

## Nettoyage local

- [ ] `git branch -d feat/v0.3.0` (la branche n'est pas poussée).
- [ ] `rm -rf /tmp/v030-backup` (helpers de découpage des commits).
