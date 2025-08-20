#!/usr/bin/env python3
"""Debug room monitoring to see why new room isn't being processed."""

import asyncio
import aiohttp
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def debug_room_monitoring():
    """Debug room monitoring to identify the issue."""
    
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
    
    async with aiohttp.ClientSession() as session:
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json"
        }
        
        # Get all monitored rooms
        logger.info("📋 Getting all monitored rooms from database...")
        async with session.get(
            f"{supabase_url}/rest/v1/monitored_rooms?enabled=eq.true",
            headers=headers
        ) as resp:
            if resp.status == 200:
                monitored_rooms = await resp.json()
                logger.info(f"✅ Found {len(monitored_rooms)} enabled monitored rooms:")
                for room in monitored_rooms:
                    room_id = room['room_id']
                    org_id = room.get('organization_id')
                    auto_join = room.get('auto_join')
                    logger.info(f"   - {room_id} (org: {org_id}, auto_join: {auto_join})")
                    
                # Check specifically for the new room
                new_room_id = "!ijzSURDdRUcidXSfRg:matrix.radx.dev"
                new_room = [r for r in monitored_rooms if r['room_id'] == new_room_id]
                if new_room:
                    logger.info(f"✅ New room {new_room_id} IS in monitored_rooms")
                    logger.info(f"   Details: {new_room[0]}")
                else:
                    logger.error(f"❌ New room {new_room_id} is NOT in monitored_rooms")
            else:
                logger.error(f"Failed to get monitored rooms: {resp.status}")
                
        # Check for any recent messages in the new room
        logger.info(f"💬 Checking for messages in new room...")
        new_room_id = "!ijzSURDdRUcidXSfRg:matrix.radx.dev"
        async with session.get(
            f"{supabase_url}/rest/v1/messages?room_id=eq.{new_room_id}&order=timestamp.desc&limit=5",
            headers=headers
        ) as resp:
            if resp.status == 200:
                messages = await resp.json()
                if messages:
                    logger.info(f"✅ Found {len(messages)} messages in new room:")
                    for msg in messages:
                        event_id = msg.get('event_id', 'Unknown')[:20] + '...'
                        room_name = msg.get('room_name', 'No name')
                        sender_name = msg.get('sender_display_name', 'No sender name')
                        logger.info(f"   - {event_id}: {room_name} from {sender_name}")
                else:
                    logger.warning(f"❌ No messages found in new room {new_room_id}")
                    logger.info("This could mean:")
                    logger.info("   1. No messages have been sent to this room yet")
                    logger.info("   2. The archiver isn't monitoring this room")
                    logger.info("   3. There's a sync issue with the archiver")
            else:
                logger.error(f"Failed to query messages: {resp.status}")

if __name__ == "__main__":
    asyncio.run(debug_room_monitoring())