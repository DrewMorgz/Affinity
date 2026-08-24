-- =====================================================================
-- AFFINITY — CPD LOG (first write-enabled feature)
-- Staff log their own CPD; it persists and surfaces in the Compliance
-- CPD register. cpd_add is VOLATILE (a real write). Run once; safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS cpd_entry (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_name text NOT NULL,
  activity   text NOT NULL,
  category   text,
  hours      numeric,
  entry_date date DEFAULT current_date,
  verified   boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- WRITE: log a CPD entry
CREATE OR REPLACE FUNCTION cpd_add(p_staff text, p_activity text, p_category text, p_hours numeric, p_date date)
RETURNS cpd_entry LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO cpd_entry(staff_name, activity, category, hours, entry_date)
  VALUES (NULLIF(p_staff,''), p_activity, COALESCE(NULLIF(p_category,''),'General'), p_hours, COALESCE(p_date, current_date))
  RETURNING *;
$$;
GRANT EXECUTE ON FUNCTION cpd_add(text,text,text,numeric,date) TO authenticated;

-- READ: full CPD register
CREATE OR REPLACE FUNCTION cpd_list()
RETURNS TABLE(id bigint, staff text, activity text, category text, hours text, entry_date text, verified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, staff_name, activity, category, to_char(COALESCE(hours,0),'FM990.0'),
         to_char(entry_date,'DD/MM/YYYY'), COALESCE(verified,false)
  FROM cpd_entry ORDER BY entry_date DESC, id DESC;
$$;
GRANT EXECUTE ON FUNCTION cpd_list() TO authenticated;

-- light seed (only if empty)
INSERT INTO cpd_entry(staff_name, activity, category, hours, entry_date, verified)
SELECT * FROM (VALUES
  ('Colette Grisdale','AML/CFT annual update','Compliance',4.0,current_date-30,true),
  ('Roxy Sheeley','Trust administration webinar','Technical',2.0,current_date-20,true)
) v(a,b,c,d,e,f) WHERE NOT EXISTS (SELECT 1 FROM cpd_entry);
