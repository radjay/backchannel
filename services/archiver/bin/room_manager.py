#!/usr/bin/env python3
"""Dynamic room management for Matrix archiver."""

import asyncio
import logging
import aiohttp
from datetime import datetime, timedelta
from typing import Set, Dict, Optional

logger = logging.getLogger(__name__)

class RoomManager:
    """Manages dynamic room joining/leaving based on monitored_rooms table."""
    
    def __init__(self, supabase_url: str, supabase_key: str, matrix_homeserver: str, matrix_token: str, session: aiohttp.ClientSession):
        self.supabase_url = supabase_url
        self.supabase_key = supabase_key
        self.matrix_homeserver = matrix_homeserver
        self.matrix_token = matrix_token
        self.session = session
        
        # Track room states
        self.monitored_rooms: Set[str] = set()
        self.joined_rooms: Set[str] = set()
        self.last_refresh = datetime.min
        self.refresh_interval = timedelta(minutes=5)  # Check every 5 minutes
        
        # Supabase headers
        self.headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json"
        }
    
    async def get_monitored_rooms(self) -> Dict[str, Dict]:
        """Get enabled rooms from monitored_rooms table."""
        try:
            async with self.session.get(
                f"{self.supabase_url}/rest/v1/monitored_rooms?enabled=eq.true&select=*",
                headers=self.headers
            ) as resp:
                if resp.status == 200:
                    rooms_data = await resp.json()
                    rooms_dict = {}
                    for room in rooms_data:
                        rooms_dict[room['room_id']] = {
                            'auto_join': room.get('auto_join', True),
                            'archive_media': room.get('archive_media', True),
                            'room_name': room.get('room_name', 'Unknown'),
                            'enabled': room.get('enabled', True)
                        }
                    logger.debug(f"Retrieved {len(rooms_dict)} monitored rooms from database")
                    return rooms_dict
                else:
                    logger.error(f"Failed to get monitored rooms: {resp.status}")
                    return {}
        except Exception as e:
            logger.error(f"Error getting monitored rooms: {e}")
            return {}
    
    async def get_joined_rooms(self) -> Set[str]:
        """Get currently joined rooms from Matrix."""
        try:
            async with self.session.get(
                f"{self.matrix_homeserver}/_matrix/client/r0/joined_rooms",
                params={"access_token": self.matrix_token}
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    joined = set(data.get("joined_rooms", []))
                    logger.debug(f"Currently joined to {len(joined)} rooms")
                    return joined
                else:
                    logger.error(f"Failed to get joined rooms: {resp.status}")
                    return set()
        except Exception as e:
            logger.error(f"Error getting joined rooms: {e}")
            return set()
    
    async def join_room(self, room_id: str) -> bool:
        """Join a specific room."""
        try:
            async with self.session.post(
                f"{self.matrix_homeserver}/_matrix/client/r0/rooms/{room_id}/join",
                params={"access_token": self.matrix_token},
                json={}
            ) as resp:
                if resp.status in [200, 201]:
                    logger.info(f"✅ Joined room: {room_id}")
                    return True
                elif resp.status == 403:
                    logger.warning(f"⚠ Not invited to room {room_id}, cannot join")
                    return False
                else:
                    error = await resp.text()
                    logger.error(f"❌ Failed to join room {room_id}: {resp.status} - {error}")
                    return False
        except Exception as e:
            logger.error(f"Error joining room {room_id}: {e}")
            return False
    
    async def leave_room(self, room_id: str) -> bool:
        """Leave a specific room."""
        try:
            async with self.session.post(
                f"{self.matrix_homeserver}/_matrix/client/r0/rooms/{room_id}/leave",
                params={"access_token": self.matrix_token},
                json={}
            ) as resp:
                if resp.status in [200, 201]:
                    logger.info(f"✅ Left room: {room_id}")
                    return True
                else:
                    error = await resp.text()
                    logger.error(f"❌ Failed to leave room {room_id}: {resp.status} - {error}")
                    return False
        except Exception as e:
            logger.error(f"Error leaving room {room_id}: {e}")
            return False
    
    async def should_archive_room(self, room_id: str) -> bool:
        """Check if we should archive messages from this room."""
        monitored_rooms = await self.get_monitored_rooms()
        room_config = monitored_rooms.get(room_id, {})
        return room_config.get('enabled', False)
    
    async def should_archive_media(self, room_id: str) -> bool:
        """Check if we should archive media from this room."""
        monitored_rooms = await self.get_monitored_rooms()
        room_config = monitored_rooms.get(room_id, {})
        return room_config.get('archive_media', True) and room_config.get('enabled', False)
    
    async def refresh_room_management(self) -> None:
        """Refresh room management - join new rooms, leave disabled ones."""
        current_time = datetime.now()
        
        # Only refresh if enough time has passed
        if current_time - self.last_refresh < self.refresh_interval:
            return
        
        logger.info("🔄 Refreshing room management...")
        
        try:
            # Get current state
            monitored_rooms = await self.get_monitored_rooms()
            current_joined = await self.get_joined_rooms()
            
            # Rooms we should be in (enabled + auto_join)
            should_join = {
                room_id for room_id, config in monitored_rooms.items() 
                if config.get('auto_join', True) and config.get('enabled', True)
            }
            
            # Join new rooms
            to_join = should_join - current_joined
            for room_id in to_join:
                room_name = monitored_rooms[room_id].get('room_name', 'Unknown')
                logger.info(f"🔗 Attempting to join new monitored room: {room_name} ({room_id})")
                success = await self.join_room(room_id)
                
                # If join failed, try to invite archiver first
                if not success:
                    logger.info(f"🤖 Attempting to auto-invite archiver to {room_name}")
                    await self.invite_archiver_to_room(room_id)
            
            # Leave rooms we shouldn't be in anymore
            monitored_room_ids = set(monitored_rooms.keys())
            to_leave = current_joined - monitored_room_ids
            
            # Only leave if the room is not in monitored list at all
            # (Don't leave just because auto_join is false)
            for room_id in to_leave:
                # Double-check this room isn't in our monitored list
                if room_id not in monitored_room_ids:
                    logger.info(f"🚪 Leaving unmonitored room: {room_id}")
                    await self.leave_room(room_id)
            
            # Update tracking
            self.monitored_rooms = set(monitored_rooms.keys())
            self.joined_rooms = current_joined
            self.last_refresh = current_time
            
            logger.info(f"✅ Room management refresh complete:")
            logger.info(f"   - Monitoring: {len(self.monitored_rooms)} rooms")
            logger.info(f"   - Joined: {len(current_joined)} rooms")
            logger.info(f"   - Should join: {len(should_join)} rooms")
            
        except Exception as e:
            logger.error(f"❌ Error during room management refresh: {e}")
    
    async def handle_invitation(self, room_id: str) -> bool:
        """Handle room invitation based on monitored_rooms policy."""
        logger.info(f"📨 Received invitation to room: {room_id}")
        
        # Check if this room is in our monitored list
        monitored_rooms = await self.get_monitored_rooms()
        
        if room_id in monitored_rooms:
            room_config = monitored_rooms[room_id]
            if room_config.get('auto_join', True) and room_config.get('enabled', True):
                logger.info(f"✅ Auto-accepting invitation (room is monitored): {room_id}")
                return await self.join_room(room_id)
            else:
                logger.info(f"⚠ Declining invitation (auto_join disabled): {room_id}")
                return False
        else:
            # For now, auto-accept unmonitored invitations and add them to monitoring
            logger.info(f"🤖 Auto-accepting invitation to unmonitored room: {room_id}")
            success = await self.join_room(room_id)
            
            if success:
                # Add to monitored_rooms table
                await self.add_room_to_monitoring(room_id)
            
            return success
    
    async def get_admin_token(self) -> str:
        """Get admin token by logging in with admin credentials."""
        try:
            import os
            admin_username = os.getenv('MATRIX_ADMIN_USERNAME')
            admin_password = os.getenv('MATRIX_ADMIN_PASSWORD')
            
            if not admin_username or not admin_password:
                logger.debug("No admin credentials set in environment variables")
                return None
            
            # Add domain if not provided
            if ':' not in admin_username:
                admin_user_id = f"@{admin_username}:matrix.radx.dev"
            else:
                admin_user_id = admin_username
            
            login_data = {
                "type": "m.login.password",
                "user": admin_user_id,
                "password": admin_password
            }
            
            async with self.session.post(
                f"{self.matrix_homeserver}/_matrix/client/r0/login",
                json=login_data
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    token = data["access_token"]
                    logger.debug(f"✅ Successfully logged in as admin {admin_user_id}")
                    return token
                else:
                    error = await resp.text()
                    logger.warning(f"Admin login failed: {resp.status} - {error}")
                    return None
                    
        except Exception as e:
            logger.warning(f"Error getting admin token: {e}")
            return None

    async def invite_archiver_to_room(self, room_id: str) -> bool:
        """Invite the archiver to a room using admin privileges."""
        try:
            admin_token = await self.get_admin_token()
            
            if not admin_token:
                logger.warning("No admin token available, cannot auto-invite archiver")
                return False
            
            archiver_user_id = "@archiver:matrix.radx.dev"
            invite_data = {"user_id": archiver_user_id}
            
            async with self.session.post(
                f"{self.matrix_homeserver}/_matrix/client/r0/rooms/{room_id}/invite",
                params={"access_token": admin_token},
                json=invite_data
            ) as resp:
                if resp.status in [200, 201]:
                    logger.info(f"✅ Successfully invited archiver to room {room_id}")
                    return True
                elif resp.status == 400:
                    error_data = await resp.json()
                    if error_data.get("errcode") == "M_FORBIDDEN":
                        logger.info(f"ℹ️ Archiver already in room {room_id}")
                        return True
                    else:
                        logger.warning(f"⚠ Failed to invite archiver: {error_data}")
                        return False
                else:
                    error = await resp.text()
                    logger.warning(f"⚠ Could not invite archiver to {room_id}: {resp.status} - {error}")
                    return False
                    
        except Exception as e:
            logger.warning(f"Error inviting archiver to room {room_id}: {e}")
            return False

    async def add_room_to_monitoring(self, room_id: str) -> bool:
        """Add a new room to the monitored_rooms table and invite archiver."""
        try:
            # Create a friendly name from room ID
            room_name = f"Room {room_id.split(':')[0][-8:]}"
            
            room_data = {
                "room_id": room_id,
                "room_name": room_name,
                "enabled": True,
                "auto_join": True,
                "archive_media": True
            }
            
            async with self.session.post(
                f"{self.supabase_url}/rest/v1/monitored_rooms",
                json=room_data,
                headers=self.headers
            ) as resp:
                if resp.status in [200, 201]:
                    logger.info(f"✅ Added room {room_name} to monitored_rooms")
                    
                    # Try to invite archiver to the room
                    await self.invite_archiver_to_room(room_id)
                    
                    return True
                elif resp.status == 409:
                    logger.debug(f"Room {room_id} already in monitored_rooms")
                    return True
                else:
                    error = await resp.text()
                    logger.error(f"❌ Failed to add room to monitoring: {resp.status} - {error}")
                    return False
                    
        except Exception as e:
            logger.error(f"Error adding room to monitoring: {e}")
            return False