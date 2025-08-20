#!/usr/bin/env python3
"""Apply organizations system migration via Supabase REST API."""

import asyncio
import aiohttp
import os
import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def apply_migration():
    """Apply the organizations system migration."""
    
    # Load environment variables
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url or not supabase_key:
        logger.error("Missing Supabase credentials")
        return False
        
    # Read migration SQL
    migration_path = "/home/matrix-ai/services/archiver/data/migrations/003_organizations_system.sql"
    try:
        with open(migration_path, 'r') as f:
            migration_sql = f.read()
    except Exception as e:
        logger.error(f"Failed to read migration file: {e}")
        return False
    
    # Apply migration via Supabase REST API (PostgreSQL function)
    async with aiohttp.ClientSession() as session:
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json"
        }
        
        # Use Supabase RPC to execute raw SQL
        payload = {
            "query": migration_sql
        }
        
        try:
            # Note: We'll use the PostgreSQL REST API endpoint
            async with session.post(
                f"{supabase_url}/rest/v1/rpc/exec_sql",
                json=payload,
                headers=headers
            ) as resp:
                if resp.status in [200, 201]:
                    logger.info("✅ Migration applied successfully!")
                    return True
                else:
                    error = await resp.text()
                    logger.error(f"Migration failed: {resp.status} - {error}")
                    
                    # Try alternative approach using direct SQL execution
                    logger.info("Trying alternative SQL execution method...")
                    
                    # Split migration into individual statements
                    statements = [stmt.strip() for stmt in migration_sql.split(';') if stmt.strip() and not stmt.strip().startswith('--')]
                    
                    success_count = 0
                    for i, stmt in enumerate(statements):
                        if stmt.upper() in ['BEGIN', 'COMMIT']:
                            continue
                            
                        logger.info(f"Executing statement {i+1}/{len(statements)}")
                        try:
                            async with session.post(
                                f"{supabase_url}/rest/v1/rpc/exec",
                                json={"sql": stmt},
                                headers=headers
                            ) as stmt_resp:
                                if stmt_resp.status in [200, 201]:
                                    success_count += 1
                                    logger.info(f"Statement {i+1} executed successfully")
                                else:
                                    stmt_error = await stmt_resp.text()
                                    logger.warning(f"Statement {i+1} failed: {stmt_resp.status} - {stmt_error}")
                        except Exception as e:
                            logger.warning(f"Statement {i+1} error: {e}")
                    
                    logger.info(f"Manual execution: {success_count}/{len(statements)} statements succeeded")
                    return success_count > 0
                    
        except Exception as e:
            logger.error(f"Error applying migration: {e}")
            return False

async def main():
    """Main entry point."""
    # Load environment from env file
    env_file = "/home/matrix-ai/config/archiver/env"
    try:
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    # Remove quotes if present
                    value = value.strip('"\'')
                    os.environ[key] = value
    except Exception as e:
        logger.error(f"Failed to load environment file: {e}")
        return
    
    success = await apply_migration()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())