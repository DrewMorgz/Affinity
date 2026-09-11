-- 085 — deprecate the bare approval threshold setter
--
-- FOUND BY THE REACHABILITY AUDIT. Two functions with identical signatures
-- both write to journal_approval_rule:
--
--   approval_threshold_set   3,766 characters. Validates, refuses a negative
--                            or null threshold, looks up the entity name, and
--                            writes an audit event recording that a control
--                            was loosened.
--
--   set_approval_threshold     182 characters. Writes straight to the table.
--
-- The guarded one is what the screen calls. The bare one bypasses every check,
-- including the audit entry that makes raising a threshold visible — and
-- raising a threshold means fewer journals get a second pair of eyes, which is
-- precisely the change that should leave a trace.
--
-- It is not dropped, because something outside this repository may call it and
-- a hard failure would be worse than a soft one. Instead it now delegates to
-- the guarded version, so both paths get the same checks and the same audit
-- entry. Callers keep working; the gap closes.

CREATE OR REPLACE FUNCTION set_approval_threshold(p_entity bigint,
                                                  p_threshold numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delegates rather than duplicating. The guarded version refuses a negative
  -- or null threshold and records the change in the audit trail; this wrapper
  -- exists only so that anything still calling the old name gets those checks
  -- instead of writing straight to the table.
  PERFORM approval_threshold_set(p_entity, p_threshold);
END;
$$;

COMMENT ON FUNCTION set_approval_threshold(bigint, numeric) IS
  'DEPRECATED. Delegates to approval_threshold_set, which validates the '
  'threshold and records the change in the audit trail. Kept only so existing '
  'callers do not bypass those checks. Use approval_threshold_set directly.';
