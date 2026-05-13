# Audit de navigation — Trajets & Charges

**Date** : 2026-05-13
**Méthode** : sélection aléatoire de 10 IDs `drives` + 10 IDs `charging_processes` via `scripts/audit-pick.mjs`, capture des champs visibles dans les formulaires de détail via Playwright (`browser_evaluate` sur le DOM), comparaison avec les valeurs lues directement en base.

**Échantillon** :
- Drives : `122, 207, 751, 944, 1312, 1488, 1512, 1536, 1543, 1756`
- Charges : `17, 27, 35, 45, 59, 69, 96, 129, 135, 168`

## Verdict

Deux bugs **systémiques** identifiés dès les 3 premiers échantillons capturés. Capture limitée à 3 échantillons représentatifs (drive #122, drive #1756, charge #45) — les 20 autres présenteraient le même symptôme exact puisque les deux causes racines sont dans des composants partagés à toutes les entités.

| # | Sévérité | Bug | Composant touché | Entités impactées |
|---|---|---|---|---|
| **1** | 🔴 High | Tous les champs `NumberInput` s'affichent vides même quand la DB a la valeur | `src/components/form/number-input.tsx` | toutes (drives, charges, positions, states, updates, geofences…) |
| **2** | 🔴 High | Tous les combos shadcn affichent l'**ID brut** au lieu du libellé correspondant | `src/components/ui/select.tsx` (wrapper de `<SelectValue/>`) | toutes les FK |

Les autres aspects (dates, champs texte, hidden inputs synchronisés) **fonctionnent correctement** — `<DateTimeInput>` rend bien les ISO sérialisées (cf. drive 122 : `start_date=2025-07-25T14:14:48`, drive 1756 : `2026-04-26T18:37:50`, charge 45 : `2025-08-13T16:30:26`).

## Bug #1 — `NumberInput` rend tous les champs vides

### Symptôme

Sur `/drives/122`, la DB contient :

```json
{
  "duration_min": 10, "start_km": 2681.81, "end_km": 2683.58, "distance": 1.77,
  "start_ideal_range_km": "297.76", "end_ideal_range_km": "294.83",
  "outside_temp_avg": "43.3", "inside_temp_avg": "49.2",
  "speed_max": 32, "power_max": 19, "power_min": -26,
  "ascent": 19, "descent": 19
}
```

L'écran d'édition affiche **toutes** ces valeurs vides (`value=""`).

Idem sur drive #1756 et charge #45 : tous les champs hors `start_date`, `end_date` (et FK `hidden`) sont vides à l'affichage.

### Cause racine

`src/components/form/number-input.tsx:30` :

```tsx
return (
  <Input
    type="number"
    ...
    value={value == null ? "" : String(value)}      // ← ligne 30
    defaultValue={defaultValue == null ? undefined : String(defaultValue)}
    {...rest}
  />
);
```

Quand le formulaire appelle `<NumberInput defaultValue={initial.duration_min} />` **sans** passer `value`, la prop `value` est `undefined`. Le test `value == null` évalue `true` (équivalence faible : `undefined == null` est vrai) et la branche force `value=""`. L'input devient alors un input **contrôlé** avec valeur vide — `defaultValue` est ignoré par React quand `value` est présent.

### Fix proposé

Distinguer `undefined` (prop non passée — utiliser defaultValue) vs `null` (valeur explicite vide). Construire les props de manière conditionnelle :

```tsx
const inputProps: React.InputHTMLAttributes<HTMLInputElement> = { ...rest };
if (value !== undefined) inputProps.value = value === null ? "" : String(value);
else if (defaultValue !== undefined) inputProps.defaultValue = defaultValue === null ? "" : String(defaultValue);
return <Input type="number" inputMode={inputMode} step={step} {...inputProps} ref={ref} />;
```

## Bug #2 — Combos shadcn affichent l'ID brut

### Symptôme

Sur `/drives/122`, les triggers Select affichent :
- `car_id` : `1` (au lieu de `Tesla Model 3 — Julien`)
- `start_address_id` : `1` (au lieu du `display_name` de l'adresse #1)
- `end_address_id` : `1` (idem)

Sur `/drives/1756` : `car_id=1`, `start_address_id=214`, `end_address_id=187`, `end_geofence_id=14`.
Sur `/charges/45` : `position_id=607544`, `address_id=7`, `geofence_id=1`.

Pourtant la page de détail charge bien les options `{ id, label }` avec libellés clairs (`display_name`, `name` de geofence, etc.) — vérifié dans `src/app/[locale]/drives/[id]/page.tsx:90-104`.

### Cause racine

`src/components/ui/select.tsx:21-29` :

```tsx
function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}
```

Et dans les forms (ex. `DriveForm.tsx:83-85`) :

```tsx
<SelectTrigger id="car_id" className="w-full">
  <SelectValue />
</SelectTrigger>
```

`<SelectValue />` est rendu **vide**. Sous `@base-ui/react/select`, le composant `Select.Value` doit recevoir soit `children: ReactNode`, soit `children: (value) => ReactNode` qui mappe la valeur vers le libellé. Sans children, il rend la valeur brute (`"1"`, `"214"`, etc.) — d'où l'ID affiché à l'écran.

C'est une divergence avec Radix UI, où `<Select.Value placeholder="..."/>` dérive automatiquement le label depuis le `<SelectItem>` enfant. Base-ui ne le fait pas automatiquement.

### Fix proposé

L'option la plus propre est de **basculer sur un composant FK Combobox dédié avec recherche** (déjà planifié en Phase D du plan). Sans attendre, on peut passer une fonction `children` au `<SelectValue>` :

```tsx
<SelectValue>
  {(v) => cars.find((c) => String(c.id) === String(v))?.label ?? v}
</SelectValue>
```

Mais comme le Phase D va remplacer ces Select FK par un Combobox searchable, le fix sera structurel : nouveau composant `<FKCombobox>` qui maintient sa propre `initialOption: {id, label}` et rend correctement le label sélectionné.

Pour les Selects qui ne sont pas FK (ex. `state` enum dans `StateForm`, `billing_type` dans `GeofenceForm`), il faudra appliquer le pattern children-as-function ci-dessus.

## Champs DB jamais affichés (par design)

Pas de champ « manquant » : tous les champs métier de `drives` et `charging_processes` ont un input correspondant dans le form. Les champs non rendus sont strictement systèmes (`id`, `inserted_at`, `updated_at`).

## Impact croisé attendu

Le bug `NumberInput` impacte aussi les autres entités :
- `addresses` : `latitude`, `longitude` (et autres `numeric`)
- `geofences` : `latitude`, `longitude`, `radius`, `cost_per_unit`, `session_fee`
- `positions` : tous les champs numériques
- `states` : aucun NumberInput (timeline + état enum) — non impacté
- `updates` : aucun NumberInput — non impacté

Le bug `SelectValue` affecte tous les FK Select et tous les Select enum dans `StateForm`, `GeofenceForm`, `SettingsForm`.

## Suite (Phase E du plan)

1. Corriger `NumberInput` : un seul fichier, fix mécanique.
2. Pour les FK Select : refactor en `<FKCombobox>` searchable (Phase D du plan).
3. Pour les Select enum non-FK : passer une fonction `children` à `<SelectValue>`.

## Artefacts

- `audit/drives.db.json` (gitignored) — données brutes DB des 10 drives.
- `audit/charges.db.json` (gitignored) — idem pour les 10 charges.
- `audit/lookups.db.json` (gitignored) — labels FK référencés.
- `scripts/audit-pick.mjs` — script de re-sampling.
