-- =====================================================================
-- AFFINITY ACCOUNTING ENGINE  —  KPI METRICS LAYER  (050)
-- Engine-side data backbone for the app's KPI dashboard (chart rendering is
-- front-end). Computes standard finance KPIs per entity for a period.
-- =====================================================================

CREATE OR REPLACE FUNCTION entity_kpis(p_entity bigint, p_start date, p_end date)
RETURNS TABLE(metric text, value numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_rev numeric; v_exp numeric; v_cash numeric; v_debt numeric; v_cred numeric;
        v_days int := GREATEST((p_end - p_start) + 1, 1);
BEGIN
    SELECT COALESCE(-SUM(jl.func_amount) FILTER (WHERE a.account_type='income'),0),
           COALESCE( SUM(jl.func_amount) FILTER (WHERE a.account_type='expense'),0)
      INTO v_rev, v_exp
    FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
      AND j.entity_id=p_entity AND j.journal_date BETWEEN p_start AND p_end
    JOIN account a ON a.id=jl.account_id;

    SELECT COALESCE(SUM(jl.func_amount),0) INTO v_cash
    FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
      AND j.entity_id=p_entity AND j.journal_date<=p_end
    JOIN account a ON a.id=jl.account_id AND a.code IN ('1000','1010','1020');

    SELECT COALESCE(SUM(jl.func_amount),0) INTO v_debt
    FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
      AND j.entity_id=p_entity AND j.journal_date<=p_end
    JOIN account a ON a.id=jl.account_id AND a.code='1100';

    SELECT COALESCE(-SUM(jl.func_amount),0) INTO v_cred
    FROM journal_line jl JOIN journal j ON j.id=jl.journal_id AND j.status='posted'
      AND j.entity_id=p_entity AND j.journal_date<=p_end
    JOIN account a ON a.id=jl.account_id AND a.code='2100';

    metric:='revenue';        value:=round(v_rev,2); RETURN NEXT;
    metric:='expenses';       value:=round(v_exp,2); RETURN NEXT;
    metric:='net_profit';     value:=round(v_rev-v_exp,2); RETURN NEXT;
    metric:='profit_margin_pct'; value:=CASE WHEN v_rev<>0 THEN round((v_rev-v_exp)/v_rev*100,1) ELSE NULL END; RETURN NEXT;
    metric:='cash';           value:=round(v_cash,2); RETURN NEXT;
    metric:='trade_debtors';  value:=round(v_debt,2); RETURN NEXT;
    metric:='trade_creditors';value:=round(v_cred,2); RETURN NEXT;
    metric:='working_capital';value:=round(v_cash+v_debt-v_cred,2); RETURN NEXT;
    metric:='current_ratio';  value:=CASE WHEN v_cred<>0 THEN round((v_cash+v_debt)/v_cred,2) ELSE NULL END; RETURN NEXT;
    metric:='dso_days';       value:=CASE WHEN v_rev<>0 THEN round(v_debt/v_rev*v_days,0) ELSE NULL END; RETURN NEXT;
END $$;

-- JSON KPI bundle for the dashboard to bind to
CREATE OR REPLACE FUNCTION build_kpi_dashboard(p_entity bigint, p_start date, p_end date)
RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'entity', (SELECT jsonb_build_object('id',id,'code',company_code,'name',name) FROM entity WHERE id=p_entity),
        'period', jsonb_build_object('start',p_start,'end',p_end),
        'kpis', (SELECT jsonb_object_agg(metric, value) FROM entity_kpis(p_entity,p_start,p_end)));
$$;
