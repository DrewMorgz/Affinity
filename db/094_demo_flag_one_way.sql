-- 094 — you cannot turn a real entity into demo data
--
-- FOUND BY ASKING WHETHER THE DEMO-DATA CLEAR CAN REACH REAL RECORDS.
--
-- demo_entity_remove correctly refuses an entity that is not flagged as demo,
-- and demo_data_clear correctly requires the phrase typed in full. Both good.
--
-- The gap is one step earlier. demo_flag_set lets you FLAG an entity as demo,
-- and it only refuses where the entity has time, invoices or posted journals
-- against it. So an entity with no work recorded yet can be flagged, and once
-- flagged it can be cleared.
--
-- Which entities have no work recorded yet? All eight of Affinity's own
-- companies — the Isle of Man, Malta, Cayman, Cyprus, UK and both US entities,
-- and the group holding company. Every one could be flagged as demo and then
-- deleted by someone testing the demo-data clear, which is a thing people will
-- do during testing precisely because it is safe to do with demo data.
--
-- A newly onboarded real client would be in the same position on day one,
-- before any time is recorded against it.
--
-- THE FIX IS TO MAKE THE FLAG ONE-WAY. Demo data is CREATED as demo by
-- demo_entity_add. There is no good reason to convert a real entity into demo
-- data, and the only case anyone could offer — something created by mistake —
-- is better served by closing it or deleting it deliberately as itself.
--
-- Removing the flag stays allowed. Demo to real is the safe direction: it makes
-- a record harder to delete, not easier. That asymmetry is the whole point.

CREATE OR REPLACE FUNCTION demo_flag_set(p_entity bigint, p_is_demo boolean)
RETURNS entity
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r entity;
BEGIN
  SELECT * INTO r FROM entity WHERE id = p_entity;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entity % not found', p_entity;
  END IF;

  -- ── The one-way rule ────────────────────────────────────────────────────
  IF p_is_demo AND NOT coalesce(r.is_demo, false) THEN
    RAISE EXCEPTION
      '% is a real record and cannot be turned into demo data. Flagging it as '
      'demo is what makes it deletable by the demo-data clear, and an entity '
      'with no time recorded against it yet — a new client, or one of '
      'Affinity''s own companies — would otherwise be one click from being '
      'wiped by somebody testing. Demo entities are created as demo. If this '
      'one was created by mistake, close it or delete it as itself.',
      r.name;
  END IF;

  UPDATE entity SET is_demo = p_is_demo WHERE id = p_entity RETURNING * INTO r;

  PERFORM ea_audit(p_entity, 'entity', p_entity,
                   'demo flag removed — now treated as a real record', r.name);
  RETURN r;
END;
$$;

COMMENT ON FUNCTION demo_flag_set(bigint, boolean) IS
  'Removes the demo flag. Setting it is refused: a real entity cannot be turned '
  'into demo data, because that is what would make it deletable by the clear. '
  'Demo entities are created as demo by demo_entity_add.';

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'demo_flag_set'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;
