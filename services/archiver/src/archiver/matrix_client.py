"""Matrix client for monitoring rooms and syncing messages."""

import asyncio
import logging
from typing import Dict, List, Optional, Any, Callable
from nio import AsyncClient, MatrixRoom, Event, RoomMessageText, RoomMessageMedia, RoomMessageEmote, SyncResponse
from nio import RoomKeyEvent, RoomEncryptedMedia, RoomEncryptedEvent

logger = logging.getLogger(__name__)


class MatrixArchiveClient:
    """Matrix client for archiving messages from monitored rooms."""
    
    def __init__(self, homeserver_url: str, username: str, password: str, device_name: str):
        """Initialize Matrix client."""
        self.homeserver_url = homeserver_url
        self.username = username
        self.password = password
        self.device_name = device_name
        
        self.client: Optional[AsyncClient] = None
        self.message_callback: Optional[Callable] = None
        self.media_callback: Optional[Callable] = None
        self.monitored_rooms: Dict[str, Dict[str, Any]] = {}
        
    async def initialize(self):
        """Initialize Matrix client and login."""
        self.client = AsyncClient(self.homeserver_url, self.username, device_id=self.device_name)
        
        try:
            # Login
            response = await self.client.login(self.password)
            if not response.access_token:
                raise Exception(f"Login failed: {response}")
            
            logger.info(f"Logged in as {self.username}")
            
            # Set up event handlers
            self.client.add_event_callback(self._message_callback, (RoomMessageText, RoomMessageMedia, RoomMessageEmote))
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize Matrix client: {e}")
            return False
    
    async def close(self):
        """Close Matrix client."""
        if self.client:
            await self.client.logout()
            await self.client.close()
            logger.info("Matrix client closed")
    
    def set_callbacks(self, message_callback: Callable, media_callback: Callable):
        """Set callbacks for processing messages and media."""
        self.message_callback = message_callback
        self.media_callback = media_callback
    
    def set_monitored_rooms(self, rooms: List[Dict[str, Any]]):
        """Set the list of rooms to monitor."""
        self.monitored_rooms = {room['room_id']: room for room in rooms}
        logger.info(f"Monitoring {len(self.monitored_rooms)} rooms")
    
    async def join_rooms(self):
        """Join all monitored rooms."""
        if not self.client:
            logger.error("Client not initialized")
            return
            
        for room_id in self.monitored_rooms.keys():
            try:
                response = await self.client.join(room_id)
                if hasattr(response, 'room_id'):
                    logger.info(f"Joined room {room_id}")
                else:
                    logger.warning(f"Failed to join room {room_id}: {response}")
            except Exception as e:
                logger.error(f"Error joining room {room_id}: {e}")
    
    async def start_sync(self):
        """Start syncing with Matrix server."""
        if not self.client:
            logger.error("Client not initialized")
            return
            
        try:
            # Initial sync
            await self.client.sync(timeout=30000)
            logger.info("Initial sync completed")
            
            # Start continuous sync
            await self.client.sync_forever(timeout=30000)
            
        except Exception as e:
            logger.error(f"Sync error: {e}")
            raise
    
    async def _message_callback(self, room: MatrixRoom, event: Event):
        """Handle incoming messages."""
        try:
            # Only process messages from monitored rooms
            if room.room_id not in self.monitored_rooms:
                return
            
            # Skip if room is disabled
            room_config = self.monitored_rooms[room.room_id]
            if not room_config.get('enabled', True):
                return
            
            # Extract message data
            message_data = {
                'event_id': event.event_id,
                'room_id': room.room_id,
                'sender': event.sender,
                'timestamp': event.server_timestamp,
                'message_type': event.type,
                'content': event.source.get('content', {}),
                'thread_id': None,
                'reply_to_event_id': None
            }
            
            # Check for thread/reply information
            if hasattr(event, 'source'):
                content = event.source.get('content', {})
                
                # Thread handling
                if 'm.relates_to' in content:
                    relates_to = content['m.relates_to']
                    if relates_to.get('rel_type') == 'm.thread':
                        message_data['thread_id'] = relates_to.get('event_id')
                    elif relates_to.get('m.in_reply_to'):
                        message_data['reply_to_event_id'] = relates_to['m.in_reply_to']['event_id']
            
            # Call message callback
            if self.message_callback:
                await self.message_callback(**message_data)
            
            # Handle media if present
            if isinstance(event, RoomMessageMedia):
                await self._handle_media_message(room, event)
                
        except Exception as e:
            logger.error(f"Error processing message {event.event_id}: {e}")
    
    async def _handle_media_message(self, room: MatrixRoom, event: RoomMessageMedia):
        """Handle media messages."""
        try:
            if not self.media_callback or not self.client:
                return
            
            # Get media info
            media_info = {
                'event_id': event.event_id,
                'media_type': event.source.get('content', {}).get('msgtype', 'unknown'),
                'filename': getattr(event, 'filename', 'unknown'),
                'url': getattr(event, 'url', ''),
                'mime_type': event.source.get('content', {}).get('info', {}).get('mimetype', 'application/octet-stream'),
                'file_size': event.source.get('content', {}).get('info', {}).get('size', 0)
            }
            
            # Download media
            if media_info['url']:
                try:
                    response = await self.client.download(media_info['url'])
                    if hasattr(response, 'body'):
                        media_info['data'] = response.body
                        await self.media_callback(**media_info)
                    else:
                        logger.error(f"Failed to download media: {response}")
                except Exception as e:
                    logger.error(f"Error downloading media {media_info['url']}: {e}")
                    
        except Exception as e:
            logger.error(f"Error handling media for event {event.event_id}: {e}")
    
    async def backfill_room(self, room_id: str, limit: int = 100) -> int:
        """Backfill messages from a room."""
        if not self.client:
            logger.error("Client not initialized")
            return 0
            
        try:
            room = self.client.rooms.get(room_id)
            if not room:
                logger.error(f"Room {room_id} not found")
                return 0
            
            # Get room messages
            response = await self.client.room_messages(
                room_id=room_id,
                start="",
                limit=limit,
                direction="b"  # backwards
            )
            
            if not hasattr(response, 'chunk'):
                logger.error(f"Failed to get messages for room {room_id}: {response}")
                return 0
            
            message_count = 0
            for event in response.chunk:
                # Process each event through the callback
                if hasattr(event, 'event_id'):
                    await self._message_callback(room, event)
                    message_count += 1
            
            logger.info(f"Backfilled {message_count} messages from room {room_id}")
            return message_count
            
        except Exception as e:
            logger.error(f"Error backfilling room {room_id}: {e}")
            return 0