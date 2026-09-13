-- Dispatch exceptions and notification failures record the supplier that owns the
-- booking, and the supplier dispatch queue filters on it. Migration 026 started
-- writing staff_tasks.supplier_id without ever adding the column, so every
-- "assign manually" task failed on insert and the supplier queue could not load.
ALTER TABLE staff_tasks ADD COLUMN IF NOT EXISTS supplier_id TEXT;
UPDATE staff_tasks SET supplier_id = (SELECT b.supplier_id FROM bookings b WHERE b.id = staff_tasks.booking_id)
  WHERE supplier_id IS NULL AND booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_tasks_supplier_open ON staff_tasks(supplier_id, task_type, status);
-- @down
DROP INDEX IF EXISTS idx_staff_tasks_supplier_open;
ALTER TABLE staff_tasks DROP COLUMN supplier_id;
