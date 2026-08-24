-- =====================================================================
-- AFFINITY CORE — RESET PUBLIC SCHEMA
--
-- ⚠️  THIS DELETES EVERY TABLE, FUNCTION AND ROW IN THE PUBLIC SCHEMA.
--
-- Run this ONLY while the database still holds demo and pilot data. It will
-- destroy the CPD and compliance register entries created by the write-layer
-- pilots along with everything else. Take a backup first if any of it matters:
--   Supabase dashboard -> Database -> Backups, or pg_dump.
--
-- Why it exists: the engine migrations were written to build a database from
-- nothing, not to be layered onto a half-built one. Repeated partial runs have
-- left objects behind, and each attempt now fails on a different duplicate.
-- Starting clean is faster and safer than patching around that.
--
-- Sequence:
--   1. this file
--   2. affinity_engine_001_051.sql
--   3. 052_planning_grants.sql
-- =====================================================================

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Supabase expects these to hold on the public schema.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL   ON SCHEMA public TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
