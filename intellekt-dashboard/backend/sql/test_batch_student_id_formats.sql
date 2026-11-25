-- Run this against the TEST Railway database before using converted IA IDs.
-- Keep existing IAT IDs and support IA001, 27IA001, 28IA001,
-- and future 2-4 digit year-prefixed IA IDs.
ALTER TABLE test_batch_students
  DROP CONSTRAINT IF EXISTS chk_test_batch_roll_no;

ALTER TABLE test_batch_students
  ADD CONSTRAINT chk_test_batch_roll_no
  CHECK (roll_no ~ '^(IAT[0-9]{3,}|([0-9]{2,4})?IA[0-9]{3,})$');
