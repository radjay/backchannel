#!/usr/bin/env python3
"""Auto-invite archiver by joining room as admin first, then inviting."""

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

async def auto_invite_archiver_to_room(room_id: str):
    """Join room as admin, then invite archiver."""
    
    matrix_homeserver = "http://localhost:8008"
    archiver_user_id = "@archiver:matrix.radx.dev"
    
    # Get admin token
    admin_token = await get_admin_token()
    if not admin_token:
        return False
    
    async with aiohttp.ClientSession() as session:
        
        # Step 1: Join the room as admin (if not already joined)
        logger.info(f"🔗 Admin joining room {room_id}...")
        async with session.post(
            f"{matrix_homeserver}/_matrix/client/r0/rooms/{room_id}/join",
            params={"access_token": admin_token},
            json={}
        ) as resp:
            if resp.status in [200, 201]:
                logger.info(f"✅ Admin successfully joined room {room_id}")
            elif resp.status == 400:
                error_data = await resp.json()
                if error_data.get("errcode") == "M_FORBIDDEN":
                    logger.info(f"ℹ️ Admin already in room {room_id}")
                else:
                    logger.error(f"❌ Failed to join room: {error_data}")
                    return False
            elif resp.status == 403:
                error_data = await resp.json()
                logger.error(f"❌ Admin forbidden from joining room: {error_data}")
                logger.error("   Admin may need to be invited to this room first")
                return False
            else:
                error = await resp.text()
                logger.error(f"❌ Admin failed to join room: {resp.status} - {error}")
                return False
        
        # Step 2: Invite archiver to the room
        logger.info(f"📨 Inviting {archiver_user_id} to room...")
        invite_data = {"user_id": archiver_user_id}
        
        async with session.post(
            f"{matrix_homeserver}/_matrix/client/r0/rooms/{room_id}/invite",
            params={"access_token": admin_token},
            json=invite_data
        ) as resp:
            if resp.status in [200, 201]:
                logger.info(f"✅ Successfully invited {archiver_user_id} to room {room_id}")
                logger.info(f"🎯 Archiver should auto-join within 30 seconds!")
                return True
            elif resp.status == 400:
                error_data = await resp.json()
                if error_data.get("errcode") == "M_FORBIDDEN":
                    logger.info(f"ℹ️ {archiver_user_id} is already in room {room_id}")
                    return True
                else:
                    logger.error(f"❌ Failed to invite: {error_data}")
                    return False
            else:
                error = await resp.text()
                logger.error(f"❌ Failed to invite archiver: {resp.status} - {error}")
                return False

async def main():
    """Main entry point."""
    if len(sys.argv) != 2:
        print("Usage: python3 auto_invite_archiver.py <room_id>")
        print("Example: python3 auto_invite_archiver.py !ydSVQamOPRMjcfASkZ:matrix.radx.dev")
        sys.exit(1)
    
    room_id = sys.argv[1]
    
    logger.info(f"🚀 Auto-inviting archiver to room: {room_id}")
    success = await auto_invite_archiver_to_room(room_id)
    
    if success:
        logger.info("🎉 Invitation process completed successfully!")
        sys.exit(0)
    else:
        logger.error("❌ Invitation process failed")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())