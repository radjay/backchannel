-- Migration: Create function to claim analysis jobs
-- Uses FOR UPDATE SKIP LOCKED to prevent race conditions

CREATE OR REPLACE FUNCTION claim_analysis_job()
RETURNS SETOF analysis_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  claimed_job analysis_jobs;
BEGIN
  -- Find and lock the next pending job
  SELECT * INTO claimed_job
  FROM analysis_jobs
  WHERE status = 'pending'
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
    attempts = attempts + 1
  WHERE id = claimed_job.id;

  -- Return the claimed job with updated values
  claimed_job.status := 'processing';
  claimed_job.started_at := NOW();
  claimed_job.attempts := claimed_job.attempts + 1;

  RETURN NEXT claimed_job;
  RETURN;
END;
$$;
