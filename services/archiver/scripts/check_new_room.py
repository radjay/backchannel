#!/usr/bin/env python3
"""Check for new room and add it to monitored_rooms if needed."""

import asyncio
import aiohttp
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def check_and_add_new_room():
    """Check for the new room and add it to monitored_rooms."""
    
    # Load environment variables
    env_file = "/home/matrix-ai/config/archiver/env"
    try:
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    value = value.strip('"\'')
                    os.environ[key] = value
    except Exception as e:
        logger.error(f"Failed to load environment file: {e}")
        return
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url or not supabase_key:
        logger.error("Missing Supabase credentials")
        return
    
    new_room_id = "!ijzSURDdRUcidXSfRg:matrix.radx.dev"
    
    async with aiohttp.ClientSession() as session:
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json"
        }
        
        # Check if room is already in monitored_rooms
        logger.info(f"🔍 Checking if room {new_room_id} is in monitored_rooms...")
        async with session.get(
            f"{supabase_url}/rest/v1/monitored_rooms?room_id=eq.{new_room_id}",
            headers=headers
        ) as resp:
            if resp.status == 200:
                existing = await resp.json()
                if existing:
                    logger.info(f"✅ Room {new_room_id} is already monitored")
                    room_data = existing[0]
                    logger.info(f"   - Enabled: {room_data.get('enabled')}")
                    logger.info(f"   - Auto-join: {room_data.get('auto_join')}")
                    logger.info(f"   - Organization ID: {room_data.get('organization_id')}")
                    return
                else:
                    logger.info(f"❌ Room {new_room_id} is NOT in monitored_rooms")
        
        # Get default organization ID
        logger.info("🏢 Getting default organization...")
        async with session.get(
            f"{supabase_url}/rest/v1/organizations?name=eq.Default",
            headers=headers
        ) as resp:
            if resp.status == 200:
                orgs = await resp.json()
                if orgs:
                    default_org_id = orgs[0]['id']
                    logger.info(f"✅ Found default organization ID: {default_org_id}")
                else:
                    logger.error("❌ Default organization not found")
                    return
            else:
                logger.error(f"Failed to get organizations: {resp.status}")
                return
        
        # Add room to monitored_rooms
        logger.info(f"➕ Adding room {new_room_id} to monitored_rooms...")
        room_data = {
            "room_id": new_room_id,
            "enabled": True,
            "organization_id": default_org_id,
            "auto_join": True,
            "archive_media": True
        }
        
        async with session.post(
            f"{supabase_url}/rest/v1/monitored_rooms",
            json=room_data,
            headers=headers
        ) as resp:
            if resp.status in [200, 201]:
                logger.info(f"✅ Successfully added room {new_room_id} to monitored_rooms")
            else:
                error = await resp.text()
                logger.error(f"❌ Failed to add room: {resp.status} - {error}")
                return
        
        # Add room to room_organizations
        logger.info(f"🔗 Adding room-organization relationship...")
        rel_data = {
            "room_id": new_room_id,
            "organization_id": default_org_id
        }
        
        async with session.post(
            f"{supabase_url}/rest/v1/room_organizations",
            json=rel_data,
            headers=headers
        ) as resp:
            if resp.status in [200, 201]:
                logger.info(f"✅ Successfully added room-organization relationship")
            else:
                error = await resp.text()
                logger.error(f"❌ Failed to add relationship: {resp.status} - {error}")
        
        logger.info("🎉 Room setup complete! The archiver should start monitoring this room within 5 minutes.")

if __name__ == "__main__":
    asyncio.run(check_and_add_new_room())