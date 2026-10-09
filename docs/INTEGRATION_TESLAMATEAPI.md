# TeslaMateAPI : intégration facultative

> Principe d'architecture établi le 2026-10-09. TeslaMateAPI (dépôt `../TeslaMateAPI`) ajoute à une
> installation TeslaMate un flux Fleet Telemetry, une archive des trames (schéma `telemetry`) et un
> outil de reconstruction (D13). TeslaMateFix peut en tirer des fonctionnalités, **sans jamais en
> dépendre**.

## Principe

1. **TeslaMateFix fonctionne seul.** Démarrage, connexion, sonde de santé et toutes les
   fonctionnalités actuelles ne lisent que les schémas de TeslaMate (`public`, `private`).
   L'absence de TeslaMateAPI n'est ni une erreur, ni un avertissement à l'écran.
2. **Détection, pas configuration.** TeslaMateFix détecte TeslaMateAPI dans la base ; aucune
   variable d'environnement n'est nécessaire pour l'activer.
3. **Fonctionnalités conditionnelles.** Chaque fonctionnalité liée à TeslaMateAPI déclare la
   capacité dont elle a besoin. Sans cette capacité, elle est masquée ou dégradée proprement, jamais
   en erreur.
4. **Lecture seule.** TeslaMateFix ne crée, ne modifie et ne supprime **rien** dans le schéma
   `telemetry`. Les reconstructions et leurs annulations passent par l'outil de TeslaMateAPI
   (`./scripts/reconstruct.sh`), qui tient ses traces.
5. **Hors du client Prisma.** Le schéma `telemetry` n'est pas ajouté à `prisma/schema.prisma`
   (`schemas = ["private", "public"]`) : il est facultatif et n'appartient pas à TeslaMate. Les
   lectures passent par `$queryRaw`, comme la table `tokens` (`src/lib/tesla/token.ts`).

## Détection

Une seule requête, qui ne lève aucune erreur si le schéma ou une table manque
(`to_regclass` / `to_regnamespace` renvoient `NULL`, et `has_table_privilege` aussi) :

```sql
SELECT
  coalesce(obj_description(to_regnamespace('telemetry'), 'pg_namespace') LIKE 'TeslaMateAPI%', false) AS installed,
  coalesce(has_table_privilege(to_regclass('telemetry.records'),          'SELECT'), false) AS archive,
  coalesce(has_table_privilege(to_regclass('telemetry.reconstructions'),  'SELECT'), false) AS reconstructions,
  coalesce(has_table_privilege(to_regclass('telemetry.filled_positions'), 'SELECT'), false) AS fill;
```

- **`installed`** : le schéma `telemetry` porte le commentaire posé par TeslaMateAPI
  (`TeslaMateAPI : archive brute Fleet Telemetry…`, `home/sql/001_telemetry.sql`). Évite de prendre
  pour TeslaMateAPI un schéma `telemetry` créé par un autre outil.
- **Une capacité par table**, droits de lecture compris : les tables de D13 arrivent par des
  versions successives de TeslaMateAPI, et un rôle PostgreSQL dédié à TeslaMateFix (voir
  `INSTALL.md`) peut ne pas avoir accès au schéma `telemetry`.
- Vérifié le 2026-10-09 : sur la base restaurée du NAS, tout à `true` ; sur une base sans
  TeslaMateAPI, tout à `false`, sans erreur.

**Quand** : au démarrage (une ligne de journal, `teslamateapi.detected` avec les capacités), puis à
la demande avec un résultat mémorisé quelques minutes. TeslaMateAPI peut être installé ou mis à jour
après le démarrage de TeslaMateFix : la détection ne doit pas être figée pour toute la vie du
processus.

**En cas d'échec** de la requête elle-même (base injoignable, droits sur le catalogue) : toutes les
capacités à `false`, un avertissement journalisé une seule fois, comme `warnOnce` dans
`src/lib/tesla/token.ts`.

## Capacités et fonctionnalités

| Capacité | Tables | Fonctionnalités possibles | Sans la capacité |
|---|---|---|---|
| `reconstructions` + `fill` | `telemetry.reconstructions`, `telemetry.filled_positions` | Origine de chaque position (`vehicle_data`, `flux`, `flux_complete`, `d13`) : voir [ORIGINE_POSITIONS.md](ORIGINE_POSITIONS.md) ; trajets et charges reconstruits ou complétés, avec le type d'opération | Origine déduite des seules colonnes (`vehicle_data` / `flux`), avec la mention « détail indisponible sans TeslaMateAPI » |
| `archive` | `telemetry.records` | Trames brutes d'un trajet ou d'une charge, comparaison avec ce que TeslaMate a enregistré | Masquée |

Une page « À propos » ou « Paramètres » peut afficher l'état : TeslaMateAPI détecté ou non, et les
capacités disponibles.

## Contrat avec TeslaMateAPI

Les tables et colonnes lues par TeslaMateFix forment l'interface entre les deux projets :

| Table | Colonnes lues |
|---|---|
| `telemetry.reconstructions` | `id`, `kind`, `drive_id`, `segment_id`, `created_position_ids`, `undone_at`, `applied_at` |
| `telemetry.filled_positions` | `reconstruction_id`, `position_id`, `cols` |
| `telemetry.records` | `topic`, `vin`, `created_at`, `received_at`, `payload` |

Toute modification de ces tables dans TeslaMateAPI (`home/sql/`) doit être répercutée ici. Les
requêtes de TeslaMateFix doivent tolérer une colonne manquante en dégradant la fonctionnalité
(capacité à `false`), pas en levant une erreur.
