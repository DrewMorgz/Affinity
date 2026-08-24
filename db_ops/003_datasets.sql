-- =====================================================================
-- AFFINITY — UI DATASET STORE (chart/analytics data for Budgeting + Reporting)
-- Precomputed datasets as JSON. In production these become computed views.
-- Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS ui_dataset ( dkey text PRIMARY KEY, data jsonb NOT NULL );
DROP FUNCTION IF EXISTS get_datasets(text);
CREATE FUNCTION get_datasets(p_prefix text)
RETURNS TABLE(dkey text, data jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT dkey, data FROM ui_dataset WHERE dkey LIKE p_prefix || '%' ORDER BY dkey; $$;
GRANT EXECUTE ON FUNCTION get_datasets(text) TO authenticated;

INSERT INTO ui_dataset(dkey,data) VALUES
('budget.budgets','[
 {"id":1,"name":"Group — FY 2025/26","type":"Annual","status":"Approved","owner":"Neil Kelly","version":"v3","period":"Apr 2025 – Mar 2026","totalRev":2100000,"totalCost":1420000},
 {"id":2,"name":"Isle of Man — FY 2025/26","type":"Departmental","status":"Approved","owner":"Roxy Sheeley","version":"v2","period":"Apr 2025 – Mar 2026","totalRev":620000,"totalCost":390000},
 {"id":3,"name":"Malta — FY 2025/26","type":"Departmental","status":"Approved","owner":"Joanne Fenech","version":"v1","period":"Apr 2025 – Mar 2026","totalRev":310000,"totalCost":210000},
 {"id":4,"name":"Cayman — FY 2025/26","type":"Departmental","status":"Draft","owner":"Garry Crossan","version":"v1","period":"Apr 2025 – Mar 2026","totalRev":840000,"totalCost":580000},
 {"id":5,"name":"Group — FY 2025/26 Reforecast Q1","type":"Reforecast","status":"Under review","owner":"Neil Kelly","version":"v1","period":"Apr 2025 – Mar 2026","totalRev":2240000,"totalCost":1460000}]'::jsonb),
('budget.monthly','[
 {"month":"Apr","budget":160000,"forecast":165000,"actual":158000,"budgetC":115000,"forecastC":118000,"actualC":112000},
 {"month":"May","budget":163000,"forecast":168000,"actual":171000,"budgetC":117000,"forecastC":120000,"actualC":119000},
 {"month":"Jun","budget":165000,"forecast":172000,"actual":168000,"budgetC":118000,"forecastC":122000,"actualC":117000},
 {"month":"Jul","budget":168000,"forecast":175000,"actual":null,"budgetC":120000,"forecastC":124000,"actualC":null},
 {"month":"Aug","budget":162000,"forecast":170000,"actual":null,"budgetC":116000,"forecastC":121000,"actualC":null},
 {"month":"Sep","budget":170000,"forecast":178000,"actual":null,"budgetC":122000,"forecastC":127000,"actualC":null}]'::jsonb),
('budget.scenarios','[
 {"name":"Base case","rev":2100000,"cost":1420000,"margin":32.4,"prob":"60%","color":"#00C4CC"},
 {"name":"Best case","rev":2380000,"cost":1440000,"margin":39.5,"prob":"20%","color":"#4CAF7D"},
 {"name":"Downside","rev":1820000,"cost":1400000,"margin":23.1,"prob":"20%","color":"#EF4444"}]'::jsonb),
('budget.variance','[
 {"line":"Retainer income","budget":980000,"actual":497000,"variance":12000,"pct":"+2.5%","status":"Favourable"},
 {"line":"Ad hoc income","budget":420000,"actual":198000,"variance":-8000,"pct":"-3.8%","status":"Adverse"},
 {"line":"Specialist income","budget":700000,"actual":372000,"variance":18000,"pct":"+5.1%","status":"Favourable"},
 {"line":"Staff costs","budget":860000,"actual":428000,"variance":6000,"pct":"+1.4%","status":"Adverse"},
 {"line":"Office & premises","budget":180000,"actual":88000,"variance":-4000,"pct":"-4.3%","status":"Favourable"},
 {"line":"IT & software","budget":95000,"actual":52000,"variance":2000,"pct":"+4.0%","status":"Adverse"},
 {"line":"Professional fees","budget":120000,"actual":58000,"variance":-8000,"pct":"-12.1%","status":"Favourable"},
 {"line":"Travel & expenses","budget":65000,"actual":28000,"variance":4000,"pct":"+16.7%","status":"Adverse"}]'::jsonb),
('budget.servicelines','[
 {"line":"Company administration","budget":680000,"forecast":710000,"actual":348000,"margin":38},
 {"line":"Trust administration","budget":520000,"forecast":545000,"actual":268000,"margin":42},
 {"line":"Compliance services","budget":310000,"forecast":325000,"actual":162000,"margin":45},
 {"line":"Accounting & finance","budget":280000,"forecast":290000,"actual":141000,"margin":35},
 {"line":"Specialist — Yachting","budget":180000,"forecast":195000,"actual":94000,"margin":52},
 {"line":"Specialist — Sports","budget":130000,"forecast":138000,"actual":68000,"margin":48}]'::jsonb),
('budget.pos','[
 {"ref":"PO-2025-018","supplier":"Carey Olsen — Legal","amount":12000,"status":"Approved","raised":"01/05/2025","dept":"Legal"},
 {"ref":"PO-2025-019","supplier":"Microsoft Azure","amount":3200,"status":"Approved","raised":"01/06/2025","dept":"IT"},
 {"ref":"PO-2025-020","supplier":"Worldcheck — Refinitiv","amount":8400,"status":"Approved","raised":"01/04/2025","dept":"Compliance"},
 {"ref":"PO-2025-021","supplier":"KPMG — Audit fees","amount":28000,"status":"Pending","raised":"14/07/2025","dept":"Finance"},
 {"ref":"PO-2025-022","supplier":"Office supplies — IOM","amount":1200,"status":"Approved","raised":"10/07/2025","dept":"Operations"},
 {"ref":"PO-2025-023","supplier":"Staff training — AML","amount":4500,"status":"Pending","raised":"14/07/2025","dept":"Compliance"}]'::jsonb),
('report.revenueByOffice','[
 {"month":"Jan","IOM":18200,"Malta":9400,"Cayman":24600,"UK":6200,"Miami":3100},
 {"month":"Feb","IOM":17800,"Malta":10200,"Cayman":23100,"UK":5800,"Miami":2900},
 {"month":"Mar","IOM":19400,"Malta":11000,"Cayman":25800,"UK":7100,"Miami":4200},
 {"month":"Apr","IOM":20100,"Malta":9800,"Cayman":26400,"UK":6600,"Miami":3800},
 {"month":"May","IOM":18900,"Malta":12200,"Cayman":27200,"UK":7400,"Miami":5100},
 {"month":"Jun","IOM":21300,"Malta":11600,"Cayman":28900,"UK":8200,"Miami":4600},
 {"month":"Jul","IOM":19800,"Malta":10900,"Cayman":26100,"UK":7800,"Miami":5400}]'::jsonb),
('report.wipTrend','[{"month":"Feb","wip":38200},{"month":"Mar","wip":41500},{"month":"Apr","wip":44800},{"month":"May","wip":42100},{"month":"Jun","wip":46300},{"month":"Jul","wip":48320}]'::jsonb),
('report.debtorTrend','[{"month":"Feb","overdue":18200},{"month":"Mar","overdue":22400},{"month":"Apr","overdue":19800},{"month":"May","overdue":24100},{"month":"Jun","overdue":21600},{"month":"Jul","overdue":27720}]'::jsonb),
('report.utilData','[{"name":"Garry Crossan","util":82,"target":75},{"name":"Gary Harrison","util":77,"target":75},{"name":"Roxy Sheeley","util":76,"target":75},{"name":"Neil Kelly","util":75,"target":75},{"name":"Joanne Fenech","util":74,"target":75},{"name":"Patrick Walsh","util":74,"target":75},{"name":"Maria Borg","util":74,"target":75},{"name":"Andy Morgan","util":56,"target":75},{"name":"Sarah Cole","util":0,"target":75}]'::jsonb),
('report.riskPie','[{"name":"Low","value":142,"color":"#4CAF7D"},{"name":"Medium","value":112,"color":"#F59E0B"},{"name":"High","value":38,"color":"#EF4444"},{"name":"Very High","value":8,"color":"#7B1D1D"}]'::jsonb),
('report.jurPie','[{"name":"Isle of Man","value":114,"color":"#00C4CC"},{"name":"Cayman Islands","value":87,"color":"#1A7FBF"},{"name":"Malta","value":52,"color":"#7C5CBF"},{"name":"United Kingdom","value":31,"color":"#4A7C6F"},{"name":"Miami","value":16,"color":"#BF5C7A"}]'::jsonb)
ON CONFLICT (dkey) DO UPDATE SET data=EXCLUDED.data;
