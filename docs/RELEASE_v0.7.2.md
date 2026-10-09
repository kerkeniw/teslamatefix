# Release v0.7.2 — checklist

> Document de suivi pour **TeslaMateFix v0.7.2**
> (« Listing des charges façon Grafana + contrôle par l'export Privacy Tesla »).

## État

- Branche : `feat/charges-listing-privacy`, fusionnée en fast-forward sur `main`.
- `package.json` version : `0.7.2`.
- Nature : **évolution fonctionnelle**. Rebuild de l'image requis. Aucune
  migration de base ; un nouveau fichier `privacy-charging.json` apparaît dans
  le volume `/data` au premier import.

## Contexte

- Le listing `/charges` n'avait que 2 filtres (dates) et 8 colonnes fixes.
- Certaines sessions ont des valeurs aberrantes. Sur la base de référence,
  l'**énergie consommée** des sessions #131 à #168 (déc. 2025 à avr. 2026)
  va de 143 à 545 kWh, pour une efficience inférieure à 30 %.
- Tesla fournit sur demande un export Privacy dont `Charging Data.csv` liste les
  sessions vues par la voiture. Analyse de l'export réel (01/06 → 11/09/2026) :
  - Colonnes : `VIN`, début/fin UTC, durée (s), énergie ajoutée (kWh), type de
    borne, lieu (`Home`/`Away`/`Favorites`).
  - L'export ne contient ni coût, ni SOC, ni énergie consommée.
  - Les fichiers `Vehicle Data/*.csv` (8 jours de signaux bruts, sans SOC ni GPS)
    sont hors périmètre.

## Nouveautés

### Listing des charges (`/charges`)

- **`src/lib/charges/list-query.ts`** : requête SQL brute calquée sur
  `drives/list-query.ts`.
  - Type AC/DC tiré du `mode()` de `charger_phases` sur les ticks, comme Grafana.
  - Libellé du lieu coalescé (géofence, puis nom, puis rue et ville).
  - Odomètre via `position_id`, autonomie gagnée selon `settings.preferred_range`.
  - Récapitulatif de la période sur l'ensemble filtré.
- **`src/lib/charges/metrics.ts`** : efficience (`added / used`, inconnue si
  `used` est nul), coût/kWh, puissance moyenne, seuils de mise en évidence
  (efficience < 70 %, énergie > 100 kWh).
- **`ChargeListClient.tsx` / `ChargeDataTableColumns.tsx`** : même pattern que
  les trajets.
  - Filtres : plages rapides, dates, type, lieu, géofences, énergie ajoutée ≥,
    énergie consommée ≥, efficience ≤, coût ≥, durée ≥, sessions ouvertes.
  - Menu « Colonnes » mémorisé en localStorage (`charges.columns`).
  - Cartes mobiles avec l'efficience.
  - Bouton « Comparer avec Tesla ».

### Contrôle avec l'export Privacy (`/privacy`)

- **`src/lib/privacy/charging-csv.ts`** : parseur CSV (BOM, guillemets) et
  validation des en-têtes. Les types Supercharger, CCS et CHAdeMO sont classés DC.
- **`src/lib/privacy/compare.ts`** : groupes de sessions qui se chevauchent
  (tolérance de 10 min), limités à la période de l'export. Classement :
  - `ok` : écart ≤ max(0,5 kWh ; 5 %) ;
  - `missing` : mineure sous 0,5 kWh ;
  - `extra` : vide si ≤ 0,05 kWh et ≤ 2 min ;
  - `energy_mismatch` ;
  - `fragmented` : plus de sessions TeslaMate que Tesla.

  Un décalage de dates au-delà de 15 min est signalé en plus.
- **`src/lib/privacy/merge.ts` / `store.ts`** : imports cumulés, dédoublonnés
  sur (VIN, début), écriture atomique dans `/data/privacy-charging.json`.
- **`src/lib/privacy/report.ts`** : sessions TeslaMate de la période. La fin
  effective d'une session restée ouverte est son dernier tick.
- **`src/app/[locale]/privacy/`** :
  - Upload par server action (900 Ko max ; ~15 Ko pour 3 mois).
  - Le rapport est recalculé à chaque visite.
  - Actions guidées : « Créer la charge » (assistant pré-rempli via
    `/charges/new?start&end&added&type`), « Ouvrir #id ».
  - L'import est autorisé en `READ_ONLY` puisqu'il n'écrit pas en base.
- **Page d'accueil** : carte « Contrôle avec l'export Tesla » qui indique le
  nombre d'écarts à traiter et la date du dernier import.

### Résultat attendu sur la base de référence + export réel

87 groupes concordants, 23 manquants (dont le trou du 21 au 28/08), 4 fragmentés
(#235–240, #248/249, #251/252, #266–268), 1 écart d'énergie (#192 : 4,44 contre
5,12 kWh), 1 session vide inconnue de Tesla (#209).

## Vérifications faites

- [x] `npm test` : 150/150 (nouveaux tests `privacy.test.ts`, `charge-metrics.test.ts`).
- [x] `npx tsc --noEmit`, `npx eslint src` : 0 erreur, 0 avertissement.
- [x] `npm run build` (avec les variables factices du Dockerfile).
- [x] Algorithme de comparaison exécuté sur l'export réel contre la base locale restaurée.

## Étapes manuelles

- [ ] Recette sur la base locale restaurée (`npm run dev` dans le worktree) :
  - [ ] `/charges?min_used=100` affiche les sessions #131 à #168 ; `max_eff=70` ajoute
        les micro-sessions ;
  - [ ] masquer des colonnes, recharger : le choix est conservé ;
  - [ ] récapitulatif cohérent avec un `SELECT sum(...)` équivalent ;
  - [ ] page d'accueil, carte « Contrôle avec l'export Tesla », puis import de
        `var/…/Charging Data/Charging Data.csv` : on retrouve les compteurs ci-dessus ;
  - [ ] « Créer la charge » sur une session manquante : l'assistant est pré-rempli ;
  - [ ] corriger une charge (#192), revenir sur `/privacy` : l'écart a disparu.
- [x] Merge `feat/charges-listing-privacy` → `main`, tag `v0.7.2` (2026-10-08).
- [x] `git push origin main` + `git push origin v0.7.2` (publication Docker Hub).
- [ ] Vérifier `docker manifest inspect wkerkeni/teslamatefix:0.7.2` (amd64 + arm64).
- [ ] En production : vérifier que le volume `/data` est accessible en écriture
      (sinon l'import affiche une erreur explicite).
