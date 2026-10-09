# Origine des positions : Fleet API, flux ou reconstruction

> Référence pour mettre en évidence, dans TeslaMateFix, d'où vient chaque ligne de `positions`.
> Établi le 2026-10-09 sur la base du NAS restaurée en local (TeslaMate 4.2.0, flux Fleet Telemetry
> via TeslaMateAPI). Contexte côté infrastructure : dépôt `../TeslaMateAPI`
> (`docs/AUDIT_FONCTIONNEMENT.md`, `docs/D13_FILL.md`, `docs/D24_PROXY_SIMULATEUR.md`).

## En bref

TeslaMate n'enregistre **aucune colonne « source »** dans `positions`. L'origine se déduit :

1. des **colonnes remplies** : TeslaMate n'écrit pas les mêmes colonnes selon que la position vient
   d'un appel `vehicle_data` ou d'une trame du flux ;
2. des **traces de TeslaMateAPI** (schéma `telemetry`), dès que l'outil de reconstruction D13 a
   créé ou complété des positions, car il efface la différence de colonnes.

## Les quatre origines

| Origine | Qui l'écrit | Quand | Signature |
|---|---|---|---|
| `vehicle_data` | TeslaMate, à chaque appel Fleet API `vehicle_data` (`create_position(%Vehicle{})`) | Tout le temps ; en trajet streamé, toutes les `POLLING_DEFAULT_INTERVAL` (600 s aujourd'hui) | Autonomies (`ideal_`, `rated_battery_range_km`), `usable_battery_level`, températures, pneus, climatisation **remplis** ; `elevation` **vide** depuis l'activation du flux (TeslaMate ne calcule plus l'altitude quand le streaming est actif) |
| `flux` | TeslaMate, à chaque trame du flux reçue en trajet (`create_position(%Stream.Data{})`) | En trajet seulement, ~1 par seconde, depuis le 30/09/2026 | Seules les colonnes du protocole : date, position, vitesse, puissance, `battery_level`, odomètre, `elevation` (calculée par le relay depuis le 07/10/2026, vide avant). Autonomies, `usable_battery_level`, températures, pneus, climatisation **vides** |
| `flux_complete` | Trame du flux, puis complétée par D13 `FILL` | Après la passe `auto` de 01:00 sur le NAS, ou un `apply` manuel | Colonnes comme `vehicle_data`, mais ligne présente dans `telemetry.filled_positions` avec `ideal_battery_range_km` dans `cols` |
| `d13` | Outil de reconstruction D13 (`EXTEND`, `CREATE`, `SPLIT`…) depuis l'archive de télémétrie | Trous de TeslaMate : débuts de trajet amputés, trajets manqués | `id` présent dans `telemetry.reconstructions.created_position_ids` (reconstruction non annulée) |

Remarques :
- Un `FILL` complète aussi les positions `vehicle_data`, mais seulement l'`elevation` (`cols = {elevation}`) :
  elles restent `vehicle_data`.
- Avant le 30/09/2026 (pas de flux), toutes les positions sont `vehicle_data`.
- Hors trajet (début de charge, changement d'état), les positions sont toujours `vehicle_data`.
- **Proxy simulateur (D24, mode `simulate`)** : les réponses `vehicle_data` sont construites par
  `tmapi-proxy` à partir de la télémétrie, sans appel à Tesla. Pour TeslaMate, et donc en base, rien
  ne les distingue d'un vrai appel : elles restent `vehicle_data`. Seuls les journaux du proxy
  permettent de les séparer.

## Mesures (trajets réels, 2026-10-09)

| Trajet | `vehicle_data` | `flux` | `flux_complete` | `d13` |
|---|---|---|---|---|
| 2560 (septembre, sans flux) | 20 | — | — | — |
| 2604 (07/10, scindé puis complété) | 2 | — | 851 | 147 (`EXTEND`, `SPLIT`) |
| 2620 (08/10, complété la nuit) | 2 | — | 952 | 51 (`EXTEND`) |
| 2621 (09/10, pas encore complété) | 2 | 733 | — | — |

## Requête de classement

À exécuter avec un rôle qui lit `public.positions` et le schéma `telemetry` (l'utilisateur
`teslamate` de TeslaMateFix le peut : il est propriétaire de la base).

```sql
WITH creees AS (            -- positions créées par D13 (EXTEND, CREATE, SPLIT…), non annulées
  SELECT DISTINCT ON (pid) pid, r.kind
  FROM telemetry.reconstructions r, unnest(r.created_position_ids) AS pid
  WHERE r.undone_at IS NULL
  ORDER BY pid, r.id DESC
), remplies AS (            -- cases complétées par FILL, non annulé
  SELECT f.position_id, bool_or('ideal_battery_range_km' = ANY (f.cols)) AS autonomies
  FROM telemetry.filled_positions f
  JOIN telemetry.reconstructions r ON r.id = f.reconstruction_id AND r.undone_at IS NULL
  GROUP BY f.position_id
)
SELECT p.id, p.drive_id, p.date,
  CASE
    WHEN c.pid IS NOT NULL                    THEN 'd13'
    WHEN rf.autonomies                        THEN 'flux_complete'
    WHEN p.ideal_battery_range_km IS NOT NULL
      OR p.rated_battery_range_km IS NOT NULL THEN 'vehicle_data'
    ELSE                                           'flux'
  END AS origine,
  c.kind AS d13_kind
FROM positions p
LEFT JOIN creees c ON c.pid = p.id
LEFT JOIN remplies rf ON rf.position_id = p.id;
```

Pièges :
- **Annulation** : un `undo` de D13 supprime les positions créées ou vide les cases remplies, mais
  garde les lignes de trace ; d'où le filtre `undone_at IS NULL`.
- Une même position peut avoir plusieurs lignes dans `filled_positions` (plusieurs `FILL`) : d'où
  le `bool_or`.
- Sans les traces (schéma `telemetry` absent), seule la signature des colonnes reste : une
  position `flux_complete` passe alors pour `vehicle_data`, et une position `d13` est inclassable
  (colonnes complètes).

## Pistes pour TeslaMateFix

> **Mis en œuvre en v0.8.0** (détail d'un trajet : bandeau de répartition, carte
> « Colorer par › Origine », colonne et filtre du tableau des positions) —
> `src/lib/teslamateapi/capabilities.ts`, `src/lib/positions/origin.ts`,
> `origin-query.ts` (requête ci-dessus restreinte aux positions du trajet). Voir
> [RELEASE_v0.8.0.md](RELEASE_v0.8.0.md). Reste à faire : origine dans la page
> Positions et sa carte.

TeslaMateFix ne dépend pas de TeslaMateAPI : la détection, les capacités et les règles (lecture seule,
`$queryRaw`, hors client Prisma) sont décrites dans
[INTEGRATION_TESLAMATEAPI.md](INTEGRATION_TESLAMATEAPI.md).

- **Avec les capacités `reconstructions` et `fill`** : les quatre origines, par la requête ci-dessus.
- **Sans** : seules `vehicle_data` et `flux` sont distinguables, par la signature des colonnes
  (`ideal_battery_range_km` ou `rated_battery_range_km` remplies ou non), en le signalant à
  l'utilisateur.
- **Affichage** : une couleur par origine sur la carte du trajet et dans la liste des positions, et
  la répartition par trajet (comme le tableau des mesures). Les positions `d13` et `flux_complete`
  sont des données reconstruites : à signaler, notamment avant une correction manuelle.
