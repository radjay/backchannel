#!/usr/bin/env python3
"""Test script to verify human-readable names are working in the archiver."""

import asyncio
import aiohttp
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_human_readable_names():
    """Test that human-readable names are being stored correctly."""
    
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
        
        # Test 1: Check if human-readable name columns exist
        logger.info("🔍 Testing database schema...")
        async with session.get(
            f"{supabase_url}/rest/v1/messages?limit=1",
            headers=headers
        ) as resp:
            if resp.status == 200:
                data = await resp.json()
                if data:
                    message = data[0]
                    has_room_name = 'room_name' in message
                    has_room_display_name = 'room_display_name' in message
                    has_sender_display_name = 'sender_display_name' in message
                    
                    logger.info(f"✅ Schema check: room_name={has_room_name}, room_display_name={has_room_display_name}, sender_display_name={has_sender_display_name}")
                    
                    if has_room_name and has_room_display_name and has_sender_display_name:
                        logger.info("✅ All human-readable name columns exist!")
                    else:
                        logger.warning("⚠️ Some human-readable name columns are missing")
                else:
                    logger.info("📝 No messages in database yet")
            else:
                logger.error(f"Failed to query messages: {resp.status}")
        
        # Test 2: Check organizations system
        logger.info("🏢 Testing organizations system...")
        async with session.get(
            f"{supabase_url}/rest/v1/organizations",
            headers=headers
        ) as resp:
            if resp.status == 200:
                orgs = await resp.json()
                logger.info(f"✅ Found {len(orgs)} organizations:")
                for org in orgs:
                    logger.info(f"   - {org['name']}: {org.get('description', 'No description')}")
            else:
                logger.error(f"Failed to query organizations: {resp.status}")
        
        # Test 3: Check monitored_rooms enhancements
        logger.info("📋 Testing monitored_rooms enhancements...")
        async with session.get(
            f"{supabase_url}/rest/v1/monitored_rooms",
            headers=headers
        ) as resp:
            if resp.status == 200:
                rooms = await resp.json()
                logger.info(f"✅ Found {len(rooms)} monitored rooms:")
                for room in rooms:
                    room_id = room['room_id']
                    org_id = room.get('organization_id', 'None')
                    auto_join = room.get('auto_join', 'None')
                    archive_media = room.get('archive_media', 'None')
                    logger.info(f"   - {room_id[:20]}... org_id={org_id}, auto_join={auto_join}, archive_media={archive_media}")
            else:
                logger.error(f"Failed to query monitored_rooms: {resp.status}")
        
        # Test 4: Check room_organizations relationships
        logger.info("🔗 Testing room-organization relationships...")
        async with session.get(
            f"{supabase_url}/rest/v1/room_organizations",
            headers=headers
        ) as resp:
            if resp.status == 200:
                relationships = await resp.json()
                logger.info(f"✅ Found {len(relationships)} room-organization relationships")
                for rel in relationships:
                    room_id = rel['room_id']
                    org_id = rel['organization_id']
                    logger.info(f"   - Room {room_id[:20]}... → Organization {org_id}")
            else:
                logger.error(f"Failed to query room_organizations: {resp.status}")
        
        # Test 5: Check recent messages with human-readable names
        logger.info("💬 Testing recent messages with human-readable names...")
        async with session.get(
            f"{supabase_url}/rest/v1/messages?order=timestamp.desc&limit=5",
            headers=headers
        ) as resp:
            if resp.status == 200:
                messages = await resp.json()
                if messages:
                    logger.info(f"✅ Found {len(messages)} recent messages:")
                    for msg in messages:
                        event_id = msg.get('event_id', 'Unknown')[:20] + '...'
                        room_name = msg.get('room_name', 'No room name')
                        room_display_name = msg.get('room_display_name', 'No room display name')
                        sender_display_name = msg.get('sender_display_name', 'No sender display name')
                        
                        logger.info(f"   - Event: {event_id}")
                        logger.info(f"     Room: {room_name} | Display: {room_display_name}")
                        logger.info(f"     Sender: {sender_display_name}")
                else:
                    logger.info("📝 No messages found")
            else:
                logger.error(f"Failed to query recent messages: {resp.status}")

if __name__ == "__main__":
    asyncio.run(test_human_readable_names())