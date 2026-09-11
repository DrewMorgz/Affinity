-- 091 — take EXECUTE away from the anonymous key
--
-- THE MOST SERIOUS FINDING OF THIS AUDIT.
--
-- The anonymous key is not a secret. It ships in the browser bundle, and anyone
-- who opens developer tools on core.affinityco.com can read it and call the
-- PostgREST API directly with it, without signing in.
--
-- At the time of writing, that key could execute 270 functions. 101 of those
-- both WRITE and are SECURITY DEFINER, which means they run as the owner and
-- ignore the caller's table permissions entirely — so the fact that anon has no
-- table grants protects nothing at all.
--
-- Among them: approve_journal, close_year, cdd_item_verify, apply_receipt,
-- bill_wip_to_invoice, capitalise_asset, create_accrual. Approving a journal,
-- closing the financial year, and verifying customer due diligence, by anyone
-- who can read a URL.
--
-- Nothing has happened, because nobody outside Affinity knows the URL and the
-- data is all demo. That is luck rather than design, and it stops being luck
-- the moment real client records go in.
--
-- HOW IT HAPPENED. The files I wrote from 064 onward each revoke from anon and
-- grant to authenticated for the functions they create. The engine files
-- 001-063 did not, so every function older than this audit was left open.
-- Fixing it per-file would leave the same gap for the next file that forgets.
-- This does it for the whole schema, by rule rather than by list.
--
-- NOTHING IN THE APP NEEDS ANON. Every call goes through the authenticated
-- Supabase client; the login page calls Supabase's own auth endpoints and none
-- of ours. Verified before writing this.

DO $revoke_anon$
DECLARE
  r record;
  n_revoked int := 0;
  n_granted int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.prokind = 'f'
  LOOP
    -- PUBLIC as well as anon: a grant to PUBLIC includes anon, and revoking
    -- only anon while PUBLIC still holds it changes nothing.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    n_revoked := n_revoked + 1;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    n_granted := n_granted + 1;
  END LOOP;
  RAISE NOTICE 'Revoked PUBLIC and anon on % functions, granted authenticated on %',
               n_revoked, n_granted;
END
$revoke_anon$;

-- ── And for anything created later ─────────────────────────────────────────
-- Default privileges apply to functions created from now on, so a new file that
-- forgets to revoke does not reopen the hole. This is the part that makes the
-- fix hold rather than needing to be repeated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
