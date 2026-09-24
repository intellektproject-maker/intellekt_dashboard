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
