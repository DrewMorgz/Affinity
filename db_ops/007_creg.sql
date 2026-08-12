-- =====================================================================
-- AFFINITY — COMPLIANCE REGISTERS (write-enabled, generic)
-- One flexible table backs every register (gifts, complaints, breaches,
-- conflicts, sanctions, etc.). Row values stored as jsonb keyed by the
-- register's columns. creg_add is a real write. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS creg_entry (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  register     text NOT NULL,
  jurisdiction text,
  data         jsonb NOT NULL,
  created_by   text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creg_entry_register_idx ON creg_entry(register);

-- WRITE: add a register entry
CREATE OR REPLACE FUNCTION creg_add(p_register text, p_jurisdiction text, p_data jsonb, p_by text)
RETURNS creg_entry LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO creg_entry(register, jurisdiction, data, created_by)
  VALUES (p_register, NULLIF(p_jurisdiction,''), COALESCE(p_data,'{}'::jsonb), NULLIF(p_by,''))
  RETURNING *;
$$;
GRANT EXECUTE ON FUNCTION creg_add(text,text,jsonb,text) TO anon, authenticated;

-- READ: entries for one register (newest first)
CREATE OR REPLACE FUNCTION creg_list(p_register text)
RETURNS TABLE(id bigint, register text, jurisdiction text, data jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, register, jurisdiction, data, created_at
  FROM creg_entry WHERE register = p_register ORDER BY id DESC;
$$;
GRANT EXECUTE ON FUNCTION creg_list(text) TO anon, authenticated;
