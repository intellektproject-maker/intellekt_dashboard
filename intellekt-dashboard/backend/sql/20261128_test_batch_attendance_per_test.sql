-- Test Batch only: support attendance separately for each registered test.
-- Existing daily attendance rows are preserved with test_code = NULL.
-- Run only against the TESTING database after confirming the connection.

BEGIN;

ALTER TABLE public.test_batch_attendance
  ADD COLUMN IF NOT EXISTS test_code VARCHAR(100);

-- Replace the old student+date uniqueness rule with test-level uniqueness.
ALTER TABLE public.test_batch_attendance
  DROP CONSTRAINT IF EXISTS uq_test_batch_attendance;

CREATE UNIQUE INDEX IF NOT EXISTS uq_test_batch_attendance_per_test
  ON public.test_batch_attendance (roll_no, attendance_date, test_code);

CREATE INDEX IF NOT EXISTS idx_test_batch_attendance_test_date
  ON public.test_batch_attendance (test_code, attendance_date);

COMMIT;
