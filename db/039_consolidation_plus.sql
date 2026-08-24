-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  CONSOLIDATION ENHANCEMENTS  (039)
-- Multi-level ownership (effective % down a chain), minority / non-controlling
-- interest on net assets, and a currency translation reserve (CTA) for foreign
-- subsidiaries. Builds on 018 (consol_group / consol_group_member).
-- =====================================================================

-- model the ownership chain: who is the direct parent of each member
ALTER TABLE consol_group_member ADD COLUMN IF NOT EXISTS parent_entity_id bigint;

-- effective ownership % for every member (top parent x ... x direct %)
CREATE OR REPLACE FUNCTION effective_ownership(p_group bigint)
RETURNS TABLE(entity_id bigint, direct_pct numeric, effective_pct numeric)
LANGUAGE sql STABLE AS $$
    WITH RECURSIVE oc AS (
        SELECT m.entity_id, m.ownership_pct AS direct_pct, m.ownership_pct::numeric AS effective_pct
        FROM consol_group_member m
        WHERE m.group_id = p_group AND m.parent_entity_id IS NULL
        UNION ALL
        SELECT m.entity_id, m.ownership_pct, round(oc.effective_pct * m.ownership_pct / 100.0, 4)
        FROM consol_group_member m
        JOIN oc ON m.parent_entity_id = oc.entity_id
        WHERE m.group_id = p_group
    )
    SELECT entity_id, direct_pct, effective_pct FROM oc;
$$;

-- net assets (functional ccy) of an entity as at a date
CREATE OR REPLACE FUNCTION entity_net_assets(p_entity bigint, p_as_at date)
RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT COALESCE(SUM(jl.func_amount),0)
    FROM journal_line jl
    JOIN journal j ON j.id=jl.journal_id AND j.status<>'draft' AND j.entity_id=p_entity AND j.journal_date<=p_as_at
    JOIN account a ON a.id=jl.account_id AND a.account_type IN ('asset','liability');
$$;

-- group share vs minority/non-controlling interest on each member's net assets
CREATE OR REPLACE FUNCTION consolidated_nci(p_group bigint, p_rate_date date)
RETURNS TABLE(entity_id bigint, entity_name text, functional_ccy text, effective_pct numeric,
              net_assets_func numeric, rate numeric, net_assets_reporting numeric,
              group_share numeric, nci_share numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE g consol_group%ROWTYPE; eo record; v_func char(3); v_name text; v_na numeric; v_rate numeric; v_rep numeric;
BEGIN
    SELECT * INTO g FROM consol_group WHERE id=p_group;
    FOR eo IN SELECT * FROM effective_ownership(p_group) LOOP
        SELECT e.functional_ccy, e.name INTO v_func, v_name FROM entity e WHERE e.id=eo.entity_id;
        v_na := entity_net_assets(eo.entity_id, p_rate_date);
        IF v_func = g.reporting_ccy THEN v_rate := 1; ELSE SELECT f.rate INTO v_rate FROM fx_lookup(v_func, g.reporting_ccy, p_rate_date) f; END IF;
        v_rate := COALESCE(v_rate,1);
        v_rep := round(v_na * v_rate, 2);
        entity_id:=eo.entity_id; entity_name:=v_name; functional_ccy:=v_func; effective_pct:=eo.effective_pct;
        net_assets_func:=v_na; rate:=v_rate; net_assets_reporting:=v_rep;
        group_share := round(v_rep * eo.effective_pct/100.0, 2);
        nci_share   := round(v_rep * (100-eo.effective_pct)/100.0, 2);
        RETURN NEXT;
    END LOOP;
END $$;

-- currency translation reserve: movement on foreign net assets between two rate dates
CREATE OR REPLACE FUNCTION consolidated_cta(p_group bigint, p_opening_date date, p_closing_date date)
RETURNS TABLE(entity_id bigint, entity_name text, functional_ccy text,
              net_assets_func numeric, opening_rate numeric, closing_rate numeric, cta numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE g consol_group%ROWTYPE; m record; v_func char(3); v_name text; v_na numeric; v_o numeric; v_c numeric;
BEGIN
    SELECT * INTO g FROM consol_group WHERE id=p_group;
    FOR m IN SELECT cgm.entity_id FROM consol_group_member cgm WHERE cgm.group_id=p_group LOOP
        SELECT e.functional_ccy, e.name INTO v_func, v_name FROM entity e WHERE e.id=m.entity_id;
        IF v_func = g.reporting_ccy THEN CONTINUE; END IF;  -- no translation difference for same-ccy
        v_na := entity_net_assets(m.entity_id, p_closing_date);
        SELECT f.rate INTO v_o FROM fx_lookup(v_func, g.reporting_ccy, p_opening_date) f;
        SELECT f.rate INTO v_c FROM fx_lookup(v_func, g.reporting_ccy, p_closing_date) f;
        entity_id:=m.entity_id; entity_name:=v_name; functional_ccy:=v_func; net_assets_func:=v_na;
        opening_rate:=v_o; closing_rate:=v_c; cta := round(v_na * (COALESCE(v_c,0)-COALESCE(v_o,0)), 2);
        RETURN NEXT;
    END LOOP;
END $$;
