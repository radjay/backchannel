#!/usr/bin/env python3
"""Simple Matrix to Supabase archiver without complex dependencies."""

import asyncio
import json
import logging
import sys
import traceback
from pathlib import Path

# Use basic imports that work
import aiohttp
import yaml
import os

# Set up basic logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class UnifiedArchiver:
    """Unified Matrix to Supabase archiver with dynamic room management."""
    
    def __init__(self):
        self.matrix_token = None
        self.matrix_homeserver = "http://localhost:8008"
        self.supabase_url = None
        self.supabase_key = None
        self.session = None
        self.managed_rooms = set()  # Rooms we're currently monitoring
        self.room_refresh_interval = 300  # 5 minutes
        self.last_room_refresh = 0
        
    async def initialize(self):
        """Initialize the archiver."""
        # Load config
        try:
            config_path = "/home/matrix-ai/config/archiver/config.yaml"
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
            
            logger.info("Config loaded successfully")
            
            # Get environment variables
            self.matrix_password = os.getenv('MATRIX_PASSWORD', 'HnvtFkgDZjF4')
            self.supabase_url = os.getenv('SUPABASE_URL', '')
            self.supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
            
            # Debug output
            logger.info(f"Matrix password loaded: {bool(self.matrix_password)}")
            logger.info(f"Supabase URL loaded: {bool(self.supabase_url)} - {self.supabase_url[:30]}..." if self.supabase_url else "Supabase URL: EMPTY")
            logger.info(f"Supabase key loaded: {bool(self.supabase_key)} - {len(self.supabase_key)} chars" if self.supabase_key else "Supabase key: EMPTY")
            
            if not self.supabase_url or not self.supabase_key:
                logger.error("Missing Supabase credentials in environment variables")
                logger.error(f"URL empty: {not self.supabase_url}, Key empty: {not self.supabase_key}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
            return False
        
        # Create HTTP session
        self.session = aiohttp.ClientSession()
        
        # Login to Matrix
        success = await self.matrix_login()
        if not success:
            return False
        
        # Initialize room management
        await self.refresh_room_management()
            
        logger.info("Unified archiver initialized successfully")
        return True
    
    async def matrix_login(self):
        """Login to Matrix and get access token."""
        try:
            login_data = {
                "type": "m.login.password",
                "user": "@archiver:matrix.radx.dev",
                "password": self.matrix_password
            }
            
            async with self.session.post(
                f"{self.matrix_homeserver}/_matrix/client/r0/login",
                json=login_data
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    self.matrix_token = data["access_token"]
                    logger.info("Matrix login successful")
                    return True
                elif resp.status == 429:
                    error_data = await resp.json()
                    retry_after = error_data.get("retry_after_ms", 60000) / 1000
                    logger.warning(f"Rate limited, waiting {retry_after} seconds...")
                    await asyncio.sleep(retry_after)
                    return await self.matrix_login()  # Retry after waiting
                else:
                    error = await resp.text()
                    logger.error(f"Matrix login failed: {resp.status} - {error}")
                    return False
                    
        except Exception as e:
            logger.error(f"Matrix login error: {e}")
            return False
    
    async def resolve_room_name(self, room_id: str) -> tuple[str, str]:
        """Returns (room_name, display_name) from Matrix room state."""
        try:
            async with self.session.get(
                f"{self.matrix_homeserver}/_matrix/client/r0/rooms/{room_id}/state/m.room.name",
                params={"access_token": self.matrix_token}
            ) as resp:
                room_name = ""
                if resp.status == 200:
                    data = await resp.json()
                    room_name = data.get("name", "")
                    
            # Get canonical alias as fallback display name
            async with self.session.get(
                f"{self.matrix_homeserver}/_matrix/client/r0/rooms/{room_id}/state/m.room.canonical_alias",
                params={"access_token": self.matrix_token}
            ) as resp:
                display_name = room_name  # Use room name as default
                if resp.status == 200:
                    data = await resp.json()
                    alias = data.get("alias", "")
                    if alias and not room_name:
                        display_name = alias
                        
            return (room_name or "", display_name or room_id)
            
        except Exception as e:
            logger.warning(f"Failed to resolve room name for {room_id}: {e}")
            return ("", room_id)
    
    async def resolve_user_display_name(self, user_id: str, room_id: str) -> str:
        """Returns user's display name in the context of a room."""
        try:
            # Try to get room-specific display name first
            async with self.session.get(
                f"{self.matrix_homeserver}/_matrix/client/r0/rooms/{room_id}/state/m.room.member/{user_id}",
                params={"access_token": self.matrix_token}
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    display_name = data.get("displayname", "")
                    if display_name:
                        return display_name
                        
            # Fallback to global profile
            async with self.session.get(
                f"{self.matrix_homeserver}/_matrix/client/r0/profile/{user_id}/displayname",
                params={"access_token": self.matrix_token}
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    display_name = data.get("displayname", "")
                    if display_name:
                        return display_name
                        
            # Final fallback to user ID
            return user_id
            
        except Exception as e:
            logger.warning(f"Failed to resolve display name for {user_id}: {e}")
            return user_id

    async def archive_message(self, event_data):
        """Archive a message to Supabase."""
        try:
            room_id = event_data.get("room_id")
            sender = event_data.get("sender")
            
            # Resolve human-readable names
            room_name, room_display_name = await self.resolve_room_name(room_id)
            sender_display_name = await self.resolve_user_display_name(sender, room_id)
            
            # Prepare message data with human-readable names
            message_data = {
                "event_id": event_data.get("event_id"),
                "room_id": room_id,
                "room_name": room_name,
                "room_display_name": room_display_name,
                "sender": sender,
                "sender_display_name": sender_display_name,
                "timestamp": event_data.get("origin_server_ts"),
                "message_type": event_data.get("type"),
                "content": event_data.get("content", {})
            }
            
            # Insert to Supabase
            headers = {
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}",
                "Content-Type": "application/json"
            }
            
            async with self.session.post(
                f"{self.supabase_url}/rest/v1/messages",
                json=message_data,
                headers=headers
            ) as resp:
                if resp.status in [200, 201]:
                    logger.info(f"Archived message {message_data['event_id']}")
                    
                    # Check if message contains media and archive it
                    await self.archive_media_if_present(event_data)
                    
                    return True
                elif resp.status == 409:
                    # Message already exists, still check for media
                    logger.debug(f"Message {message_data['event_id']} already archived, checking for media")
                    await self.archive_media_if_present(event_data)
                    return True
                else:
                    error = await resp.text()
                    logger.error(f"Failed to archive message: {resp.status} - {error}")
                    return False
                    
        except Exception as e:
            logger.error(f"Error archiving message: {e}")
            return False
    
    async def archive_media_if_present(self, event_data):
        """Check if message contains media and archive it."""
        try:
            content = event_data.get("content", {})
            msgtype = content.get("msgtype")
            mxc_url = content.get("url")
            
            # Check if this is a media message with MXC URL
            if mxc_url and mxc_url.startswith("mxc://") and msgtype in ["m.image", "m.video", "m.audio", "m.file"]:
                logger.info(f"Found media in message {event_data.get('event_id')}: {msgtype} - {mxc_url}")
                
                # Download media from Matrix
                media_data = await self.download_matrix_media(mxc_url)
                storage_path = None
                
                if media_data:
                    # Upload to Supabase Storage
                    storage_path = await self.upload_to_supabase_storage(
                        media_data, 
                        event_data.get("event_id"), 
                        content.get("body", "unknown"),
                        content.get("info", {}).get("mimetype", "application/octet-stream")
                    )
                    if storage_path:
                        logger.info(f"Successfully archived media for {event_data.get('event_id')}")
                    else:
                        logger.warning(f"Failed to upload media for {event_data.get('event_id')}")
                else:
                    logger.warning(f"Media file not available for {event_data.get('event_id')}, saving metadata only")
                
                # Save media metadata (even if file download failed)
                await self.save_media_metadata(event_data, storage_path, content)
                
                return True
                
        except Exception as e:
            logger.error(f"Error archiving media: {e}")
            return False
    
    async def download_matrix_media(self, mxc_url):
        """Download media from Matrix homeserver."""
        try:
            # Convert mxc://server/media_id to HTTP URL
            if not mxc_url.startswith("mxc://"):
                return None
                
            # Extract server and media_id from mxc://server/media_id
            mxc_parts = mxc_url[6:].split("/", 1)  # Remove "mxc://" prefix
            if len(mxc_parts) != 2:
                return None
                
            server_name, media_id = mxc_parts
            
            # Check if this is a WhatsApp bridge media with direct_media (very long encoded media_id)
            # Note: Since we disabled direct_media, new media should have normal IDs
            if len(media_id) > 100:  # Only skip extremely long direct_media IDs
                logger.info(f"Detected WhatsApp bridge direct_media: {media_id[:50]}...")
                logger.info("WhatsApp bridge direct_media requires federation access - skipping file download")
                return None
            
            download_url = f"{self.matrix_homeserver}/_matrix/client/v1/media/download/{server_name}/{media_id}"
            
            logger.info(f"Downloading media from: {download_url}")
            
            # Retry logic for media downloads (bridge uploads might take a moment)
            headers = {
                "Authorization": f"Bearer {self.matrix_token}"
            }
            
            for attempt in range(3):
                try:
                    async with self.session.get(download_url, headers=headers) as resp:
                        if resp.status == 200:
                            media_data = await resp.read()
                            logger.info(f"Downloaded {len(media_data)} bytes on attempt {attempt + 1}")
                            return media_data
                        elif resp.status == 404 and attempt < 2:
                            logger.warning(f"Media not found on attempt {attempt + 1}, retrying in 2 seconds...")
                            import asyncio
                            await asyncio.sleep(2)
                            continue
                        else:
                            logger.error(f"Failed to download media: {resp.status}")
                            return None
                except Exception as e:
                    if attempt < 2:
                        logger.warning(f"Download error on attempt {attempt + 1}: {e}, retrying...")
                        import asyncio
                        await asyncio.sleep(1)
                        continue
                    else:
                        logger.error(f"Download failed after all attempts: {e}")
                        return None
            
            return None
                    
        except Exception as e:
            logger.error(f"Error downloading media: {e}")
            return None
    
    async def upload_to_supabase_storage(self, media_data, event_id, filename, mimetype):
        """Upload media to Supabase Storage."""
        try:
            # Generate storage path: event_id/filename (directly in bucket root)
            import os
            file_ext = os.path.splitext(filename)[1] or ".bin"
            storage_path = f"{event_id}{file_ext}"
            
            headers = {
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}",
                "Content-Type": mimetype,
                "x-upsert": "true"
            }
            
            upload_url = f"{self.supabase_url}/storage/v1/object/matrix-media/{storage_path}"
            
            logger.info(f"Uploading to URL: {upload_url}")
            
            async with self.session.post(upload_url, data=media_data, headers=headers) as resp:
                response_text = await resp.text()
                if resp.status in [200, 201]:
                    logger.info(f"Uploaded media to Supabase: {storage_path}")
                    return storage_path
                else:
                    logger.error(f"Failed to upload media: {resp.status}")
                    logger.error(f"Response headers: {dict(resp.headers)}")
                    logger.error(f"Response body: {response_text}")
                    logger.error(f"Upload URL: {upload_url}")
                    logger.error(f"Media size: {len(media_data)} bytes")
                    return None
                    
        except Exception as e:
            logger.error(f"Error uploading media: {e}")
            return None
    
    async def save_media_metadata(self, event_data, storage_path, content):
        """Save media metadata to archived_media table."""
        try:
            info = content.get("info", {})
            
            media_data = {
                "event_id": event_data.get("event_id"),
                "media_type": content.get("msgtype", "m.file"),
                "original_filename": content.get("body", "unknown"),
                "file_size": info.get("size"),
                "mime_type": info.get("mimetype", "application/octet-stream"),
                "matrix_url": content.get("url"),
                "storage_path": storage_path or "",
                "public_url": f"{self.supabase_url}/storage/v1/object/public/matrix-media/{storage_path}" if storage_path else ""
            }
            
            headers = {
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}",
                "Content-Type": "application/json"
            }
            
            # Check if media metadata already exists first
            async with self.session.get(
                f"{self.supabase_url}/rest/v1/media?event_id=eq.{event_data.get('event_id')}",
                headers=headers
            ) as check_resp:
                if check_resp.status == 200:
                    existing = await check_resp.json()
                    if existing:
                        logger.debug(f"Media metadata for {event_data.get('event_id')} already exists, skipping")
                        return True
            
            async with self.session.post(
                f"{self.supabase_url}/rest/v1/media",
                json=media_data,
                headers=headers
            ) as resp:
                if resp.status in [200, 201]:
                    logger.info(f"Saved media metadata for {event_data.get('event_id')}")
                    return True
                elif resp.status == 409:
                    logger.debug(f"Media metadata for {event_data.get('event_id')} already exists")
                    return True
                else:
                    error = await resp.text()
                    logger.error(f"Failed to save media metadata: {resp.status} - {error}")
                    return False
                    
        except Exception as e:
            logger.error(f"Error saving media metadata: {e}")
            return False
    
    async def accept_room_invitation(self, room_id):
        """Accept an invitation to a room."""
        try:
            async with self.session.post(
                f"{self.matrix_homeserver}/_matrix/client/r0/rooms/{room_id}/join",
                params={"access_token": self.matrix_token},
                json={}
            ) as resp:
                if resp.status in [200, 201]:
                    logger.info(f"✓ Successfully joined room: {room_id}")
                    return True
                else:
                    error = await resp.text()
                    logger.error(f"Failed to join room {room_id}: {resp.status} - {error}")
                    return False
                    
        except Exception as e:
            logger.error(f"Error accepting invitation for {room_id}: {e}")
            return False
    
    async def refresh_room_management(self):
        """Refresh room management - get monitored rooms from database."""
        try:
            import time
            current_time = time.time()
            
            # Only refresh if enough time has passed
            if current_time - self.last_room_refresh < self.room_refresh_interval:
                return
            
            headers = {
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}",
                "Content-Type": "application/json"
            }
            
            # Get enabled rooms from database
            async with self.session.get(
                f"{self.supabase_url}/rest/v1/monitored_rooms?enabled=eq.true",
                headers=headers
            ) as resp:
                if resp.status == 200:
                    monitored_rooms = await resp.json()
                    new_room_set = {room['room_id'] for room in monitored_rooms}
                    
                    # Join any new rooms
                    new_rooms = new_room_set - self.managed_rooms
                    for room_id in new_rooms:
                        logger.info(f"🔗 Attempting to join new monitored room: {room_id}")
                        await self.join_room_if_possible(room_id)
                    
                    # Leave rooms that are no longer monitored
                    removed_rooms = self.managed_rooms - new_room_set
                    for room_id in removed_rooms:
                        logger.info(f"🚪 Leaving no-longer-monitored room: {room_id}")
                        await self.leave_room(room_id)
                    
                    self.managed_rooms = new_room_set
                    self.last_room_refresh = current_time
                    
                    logger.info(f"📊 Room management refreshed: {len(self.managed_rooms)} rooms monitored")
                else:
                    logger.error(f"Failed to get monitored rooms: {resp.status}")
                    
        except Exception as e:
            logger.error(f"Error refreshing room management: {e}")
    
    async def join_room_if_possible(self, room_id):
        """Try to join a room if we're not already in it."""
        try:
            async with self.session.post(
                f"{self.matrix_homeserver}/_matrix/client/r0/rooms/{room_id}/join",
                params={"access_token": self.matrix_token},
                json={}
            ) as resp:
                if resp.status in [200, 201]:
                    logger.info(f"✅ Successfully joined room: {room_id}")
                    return True
                elif resp.status == 403:
                    # We're not invited - this is expected for private rooms
                    logger.info(f"📝 Room {room_id} requires invitation (private room)")
                    logger.info(f"   💡 Tip: Use 'python3 auto_invite_archiver.py {room_id}' to invite archiver")
                    return False
                else:
                    error = await resp.text()
                    logger.warning(f"Failed to join room {room_id}: {resp.status} - {error}")
                    return False
        except Exception as e:
            logger.error(f"Error joining room {room_id}: {e}")
            return False
    
    async def leave_room(self, room_id):
        """Leave a room."""
        try:
            async with self.session.post(
                f"{self.matrix_homeserver}/_matrix/client/r0/rooms/{room_id}/leave",
                params={"access_token": self.matrix_token},
                json={}
            ) as resp:
                if resp.status in [200, 201]:
                    logger.info(f"✅ Successfully left room: {room_id}")
                    return True
                else:
                    error = await resp.text()
                    logger.warning(f"Failed to leave room {room_id}: {resp.status} - {error}")
                    return False
        except Exception as e:
            logger.error(f"Error leaving room {room_id}: {e}")
            return False
    
    async def sync_loop(self):
        """Main sync loop to get Matrix events."""
        next_batch = ""
        
        while True:
            try:
                # Refresh room management periodically
                await self.refresh_room_management()
                # Sync with Matrix
                params = {
                    "access_token": self.matrix_token,
                    "timeout": 30000
                }
                if next_batch:
                    params["since"] = next_batch
                
                async with self.session.get(
                    f"{self.matrix_homeserver}/_matrix/client/r0/sync",
                    params=params
                ) as resp:
                    if resp.status == 200:
                        sync_data = await resp.json()
                        next_batch = sync_data.get("next_batch", "")
                        
                        # Process invited rooms first (auto-accept)
                        invited_rooms = sync_data.get("rooms", {}).get("invite", {})
                        if invited_rooms:
                            for room_id in invited_rooms.keys():
                                logger.info(f"Auto-accepting invitation to room: {room_id}")
                                await self.accept_room_invitation(room_id)
                        
                        # Process room events (only for monitored rooms)
                        rooms = sync_data.get("rooms", {}).get("join", {})
                        logger.info(f"Processing sync response with {len(rooms)} rooms")
                        
                        for room_id, room_data in rooms.items():
                            # Only process events from monitored rooms
                            if room_id not in self.managed_rooms:
                                logger.debug(f"Skipping unmonitored room: {room_id}")
                                continue
                            timeline = room_data.get("timeline", {})
                            events = timeline.get("events", [])
                            logger.info(f"Room {room_id}: {len(events)} events")
                            
                            for event in events:
                                event_type = event.get("type")
                                if event_type == "m.room.message":
                                    logger.info(f"Found message event in {room_id}: {event.get('event_id')}")
                                    # Add room_id to event data since it's not included in individual events
                                    event["room_id"] = room_id
                                    await self.archive_message(event)
                                else:
                                    logger.debug(f"Skipping event type: {event_type}")
                    else:
                        error = await resp.text()
                        logger.error(f"Sync failed: {resp.status} - {error}")
                        await asyncio.sleep(10)  # Wait before retry
                        
            except Exception as e:
                logger.error(f"Sync error: {e}")
                await asyncio.sleep(10)  # Wait before retry
    
    async def run(self):
        """Run the unified archiver."""
        logger.info("Starting Unified Matrix Archiver with Dynamic Room Management")
        
        if not await self.initialize():
            logger.error("Failed to initialize unified archiver")
            return
            
        try:
            await self.sync_loop()
        except KeyboardInterrupt:
            logger.info("Shutting down...")
        finally:
            if self.session:
                await self.session.close()

async def main():
    """Main entry point."""
    archiver = UnifiedArchiver()
    await archiver.run()

if __name__ == "__main__":
    asyncio.run(main())