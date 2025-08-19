#!/usr/bin/env python3
"""Use Matrix admin API to force-join archiver to rooms."""

import asyncio
import aiohttp
import logging
import os
import sys

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def get_admin_token():
    """Get admin token from environment credentials."""
    admin_username = os.getenv('MATRIX_ADMIN_USERNAME')
    admin_password = os.getenv('MATRIX_ADMIN_PASSWORD')
    
    if not admin_username or not admin_password:
        logger.error("MATRIX_ADMIN_USERNAME and MATRIX_ADMIN_PASSWORD environment variables required")
        return None
    
    # Add domain if not provided
    if ':' not in admin_username:
        admin_user_id = f"@{admin_username}:matrix.radx.dev"
    else:
        admin_user_id = admin_username
    
    matrix_homeserver = "http://localhost:8008"
    login_data = {
        "type": "m.login.password",
        "user": admin_user_id,
        "password": admin_password
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{matrix_homeserver}/_matrix/client/r0/login",
                json=login_data
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    token = data["access_token"]
                    logger.info(f"✅ Successfully logged in as admin {admin_user_id}")
                    return token
                else:
                    error = await resp.text()
                    logger.error(f"Admin login failed: {resp.status} - {error}")
                    return None
                    
    except Exception as e:
        logger.error(f"Error getting admin token: {e}")
        return None

async def admin_force_join_room(room_id: str, user_id: str, admin_token: str):
    """Use admin API to force a user to join a room."""
    
    matrix_homeserver = "http://localhost:8008"
    
    # Admin API endpoint to force join a user to a room
    # POST /_synapse/admin/v1/join/<room_id>
    join_data = {
        "user_id": user_id
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{matrix_homeserver}/_synapse/admin/v1/join/{room_id}",
            params={"access_token": admin_token},
            json=join_data
        ) as resp:
            if resp.status in [200, 201]:
                logger.info(f"✅ Successfully force-joined {user_id} to room {room_id}")
                return True
            elif resp.status == 403:
                error_data = await resp.json()
                logger.error(f"❌ Admin API access denied: {error_data}")
                logger.error("   Admin user may not have sufficient privileges")
                return False
            elif resp.status == 404:
                error_data = await resp.json()
                logger.error(f"❌ Room or admin API not found: {error_data}")
                logger.error("   Admin APIs may not be enabled on this server")
                return False
            else:
                error = await resp.text()
                logger.error(f"❌ Admin API call failed: {resp.status} - {error}")
                return False

async def admin_invite_archiver_to_room(room_id: str):
    """Use admin API to force archiver to join room."""
    
    archiver_user_id = "@archiver:matrix.radx.dev"
    
    # Get admin token
    admin_token = await get_admin_token()
    if not admin_token:
        return False
    
    logger.info(f"🚀 Using admin API to force-join archiver to room: {room_id}")
    
    # Try admin API force join
    success = await admin_force_join_room(room_id, archiver_user_id, admin_token)
    
    if success:
        logger.info(f"🎉 Archiver successfully joined room {room_id} via admin API!")
        logger.info(f"🎯 Archiver should start monitoring this room within 5 minutes")
        return True
    else:
        logger.warning("⚠ Admin API approach failed, trying fallback method...")
        
        # Fallback: Try to make admin join first, then invite
        # This requires the admin to have join permissions
        matrix_homeserver = "http://localhost:8008"
        
        async with aiohttp.ClientSession() as session:
            # Try to join as admin via admin API
            admin_join_success = await admin_force_join_room(room_id, f"@{os.getenv('MATRIX_ADMIN_USERNAME')}:matrix.radx.dev", admin_token)
            
            if admin_join_success:
                logger.info("✅ Admin joined room via admin API, now inviting archiver...")
                
                # Now invite archiver normally
                invite_data = {"user_id": archiver_user_id}
                async with session.post(
                    f"{matrix_homeserver}/_matrix/client/r0/rooms/{room_id}/invite",
                    params={"access_token": admin_token},
                    json=invite_data
                ) as resp:
                    if resp.status in [200, 201]:
                        logger.info(f"✅ Successfully invited {archiver_user_id} to room via fallback method")
                        return True
                    else:
                        error = await resp.text()
                        logger.error(f"❌ Fallback invitation failed: {resp.status} - {error}")
                        return False
            else:
                logger.error("❌ All methods failed to get archiver into the room")
                return False

async def admin_invite_to_all_monitored_rooms():
    """Use admin API to force archiver into all monitored rooms."""
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not all([supabase_url, supabase_key]):
        logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
        return False
    
    try:
        async with aiohttp.ClientSession() as session:
            # Get all monitored rooms
            headers = {
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json"
            }
            
            async with session.get(
                f"{supabase_url}/rest/v1/monitored_rooms?enabled=eq.true&auto_join=eq.true",
                headers=headers
            ) as resp:
                if resp.status == 200:
                    monitored_rooms = await resp.json()
                    logger.info(f"Found {len(monitored_rooms)} monitored rooms to process")
                else:
                    logger.error(f"Failed to get monitored rooms: {resp.status}")
                    return False
            
            # Process each room
            success_count = 0
            for room in monitored_rooms:
                room_id = room['room_id']
                room_name = room.get('room_name', 'Unknown')
                
                logger.info(f"📍 Processing room: {room_name} ({room_id})")
                success = await admin_invite_archiver_to_room(room_id)
                if success:
                    success_count += 1
            
            logger.info(f"🎉 Admin API process complete: {success_count}/{len(monitored_rooms)} rooms processed successfully")
            return success_count == len(monitored_rooms)
            
    except Exception as e:
        logger.error(f"❌ Error in admin API bulk process: {e}")
        return False

async def main():
    """Main entry point."""
    if len(sys.argv) == 2:
        # Process specific room
        room_id = sys.argv[1]
        logger.info(f"Processing specific room: {room_id}")
        success = await admin_invite_archiver_to_room(room_id)
        sys.exit(0 if success else 1)
    else:
        # Process all monitored rooms
        logger.info("Processing all monitored rooms via admin API...")
        success = await admin_invite_to_all_monitored_rooms()
        sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())