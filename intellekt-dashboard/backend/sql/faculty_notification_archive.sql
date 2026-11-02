-- Run once against the Railway PostgreSQL database.
-- Supports archived notification history and automatic 30-day cleanup.
ALTER TABLE public.faculty_notifications
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_faculty_notifications_active
  ON public.faculty_notifications (faculty_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_faculty_notifications_archived
  ON public.faculty_notifications (faculty_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;
