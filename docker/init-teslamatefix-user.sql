-- ============================================================================
-- TeslaMateFix — création de l'utilisateur PostgreSQL dédié
-- ============================================================================
--
-- Objectif :
--   Créer un rôle `teslamatefix` avec des privilèges minimaux sur la base
--   `teslamate`, pour que l'application :
--     - puisse lire et corriger les données métier (drives, charges,
--       positions, addresses, geofences, states, updates, settings, cars,
--       car_settings, charging_processes, charges) ;
--     - n'ait AUCUN accès au schéma `private` ni aux tables sensibles
--       `tokens` (chiffrées Cloak) et `schema_migrations` (gérée par Ecto).
--
-- Utilisation :
--   En remplaçant <PASSWORD> par un mot de passe fort :
--
--     docker compose exec -T database \
--       psql -U postgres -d teslamate \
--       -v tmfix_password="'<PASSWORD>'" \
--       < docker/init-teslamatefix-user.sql
--
--   Ou bien, depuis l'hôte si Postgres est exposé :
--
--     psql "postgresql://postgres@127.0.0.1:5432/teslamate" \
--       -v tmfix_password="'<PASSWORD>'" \
--       -f docker/init-teslamatefix-user.sql
--
--   Le quoting `"'<PASSWORD>'"` est intentionnel : `psql -v` ne quote pas la
--   valeur, on injecte donc des apostrophes pour produire un littéral SQL
--   valide dans `PASSWORD :tmfix_password`.
--
-- Idempotence :
--   Le script peut être rejoué : `CREATE ROLE` est protégé par un DO block
--   et les `GRANT` sont par nature idempotents.
-- ============================================================================

\set ON_ERROR_STOP on

-- ----------------------------------------------------------------------------
-- 1. Création du rôle
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'teslamatefix') THEN
    EXECUTE format('CREATE ROLE teslamatefix LOGIN PASSWORD %L', :'tmfix_password');
  ELSE
    EXECUTE format('ALTER ROLE teslamatefix WITH LOGIN PASSWORD %L', :'tmfix_password');
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 2. Connexion à la base
-- ----------------------------------------------------------------------------
GRANT CONNECT ON DATABASE teslamate TO teslamatefix;

-- ----------------------------------------------------------------------------
-- 3. Schéma public : usage + privilèges sur les tables métier uniquement
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO teslamatefix;

-- Privilèges DML sur les tables que TeslaMateFix a vocation à corriger.
-- NB : on liste explicitement plutôt que `GRANT ... ON ALL TABLES IN SCHEMA`
-- pour exclure de fait `tokens` et `schema_migrations`.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.cars,
    public.car_settings,
    public.drives,
    public.positions,
    public.charging_processes,
    public.charges,
    public.addresses,
    public.geofences,
    public.states,
    public.updates,
    public.settings
  TO teslamatefix;

-- Pour tout `INSERT` qui s'appuie sur une séquence (`SERIAL` / `BIGSERIAL`),
-- il faut donner USAGE sur les séquences associées. On les liste explicitement
-- (mêmes tables, suffixe `_id_seq`).
GRANT USAGE, SELECT, UPDATE ON SEQUENCE
    public.cars_id_seq,
    public.car_settings_id_seq,
    public.drives_id_seq,
    public.positions_id_seq,
    public.charging_processes_id_seq,
    public.charges_id_seq,
    public.addresses_id_seq,
    public.geofences_id_seq,
    public.states_id_seq,
    public.updates_id_seq,
    public.settings_id_seq
  TO teslamatefix;

-- ----------------------------------------------------------------------------
-- 4. Refus explicite — défense en profondeur
-- ----------------------------------------------------------------------------
-- `tokens` contient les jetons API Tesla chiffrés (Cloak). Aucune raison
-- légitime pour TeslaMateFix d'y toucher.
REVOKE ALL ON TABLE public.tokens FROM teslamatefix;

-- `schema_migrations` est gérée par Ecto (TeslaMate). Une écriture accidentelle
-- corromprait le suivi de migrations.
REVOKE ALL ON TABLE public.schema_migrations FROM teslamatefix;

-- ----------------------------------------------------------------------------
-- 5. Schéma `private` : aucun accès
-- ----------------------------------------------------------------------------
-- Si une migration TeslaMate future introduit le schéma `private` (par ex.
-- pour déplacer `tokens`), s'assurer que teslamatefix n'y accède jamais.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'private') THEN
    REVOKE ALL ON SCHEMA private FROM teslamatefix;
    REVOKE ALL ON ALL TABLES IN SCHEMA private FROM teslamatefix;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA private FROM teslamatefix;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 6. Vérification rapide (informational only)
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- Privilèges du rôle teslamatefix sur public ---'
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM information_schema.role_table_grants
 WHERE grantee = 'teslamatefix' AND table_schema = 'public'
 GROUP BY table_name
 ORDER BY table_name;

\echo ''
\echo 'OK : rôle teslamatefix prêt. Utiliser ce DSN :'
\echo '  postgresql://teslamatefix:<password>@<host>:5432/teslamate?schema=public'
