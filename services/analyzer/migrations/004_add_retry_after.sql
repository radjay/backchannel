-- Migration: Add retry_after column for exponential backoff
-- Run this in Supabase SQL Editor

-- Add retry_after column to analysis_jobs
ALTER TABLE analysis_jobs
ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP WITH TIME ZONE;

-- Update the claim_analysis_job function to respect retry_after
CREATE OR REPLACE FUNCTION claim_analysis_job()
RETURNS SETOF analysis_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  claimed_job analysis_jobs;
BEGIN
  -- Find and lock the next pending job that's ready to process
  SELECT * INTO claimed_job
  FROM analysis_jobs
  WHERE status = 'pending'
    AND (retry_after IS NULL OR retry_after <= NOW())
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If no job found, return empty
  IF claimed_job IS NULL THEN
    RETURN;
  END IF;

  -- Update the job status to processing
  UPDATE analysis_jobs
  SET
    status = 'processing',
    started_at = NOW(),
    attempts = attempts + 1,
    retry_after = NULL
  WHERE id = claimed_job.id;

  -- Return the claimed job with updated values
  claimed_job.status := 'processing';
  claimed_job.started_at := NOW();
  claimed_job.attempts := claimed_job.attempts + 1;
  claimed_job.retry_after := NULL;

  RETURN NEXT claimed_job;
  RETURN;
END;
$$;
