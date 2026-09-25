-- Test Batch schema for INTELLEKT Dashboard.
-- Run manually in Railway PostgreSQL.
-- Existing Regular Student tables/data are not modified.

CREATE TABLE IF NOT EXISTS test_series (
  id SMALLSERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_test_series_name CHECK (name IN ('Test Series 10', 'Test Series 15', 'Test Series 30'))
);

INSERT INTO test_series (name)
VALUES ('Test Series 10'), ('Test Series 15'), ('Test Series 30')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS test_batch_students (
  roll_no VARCHAR(20) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  class VARCHAR(50),
  board VARCHAR(50),
  mode_of_education VARCHAR(50),
  subjects VARCHAR(20),
  phone VARCHAR(20),
  email VARCHAR(255),
  school_name VARCHAR(255),
  password VARCHAR(255) NOT NULL,
  must_reset_password BOOLEAN NOT NULL DEFAULT TRUE,
  test_series_id SMALLINT NOT NULL REFERENCES test_series(id),
  created_by VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_test_batch_roll_no CHECK (roll_no ~ '^IAT[0-9]{3,}$'),
  CONSTRAINT uq_test_batch_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS test_batch_marks (
  id BIGSERIAL PRIMARY KEY,
  roll_no VARCHAR(20) NOT NULL REFERENCES test_batch_students(roll_no) ON DELETE CASCADE,
  test_code VARCHAR(100) NOT NULL,
  subject_name VARCHAR(150) NOT NULL,
  total_marks NUMERIC(10,2) NOT NULL CHECK (total_marks > 0),
  marks_obtained VARCHAR(20) NOT NULL,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_test_batch_mark UNIQUE (roll_no, test_code, subject_name)
);

CREATE TABLE IF NOT EXISTS test_batch_attendance (
  id BIGSERIAL PRIMARY KEY,
  roll_no VARCHAR(20) NOT NULL REFERENCES test_batch_students(roll_no) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status VARCHAR(10) NOT NULL CHECK (status IN ('Present', 'Absent')),
  marked_by VARCHAR(50),
  marked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_by VARCHAR(50),
  edited_at TIMESTAMPTZ,
  CONSTRAINT uq_test_batch_attendance UNIQUE (roll_no, attendance_date)
);

ALTER TABLE test_batch_students
  ADD COLUMN IF NOT EXISTS subjects VARCHAR(20);

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_test_batch_students_subjects'
  ) THEN
    ALTER TABLE test_batch_students
      ADD CONSTRAINT chk_test_batch_students_subjects
      CHECK (subjects IS NULL OR subjects IN ('Mathematics', 'Physics', 'Both'));
  END IF;
END $;

CREATE INDEX IF NOT EXISTS idx_test_batch_students_series ON test_batch_students(test_series_id);
CREATE INDEX IF NOT EXISTS idx_test_batch_students_created ON test_batch_students(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_batch_marks_roll ON test_batch_marks(roll_no);
CREATE INDEX IF NOT EXISTS idx_test_batch_marks_test ON test_batch_marks(test_code);
CREATE INDEX IF NOT EXISTS idx_test_batch_attendance_roll_date ON test_batch_attendance(roll_no, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_test_batch_attendance_date ON test_batch_attendance(attendance_date);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty' AND column_name='faculty_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_test_batch_students_created_by') THEN
    ALTER TABLE test_batch_students
      ADD CONSTRAINT fk_test_batch_students_created_by
      FOREIGN KEY (created_by) REFERENCES faculty(faculty_id)
      ON DELETE SET NULL;
  END IF;
END $$;


-- Test Batch test management. Completely separate from the Regular Student tests table.
CREATE TABLE IF NOT EXISTS test_batch_tests (
  id BIGSERIAL PRIMARY KEY,
  test_code VARCHAR(100) NOT NULL UNIQUE,
  test_series_id SMALLINT NOT NULL REFERENCES test_series(id) ON DELETE RESTRICT,
  subject_name VARCHAR(150) NOT NULL,
  test_date DATE NOT NULL,
  writing_date DATE NOT NULL,
  slot_start TIME,
  slot_end TIME,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  total_marks NUMERIC(10,2) NOT NULL CHECK (total_marks > 0),
  portion TEXT,
  chapter TEXT,
  application_open_date DATE,
  application_close_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'Scheduled'
    CHECK (status IN ('Draft','Scheduled','Active','Completed','Returned','Cancelled')),
  marks_entry_status VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (marks_entry_status IN ('Pending','Draft','Finalized')),
  marks_finalized_at TIMESTAMPTZ,
  marks_finalized_by VARCHAR(50),
  manual_mark_entry_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  bulk_mark_upload_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  passing_percentage NUMERIC(5,2) NOT NULL DEFAULT 40 CHECK (passing_percentage >= 0 AND passing_percentage <= 100),
  grade_boundaries JSONB NOT NULL DEFAULT '{"A":90,"B":75,"C":60,"D":40}'::jsonb,
  result_publication_mode VARCHAR(20) NOT NULL DEFAULT 'approval'
    CHECK (result_publication_mode IN ('immediate','approval')),
  show_detailed_breakdown BOOLEAN NOT NULL DEFAULT FALSE,
  reevaluation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  lock_marks_after_final_submission BOOLEAN NOT NULL DEFAULT TRUE,
  post_test_export_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  result_publication_status VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (result_publication_status IN ('Pending','Published')),
  result_published_at TIMESTAMPTZ,
  created_by VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_test_batch_tests_created_by FOREIGN KEY (created_by)
    REFERENCES faculty(faculty_id) ON DELETE SET NULL,
  CONSTRAINT fk_test_batch_tests_marks_finalized_by FOREIGN KEY (marks_finalized_by)
    REFERENCES faculty(faculty_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_test_batch_tests_series ON test_batch_tests(test_series_id);
CREATE INDEX IF NOT EXISTS idx_test_batch_tests_writing_date ON test_batch_tests(writing_date);
CREATE INDEX IF NOT EXISTS idx_test_batch_tests_status ON test_batch_tests(status);


-- Allow existing Test Batch tests to use Returned status and support
-- a draft/finalized marks-entry lifecycle.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'test_batch_tests_status_check'
      AND conrelid = 'test_batch_tests'::regclass
  ) THEN
    ALTER TABLE test_batch_tests DROP CONSTRAINT test_batch_tests_status_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_test_batch_tests_status'
  ) THEN
    ALTER TABLE test_batch_tests
      ADD CONSTRAINT chk_test_batch_tests_status
      CHECK (status IN ('Draft','Scheduled','Active','Completed','Returned','Cancelled'));
  END IF;
END $$;

ALTER TABLE test_batch_tests
  ADD COLUMN IF NOT EXISTS marks_entry_status VARCHAR(20) NOT NULL DEFAULT 'Pending';

ALTER TABLE test_batch_tests
  ADD COLUMN IF NOT EXISTS marks_finalized_at TIMESTAMPTZ;

ALTER TABLE test_batch_tests
  ADD COLUMN IF NOT EXISTS marks_finalized_by VARCHAR(50);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_test_batch_tests_marks_entry_status'
  ) THEN
    ALTER TABLE test_batch_tests
      ADD CONSTRAINT chk_test_batch_tests_marks_entry_status
      CHECK (marks_entry_status IN ('Pending','Draft','Finalized'));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='faculty' AND column_name='faculty_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_test_batch_tests_marks_finalized_by'
  ) THEN
    ALTER TABLE test_batch_tests
      ADD CONSTRAINT fk_test_batch_tests_marks_finalized_by
      FOREIGN KEY (marks_finalized_by) REFERENCES faculty(faculty_id)
      ON DELETE SET NULL;
  END IF;
END $$;


-- Post-test configuration for completed/returned Test Batch tests.
ALTER TABLE test_batch_tests
  ADD COLUMN IF NOT EXISTS manual_mark_entry_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS bulk_mark_upload_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS passing_percentage NUMERIC(5,2) NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS grade_boundaries JSONB NOT NULL DEFAULT '{"A":90,"B":75,"C":60,"D":40}'::jsonb,
  ADD COLUMN IF NOT EXISTS result_publication_mode VARCHAR(20) NOT NULL DEFAULT 'approval',
  ADD COLUMN IF NOT EXISTS show_detailed_breakdown BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reevaluation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lock_marks_after_final_submission BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS post_test_export_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS result_publication_status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS result_published_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_test_batch_posttest_publication_mode') THEN
    ALTER TABLE test_batch_tests ADD CONSTRAINT chk_test_batch_posttest_publication_mode
      CHECK (result_publication_mode IN ('immediate','approval'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_test_batch_posttest_publication_status') THEN
    ALTER TABLE test_batch_tests ADD CONSTRAINT chk_test_batch_posttest_publication_status
      CHECK (result_publication_status IN ('Pending','Published'));
  END IF;
END $$;
