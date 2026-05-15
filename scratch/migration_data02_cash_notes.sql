-- DATA-02: Add notes field to cash_records for reconciliation justification
-- Run manually in Supabase SQL Editor after review

ALTER TABLE cash_records
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Optional: add closing_difference to track physical vs computed mismatch
ALTER TABLE cash_records
  ADD COLUMN IF NOT EXISTS closing_difference NUMERIC(12, 2);

COMMENT ON COLUMN cash_records.notes IS 'Justificación de diferencias de cuadre al cierre de caja';
COMMENT ON COLUMN cash_records.closing_difference IS 'Diferencia entre saldo calculado y contado físicamente';
