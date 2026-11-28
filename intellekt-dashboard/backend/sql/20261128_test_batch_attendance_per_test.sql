-- Test Batch only: support attendance separately for each registered test.
-- Backfill each legacy daily record to every registered test for that student/date.
-- Run only against the TESTING database after confirming the connection.

BEGIN;

ALTER TABLE public.test_batch_attendance
  ADD COLUMN IF NOT EXISTS test_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS marked_by_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS edited_by_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS updated_by_name VARCHAR(150);

-- Remove the old daily uniqueness rule before expanding one row into test-wise rows.
ALTER TABLE public.test_batch_attendance
  DROP CONSTRAINT IF EXISTS uq_test_batch_attendance;
ALTER TABLE public.test_batch_attendance
  DROP CONSTRAINT IF EXISTS test_batch_attendance_roll_no_attendance_date_key;

-- Assign each legacy row to the first registered test, then copy its status
-- and audit metadata to the other tests registered on that same writing date.
UPDATE public.test_batch_attendance a
SET test_code = (
  SELECT MIN(TRIM(r.test_code))
  FROM public.test_batch_registrations r
  WHERE UPPER(TRIM(r.roll_no))=UPPER(TRIM(a.roll_no))
    AND r.writing_date=a.attendance_date
    AND r.status='Registered'
)
WHERE a.test_code IS NULL
  AND EXISTS (
    SELECT 1 FROM public.test_batch_registrations r
    WHERE UPPER(TRIM(r.roll_no))=UPPER(TRIM(a.roll_no))
      AND r.writing_date=a.attendance_date
      AND r.status='Registered'
  );

INSERT INTO public.test_batch_attendance
  (roll_no,attendance_date,test_code,status,marked_by,marked_by_name,marked_at,
   edited_by,edited_by_name,edited_at,updated_by_name)
SELECT a.roll_no,a.attendance_date,TRIM(r.test_code),a.status,a.marked_by,a.marked_by_name,a.marked_at,
       a.edited_by,a.edited_by_name,a.edited_at,a.updated_by_name
FROM public.test_batch_attendance a
JOIN public.test_batch_registrations r
  ON UPPER(TRIM(r.roll_no))=UPPER(TRIM(a.roll_no))
 AND r.writing_date=a.attendance_date
 AND r.status='Registered'
WHERE a.test_code IS NOT NULL
  AND UPPER(TRIM(r.test_code))<>UPPER(TRIM(a.test_code))
  AND NOT EXISTS (
    SELECT 1 FROM public.test_batch_attendance existing
    WHERE UPPER(TRIM(existing.roll_no))=UPPER(TRIM(a.roll_no))
      AND existing.attendance_date=a.attendance_date
      AND UPPER(TRIM(existing.test_code))=UPPER(TRIM(r.test_code))
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_test_batch_attendance_per_test
  ON public.test_batch_attendance (roll_no, attendance_date, test_code);

CREATE INDEX IF NOT EXISTS idx_test_batch_attendance_test_date
  ON public.test_batch_attendance (test_code, attendance_date);

COMMIT;
