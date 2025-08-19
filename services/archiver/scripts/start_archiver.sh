#!/bin/bash
# Simple script to start the Matrix archiver with proper environment variables

cd /home/matrix-ai/services/archiver

# Load environment variables and export them
export MATRIX_PASSWORD="HnvtFkgDZjF4"
export SUPABASE_URL="https://suzxmthipriaglududga.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1enhtdGhpcHJpYWdsdWR1ZGdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTQ2ODUxMiwiZXhwIjoyMDcxMDQ0NTEyfQ.uAF5QDhBXDmI9LdAmeMcJfcc5VTtRT063zmXQShES-A"

echo "Starting Unified Matrix Archiver..."
python3 bin/unified_archiver.py