-- =====================================================================
-- AFFINITY — INVOICING BACK OFFICE (client fee invoices)
-- Status computed live (Paid/Overdue/Partial/Sent/Draft). Run once. Safe to re-run.
-- =====================================================================
CREATE TABLE IF NOT EXISTS fee_invoice (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref text, client text, entity_label text, jur text, amount numeric, balance numeric,
  base_status text DEFAULT 'Sent', due_date date, invoice_type text, currency char(3),
  raised_date date, bookkept boolean DEFAULT true
);
DROP FUNCTION IF EXISTS fee_invoices();
CREATE FUNCTION fee_invoices()
RETURNS TABLE(id bigint, ref text, client text, entity text, jur text, amount numeric, balance numeric,
  status text, due text, type text, currency text, raised text, bookept boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, ref, client, entity_label, jur, amount, balance,
    CASE WHEN base_status='Draft' THEN 'Draft'
         WHEN balance<=0 THEN 'Paid'
         WHEN due_date < current_date THEN 'Overdue'
         WHEN balance < amount THEN 'Partial'
         ELSE 'Sent' END,
    to_char(due_date,'DD/MM/YYYY'), invoice_type, currency, to_char(raised_date,'DD/MM/YYYY'), bookkept
  FROM fee_invoice ORDER BY id;
$$;
GRANT EXECUTE ON FUNCTION fee_invoices() TO anon, authenticated;

DO $$
DECLARE d date := current_date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM fee_invoice) THEN
    INSERT INTO fee_invoice(ref,client,entity_label,jur,amount,balance,base_status,due_date,invoice_type,currency,raised_date,bookkept) VALUES
     ('INV-IOM-2025-041','Harrington Family','Meridian Holdings Ltd','Isle of Man',2000,2000,'Sent',d+10,'Retainer','GBP',d-20,true),
     ('INV-IOM-2025-038','Harrington Family','Harrington Family Trust','Isle of Man',1250,1250,'Sent',d-40,'Ad hoc','GBP',d-70,true),
     ('INV-CYM-2025-019','Caledonian Group','Caledonian Ventures Ltd','Cayman Islands',5100,0,'Sent',d-30,'Retainer','USD',d-120,true),
     ('INV-MLT-2025-022','Azure Group','Azure Mediterranean Foundation','Malta',1800,900,'Sent',d+10,'Retainer','EUR',d-20,true),
     ('INV-IOM-2025-035','North Star Group','North Star Holdings Ltd','Isle of Man',600,600,'Sent',d-60,'Ad hoc','GBP',d-90,true),
     ('INV-CYM-2025-021','Pacific Wealth','Pacific Wealth Trust','Cayman Islands',4200,4200,'Sent',d+10,'Retainer','USD',d-20,true),
     ('INV-IOM-2025-040','Cheshire Family','Rosewood Legacy Trust','Isle of Man',2400,2400,'Draft',d+10,'Retainer','GBP',d-20,false),
     ('INV-CYM-2025-023','Apex Group','Apex Growth Fund Ltd','Cayman Islands',5500,5500,'Sent',d+10,'Retainer','USD',d-20,true),
     ('INV-MLT-2025-020','Stonebridge Group','Stonebridge Capital Ltd','Malta',825,0,'Sent',d-30,'Ad hoc','EUR',d-45,true),
     ('INV-IOM-2025-033','Harrington Family','Harrington Family Trust','Isle of Man',500,500,'Sent',d-140,'Ad hoc','GBP',d-170,true);
  END IF;
END $$;
