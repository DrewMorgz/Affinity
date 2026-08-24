-- =====================================================================
-- AFFINITY — OPS BATCH 1: timesheets, notifications, audit log, procedures
-- Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS timesheet_entry (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id int, entry_date date, entity_label text, matter text, entry_type text,
  units int, hours numeric, billable boolean, rate numeric, value numeric, status text, narrative text
);
CREATE TABLE IF NOT EXISTS notification (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  t timestamptz, ntype text, title text, body text, who text, mod text
);
CREATE TABLE IF NOT EXISTS audit_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  t timestamptz, staff_user text, user_id int, action text, mod text, target text, details text, ip text, severity text
);
CREATE TABLE IF NOT EXISTS procedure (
  id text PRIMARY KEY, title text, category text, office text, owner text, steps int, avg_time text, active_runs int
);
CREATE TABLE IF NOT EXISTS procedure_run (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proc text, title text, entity_label text, started date, step int, total int, assignee text, status text
);
CREATE TABLE IF NOT EXISTS procedure_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proc text, title text, entity_label text, done_date date, dur text, done_by text, result text
);

DROP FUNCTION IF EXISTS ts_entries();
CREATE FUNCTION ts_entries()
RETURNS TABLE(id bigint, "staffId" int, date text, entity text, matter text, type text, units int,
  hours numeric, billable boolean, rate numeric, value numeric, status text, narrative text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, staff_id, to_char(entry_date,'DD/MM/YYYY'), entity_label, matter, entry_type, units,
    hours, billable, rate, value, status, narrative FROM timesheet_entry ORDER BY entry_date DESC, id;
$$;
DROP FUNCTION IF EXISTS notifications_list();
CREATE FUNCTION notifications_list()
RETURNS TABLE(id bigint, t text, type text, title text, body text, who text, mod text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, to_char(t,'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ntype, title, body, who, mod FROM notification ORDER BY t DESC;
$$;
DROP FUNCTION IF EXISTS audit_events();
CREATE FUNCTION audit_events()
RETURNS TABLE(t text, "user" text, "userId" int, action text, mod text, target text, details text, ip text, severity text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT to_char(t,'YYYY-MM-DD"T"HH24:MI:SS"Z"'), staff_user, user_id, action, mod, target, details, ip, severity
  FROM audit_event ORDER BY t DESC;
$$;
DROP FUNCTION IF EXISTS procedures_list();
CREATE FUNCTION procedures_list()
RETURNS TABLE(id text, title text, category text, office text, owner text, steps int, "avgTime" text, "activeRuns" int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, title, category, office, owner, steps, avg_time, active_runs FROM procedure ORDER BY id;
$$;
DROP FUNCTION IF EXISTS procedure_runs();
CREATE FUNCTION procedure_runs()
RETURNS TABLE(id bigint, proc text, title text, entity text, started text, step int, total int, assignee text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, proc, title, entity_label, to_char(started,'DD/MM/YYYY'), step, total, assignee, status FROM procedure_run ORDER BY started DESC;
$$;
DROP FUNCTION IF EXISTS procedure_hist();
CREATE FUNCTION procedure_hist()
RETURNS TABLE(proc text, title text, entity text, date text, dur text, by text, result text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT proc, title, entity_label, to_char(done_date,'DD/MM/YYYY'), dur, done_by, result FROM procedure_history ORDER BY done_date DESC;
$$;
GRANT EXECUTE ON FUNCTION ts_entries(), notifications_list(), audit_events(), procedures_list(), procedure_runs(), procedure_hist() TO authenticated;

DO $$
DECLARE d date := current_date; n timestamptz := now();
BEGIN
  IF NOT EXISTS(SELECT 1 FROM timesheet_entry) THEN
    INSERT INTO timesheet_entry(staff_id,entry_date,entity_label,matter,entry_type,units,hours,billable,rate,value,status,narrative) VALUES
     (1,d,'Harrington Family Trust','Compliance review','Client — compliance',6,1.0,true,250,250,'Submitted','Reviewed outstanding KYC requirements.'),
     (1,d,'Meridian Holdings Ltd','Company administration','Client — admin',3,0.5,true,250,125,'Submitted','Updated director register following board meeting.'),
     (1,d,'Rosewood Legacy Trust','Trustee services','Client — trust',4,0.67,true,250,167.50,'Submitted','Q2 trust distribution — reviewed resolution.'),
     (1,d-3,'North Star Holdings Ltd','Liquidation admin','Client — admin',5,0.83,true,250,208.33,'Approved','Coordinated with liquidator re documents.'),
     (1,d-3,'Internal','Team meeting','Non-billable — internal',6,1.0,false,0,0,'Approved','Weekly administration team meeting.');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM notification) THEN
    INSERT INTO notification(t,ntype,title,body,who,mod) VALUES
     (n-interval '20 min','task','Roxy assigned you a task','Renew Apex Growth Fund licence','Roxy Sheeley','tasks'),
     (n-interval '55 min','approval','Document awaiting your approval','Engagement Letter — Adriatic Holdings','Joanne Fenech','documents'),
     (n-interval '90 min','mention','Colin @mentioned you','Need your sign-off on capital reorg','Colin Quayle','entities'),
     (n-interval '3 hour','compliance','KYC review due in 7 days','Pacific Wealth Trust · Cayman · High risk','System','compliance'),
     (n-interval '5 hour','onboarding','KYC pack received','Verona Digital Holdings — ready for review','Krista Fenech','onboarding');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM audit_event) THEN
    INSERT INTO audit_event(t,staff_user,user_id,action,mod,target,details,ip,severity) VALUES
     (n-interval '5 min','Andrew Morgan',1,'Logged in','System','Affinity Core','Login from Miami office IP','104.28.241.18','info'),
     (n-interval '25 min','Roxy Sheeley',14,'Document uploaded','Documents','AGM Minutes — Meridian Holdings','4.2 MB · Statutory','86.176.20.4','info'),
     (n-interval '50 min','Colin Quayle',12,'Director added','Entity Admin','Stonebridge Capital Ltd','Appointed new Director','86.176.21.92','info'),
     (n-interval '2 hour','Gary Harrison',5,'Risk rating changed','Compliance','Apex Growth Fund Ltd','Medium → High','86.176.22.10','warning');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM procedure) THEN
    INSERT INTO procedure(id,title,category,office,owner,steps,avg_time,active_runs) VALUES
     ('3.01','New client onboarding — company','Onboarding','All','Administrator',12,'10 days',2),
     ('3.02','New client onboarding — trust','Onboarding','All','Administrator',14,'14 days',1),
     ('3.05','New director appointment','Statutory','All','Administrator',7,'3 days',1),
     ('3.07','Periodic compliance review','Compliance','All','Compliance',9,'5 days',1),
     ('3.14','Annual return filing — IOM','Statutory','Isle of Man','Administrator',6,'2 days',0);
    INSERT INTO procedure_run(proc,title,entity_label,started,step,total,assignee,status) VALUES
     ('3.07','Periodic compliance review','Harrington Family Trust',d-10,4,9,'Roxy Sheeley','In progress'),
     ('3.05','New director appointment','Stonebridge Capital Ltd',d-5,2,7,'Joanne Fenech','In progress');
    INSERT INTO procedure_history(proc,title,entity_label,done_date,dur,done_by,result) VALUES
     ('3.07','Periodic compliance review','Stonebridge Capital Ltd',d-8,'2 days','Joanne Fenech','Complete'),
     ('3.14','Annual return filing — IOM','Rosewood Legacy Trust',d-11,'1 day','Roxy Sheeley','Complete');
  END IF;
END $$;
