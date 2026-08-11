-- =====================================================================
-- AFFINITY — TASKS BACK OFFICE (operational task list)
-- Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS task (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL, category text, entity_label text, assignee text, created_by text,
  due_date date, status text DEFAULT 'Open', notes text, priority text DEFAULT 'Medium'
);
DROP FUNCTION IF EXISTS tasks_list();
CREATE FUNCTION tasks_list()
RETURNS TABLE(id bigint, title text, category text, entity text, assignee text, created_by text,
  due text, status text, notes text, priority text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, title, category, entity_label, assignee, created_by,
    CASE WHEN due_date IS NULL THEN '—'
         WHEN due_date < current_date AND status='Open' THEN 'Overdue'
         ELSE to_char(due_date,'DD/MM/YYYY') END,
    status, notes, priority
  FROM task ORDER BY (status='Completed'),
    CASE priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, due_date NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION tasks_list() TO anon, authenticated;

DO $$
DECLARE d date := current_date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM task) THEN
    INSERT INTO task(title,category,entity_label,assignee,created_by,due_date,status,notes,priority) VALUES
     ('Harrington Trust — CPR overdue','Compliance','Harrington Family Trust','Roxy Sheeley','Gary Harrison',d-90,'Open','High risk client. Review overdue by 3 months.','Critical'),
     ('Apex Growth Fund — sanctions MLRO review','Compliance','Apex Growth Fund Ltd','Gary Harrison','Andy Morgan',d,'Open','Worldcheck match requires MLRO sign-off.','Critical'),
     ('Emma Harrington — KYC passport expired','Compliance','Harrington Family Trust','Roxy Sheeley','Gary Harrison',d-30,'Open','Passport expired. Renewal required.','High'),
     ('Q3 retainer invoices — approve batch','Accounts','All entities','Neil Kelly','Neil Kelly',d+1,'Open','7 invoices awaiting approval before issue.','Medium'),
     ('Sarah Cole — missing timesheet','Internal Accounts','—','Roxy Sheeley','Roxy Sheeley',d,'Open','Reminder sent. No response.','Low'),
     ('North Star — sign off attrition form','Admin','North Star Holdings Ltd','Andy Morgan','Roxy Sheeley',d+1,'Open','Awaiting CFO sign-off per procedure.','Medium'),
     ('Pacific Wealth Trust — EDD outstanding','Compliance','Pacific Wealth Trust','Garry Crossan','Gary Harrison',d+4,'Open','EDD pack requested. Client yet to respond.','High'),
     ('Stonebridge — director appointment resolution','Statutory','Stonebridge Capital Ltd','Joanne Fenech','Joanne Fenech',d+4,'Open','Board resolution required before filing.','Medium'),
     ('Maria Borg — missing timesheet','Internal Accounts','—','Joanne Fenech','Joanne Fenech',d,'Open','First week. Reminder sent.','Low'),
     ('Meridian Holdings — annual return prep','Statutory','Meridian Holdings Ltd','Roxy Sheeley','Andy Morgan',d+60,'Open','Due September. Start preparation now.','Medium'),
     ('Garry Crossan — enforce MFA on system','Admin','—','Andy Morgan','Andy Morgan',d,'Open','Security requirement for all directors.','High'),
     ('Azure Mediterranean — Q2 management accounts','Accounts','Azure Mediterranean Fdn','Joanne Fenech','Neil Kelly',d+70,'Open','Target sign-off by end of September.','Low'),
     ('Caledonian Ventures — substance filing','Statutory','Caledonian Ventures Ltd','Garry Crossan','Gary Harrison',d-20,'Completed','ESR filed.','Medium');
  END IF;
END $$;
