-- =====================================================================
-- AFFINITY — COMPLIANCE: add jurisdiction to the review schedule so the
-- module can be scoped per managed legal entity / jurisdiction.
-- Run once. Safe to re-run.
-- =====================================================================
DROP FUNCTION IF EXISTS comp_reviews();
CREATE FUNCTION comp_reviews()
RETURNS TABLE(id bigint, name text, ref text, type text, risk text, reviewer text,
  next_review text, status text, jurisdiction text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.id, e.name, e.company_code, COALESCE(p.entity_type,'Company'), COALESCE(p.risk_rating,'—'),
    r.reviewer, to_char(r.next_review,'DD/MM/YYYY'),
    CASE WHEN r.next_review < current_date THEN 'Overdue'
         WHEN r.next_review < current_date + 30 THEN 'Due this month' ELSE 'Upcoming' END,
    COALESCE(p.jurisdiction,'Isle of Man')
  FROM compliance_review r JOIN entity e ON e.id=r.entity_id
  LEFT JOIN entity_profile p ON p.entity_id=e.id ORDER BY r.next_review;
$$;
GRANT EXECUTE ON FUNCTION comp_reviews() TO anon, authenticated;
