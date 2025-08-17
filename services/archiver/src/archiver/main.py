"""Main Matrix archiver service."""

import asyncio
import logging
import signal
import sys
from typing import Optional
from pathlib import Path

from .config import ConfigLoader, setup_logging
from .supabase_client import SupabaseArchiver
from .matrix_client import MatrixArchiveClient
from .media_handler import MediaHandler

logger = logging.getLogger(__name__)


class MatrixArchiverService:
    """Main archiver service that coordinates all components."""
    
    def __init__(self):
        """Initialize the archiver service."""
        self.config = None
        self.supabase_client: Optional[SupabaseArchiver] = None
        self.matrix_client: Optional[MatrixArchiveClient] = None
        self.media_handler: Optional[MediaHandler] = None
        self.running = False
        
    async def initialize(self):
        """Initialize all service components."""
        try:
            # Load configuration
            config_loader = ConfigLoader()
            self.config = config_loader.load()
            
            # Set up logging
            setup_logging(self.config.log_level)
            logger.info("Starting Matrix Archiver Service")
            
            # Initialize Supabase client
            self.supabase_client = SupabaseArchiver(
                supabase_url=self.config.supabase.url,
                service_role_key=self.config.supabase.service_role_key,
                db_url=self.config.supabase.db_url
            )
            await self.supabase_client.initialize()
            
            # Initialize media handler
            self.media_handler = MediaHandler(
                max_file_size=self.config.processing.max_file_size
            )
            await self.media_handler.initialize()
            
            # Initialize Matrix client
            self.matrix_client = MatrixArchiveClient(
                homeserver_url=self.config.matrix.homeserver_url,
                username=self.config.matrix.username,
                password=self.config.matrix.password,
                device_name=self.config.matrix.device_name
            )
            
            # Set up callbacks
            self.matrix_client.set_callbacks(
                message_callback=self._handle_message,
                media_callback=self._handle_media
            )
            
            # Initialize Matrix client
            success = await self.matrix_client.initialize()
            if not success:
                raise Exception("Failed to initialize Matrix client")
            
            # Set up monitored rooms
            await self._setup_monitored_rooms()
            
            logger.info("All components initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize service: {e}")
            await self.cleanup()
            raise
    
    async def _setup_monitored_rooms(self):
        """Set up monitored rooms in database and Matrix client."""
        if not self.supabase_client or not self.matrix_client:
            return
            
        # Add rooms to database
        for room_config in self.config.rooms:
            if room_config.room_id:
                await self.supabase_client.add_monitored_room(
                    room_id=room_config.room_id,
                    enabled=room_config.enabled
                )
        
        # Get all monitored rooms from database
        monitored_rooms = await self.supabase_client.get_monitored_rooms()
        
        # Set up Matrix client with monitored rooms
        self.matrix_client.set_monitored_rooms(monitored_rooms)
        
        # Join rooms
        await self.matrix_client.join_rooms()
        
        # Perform backfill if configured
        for room_config in self.config.rooms:
            if room_config.backfill and room_config.enabled:
                logger.info(f"Starting backfill for room {room_config.room_id}")
                await self.matrix_client.backfill_room(
                    room_config.room_id, 
                    limit=1000  # Backfill last 1000 messages
                )
    
    async def _handle_message(self, event_id: str, room_id: str, sender: str,
                            timestamp: int, message_type: str, content: dict,
                            thread_id: Optional[str] = None,
                            reply_to_event_id: Optional[str] = None):
        """Handle incoming Matrix message."""
        try:
            success = await self.supabase_client.archive_message(
                event_id=event_id,
                room_id=room_id,
                sender=sender,
                timestamp=timestamp,
                message_type=message_type,
                content=content,
                thread_id=thread_id,
                reply_to_event_id=reply_to_event_id
            )
            
            if success:
                logger.debug(f"Archived message {event_id}")
            else:
                logger.warning(f"Failed to archive message {event_id}")
                
        except Exception as e:
            logger.error(f"Error handling message {event_id}: {e}")
    
    async def _handle_media(self, event_id: str, media_type: str, filename: str,
                          url: str, mime_type: str, file_size: int, data: bytes):
        """Handle media file from Matrix message."""
        try:
            # Process media through handler
            media_info = await self.media_handler.process_media(
                event_id=event_id,
                media_type=media_type,
                filename=filename,
                url=url,
                mime_type=mime_type,
                file_size=file_size,
                data=data,
                homeserver_url=self.config.matrix.homeserver_url
            )
            
            if not media_info:
                logger.error(f"Failed to process media for event {event_id}")
                return
            
            # Archive to Supabase
            public_url = await self.supabase_client.archive_media(
                event_id=media_info['event_id'],
                media_type=media_info['media_type'],
                original_filename=media_info['original_filename'],
                file_size=media_info['file_size'],
                mime_type=media_info['mime_type'],
                matrix_url=media_info['matrix_url'],
                media_data=media_info['media_data']
            )
            
            if public_url:
                logger.info(f"Archived media {filename} for event {event_id}")
            else:
                logger.warning(f"Failed to archive media for event {event_id}")
                
        except Exception as e:
            logger.error(f"Error handling media for event {event_id}: {e}")
    
    async def run(self):
        """Run the archiver service."""
        if not self.matrix_client:
            raise Exception("Service not initialized")
            
        self.running = True
        logger.info("Matrix Archiver Service started")
        
        try:
            # Start Matrix sync loop
            await self.matrix_client.start_sync()
        except Exception as e:
            logger.error(f"Error in main sync loop: {e}")
            raise
        finally:
            self.running = False
    
    async def cleanup(self):
        """Clean up all resources."""
        logger.info("Shutting down Matrix Archiver Service")
        
        if self.matrix_client:
            await self.matrix_client.close()
        
        if self.media_handler:
            await self.media_handler.close()
            
        if self.supabase_client:
            await self.supabase_client.close()
        
        logger.info("Cleanup completed")
    
    def setup_signal_handlers(self):
        """Set up signal handlers for graceful shutdown."""
        def signal_handler(signum, frame):
            logger.info(f"Received signal {signum}, shutting down...")
            self.running = False
            
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)


async def main():
    """Main entry point."""
    service = MatrixArchiverService()
    
    try:
        # Set up signal handlers
        service.setup_signal_handlers()
        
        # Initialize service
        await service.initialize()
        
        # Run service
        await service.run()
        
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
    except Exception as e:
        logger.error(f"Service error: {e}")
        sys.exit(1)
    finally:
        await service.cleanup()


if __name__ == "__main__":
    asyncio.run(main())