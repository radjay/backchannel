"""Supabase client for archiving Matrix messages and media."""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import asyncpg
from supabase import create_client, Client
import aiohttp

logger = logging.getLogger(__name__)


class SupabaseArchiver:
    """Handles archiving to Supabase database and storage."""
    
    def __init__(self, supabase_url: str, service_role_key: str, db_url: str):
        """Initialize Supabase client."""
        self.supabase_url = supabase_url
        self.service_role_key = service_role_key
        self.db_url = db_url
        
        # Initialize Supabase client for storage
        self.supabase: Client = create_client(supabase_url, service_role_key)
        
        # Database connection pool
        self.db_pool: Optional[asyncpg.Pool] = None
        
    async def initialize(self):
        """Initialize database connection pool."""
        try:
            self.db_pool = await asyncpg.create_pool(
                self.db_url,
                min_size=2,
                max_size=10,
                command_timeout=60
            )
            logger.info("Supabase database connection pool initialized")
        except Exception as e:
            logger.error(f"Failed to initialize database pool: {e}")
            raise
    
    async def close(self):
        """Close database connections."""
        if self.db_pool:
            await self.db_pool.close()
            logger.info("Database connections closed")
    
    async def archive_message(self, event_id: str, room_id: str, sender: str, 
                            timestamp: int, message_type: str, content: Dict[str, Any],
                            thread_id: Optional[str] = None, 
                            reply_to_event_id: Optional[str] = None) -> bool:
        """Archive a Matrix message to Supabase."""
        if not self.db_pool:
            logger.error("Database pool not initialized")
            return False
            
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO archived_messages 
                    (event_id, room_id, sender, timestamp, message_type, content, thread_id, reply_to_event_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (event_id) DO NOTHING
                    """,
                    event_id, room_id, sender, timestamp, message_type, content, thread_id, reply_to_event_id
                )
            
            logger.debug(f"Archived message {event_id} from room {room_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to archive message {event_id}: {e}")
            return False
    
    async def archive_media(self, event_id: str, media_type: str, original_filename: str,
                          file_size: int, mime_type: str, matrix_url: str,
                          media_data: bytes) -> Optional[str]:
        """Archive media file to Supabase Storage and record in database."""
        if not self.db_pool:
            logger.error("Database pool not initialized")
            return None
            
        try:
            # Generate storage path
            timestamp = datetime.now().strftime("%Y/%m/%d")
            storage_path = f"{timestamp}/{event_id}_{original_filename}"
            
            # Upload to Supabase Storage
            result = self.supabase.storage.from_("matrix-media").upload(
                path=storage_path,
                file=media_data,
                file_options={
                    "content-type": mime_type,
                    "cache-control": "3600"
                }
            )
            
            if result.status_code != 200:
                logger.error(f"Failed to upload media to storage: {result}")
                return None
            
            # Get public URL
            public_url = self.supabase.storage.from_("matrix-media").get_public_url(storage_path)
            
            # Record in database
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO archived_media 
                    (event_id, media_type, original_filename, file_size, mime_type, 
                     matrix_url, storage_path, public_url)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    """,
                    event_id, media_type, original_filename, file_size, mime_type,
                    matrix_url, storage_path, public_url
                )
            
            logger.info(f"Archived media {original_filename} for event {event_id}")
            return public_url
            
        except Exception as e:
            logger.error(f"Failed to archive media for event {event_id}: {e}")
            return None
    
    async def get_room_config(self, room_id: str) -> Optional[Dict[str, Any]]:
        """Get configuration for a monitored room."""
        if not self.db_pool:
            return None
            
        try:
            async with self.db_pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT * FROM monitored_rooms WHERE room_id = $1",
                    room_id
                )
                
                if row:
                    return dict(row)
                return None
                
        except Exception as e:
            logger.error(f"Failed to get room config for {room_id}: {e}")
            return None
    
    async def update_room_sync_token(self, room_id: str, sync_token: str) -> bool:
        """Update the last sync token for a room."""
        if not self.db_pool:
            return False
            
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE monitored_rooms 
                    SET last_sync_token = $1 
                    WHERE room_id = $2
                    """,
                    sync_token, room_id
                )
            return True
            
        except Exception as e:
            logger.error(f"Failed to update sync token for {room_id}: {e}")
            return False
    
    async def add_monitored_room(self, room_id: str, room_name: str = None, 
                               room_alias: str = None, enabled: bool = True) -> bool:
        """Add a room to monitoring."""
        if not self.db_pool:
            return False
            
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO monitored_rooms (room_id, room_name, room_alias, enabled)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (room_id) DO UPDATE SET
                        room_name = EXCLUDED.room_name,
                        room_alias = EXCLUDED.room_alias,
                        enabled = EXCLUDED.enabled
                    """,
                    room_id, room_name, room_alias, enabled
                )
            
            logger.info(f"Added/updated monitored room: {room_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to add monitored room {room_id}: {e}")
            return False
    
    async def get_monitored_rooms(self) -> List[Dict[str, Any]]:
        """Get all monitored rooms."""
        if not self.db_pool:
            return []
            
        try:
            async with self.db_pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT * FROM monitored_rooms WHERE enabled = true"
                )
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Failed to get monitored rooms: {e}")
            return []