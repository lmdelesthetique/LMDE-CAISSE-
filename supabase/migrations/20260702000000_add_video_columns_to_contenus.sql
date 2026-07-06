-- Add video upload columns to campagne_contenus
ALTER TABLE public.campagne_contenus
  ADD COLUMN IF NOT EXISTS video_path         TEXT,
  ADD COLUMN IF NOT EXISTS video_filename     TEXT,
  ADD COLUMN IF NOT EXISTS video_size_bytes   BIGINT,
  ADD COLUMN IF NOT EXISTS video_uploaded_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS video_deleted_at   TIMESTAMPTZ;
