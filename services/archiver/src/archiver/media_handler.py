"""Media handler for downloading and processing Matrix media files."""

import asyncio
import logging
from typing import Optional, Dict, Any
import aiohttp
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class MediaHandler:
    """Handles media file downloads and processing."""
    
    def __init__(self, max_file_size: int = 100 * 1024 * 1024):  # 100MB default
        """Initialize media handler."""
        self.max_file_size = max_file_size
        self.session: Optional[aiohttp.ClientSession] = None
        
    async def initialize(self):
        """Initialize HTTP session."""
        timeout = aiohttp.ClientTimeout(total=300)  # 5 minute timeout
        self.session = aiohttp.ClientSession(timeout=timeout)
        logger.info("Media handler initialized")
    
    async def close(self):
        """Close HTTP session."""
        if self.session:
            await self.session.close()
            logger.info("Media handler closed")
    
    async def download_matrix_media(self, matrix_url: str, homeserver_url: str) -> Optional[bytes]:
        """Download media from Matrix server."""
        if not self.session:
            logger.error("Session not initialized")
            return None
            
        try:
            # Parse Matrix URL (mxc://server/media_id)
            if not matrix_url.startswith('mxc://'):
                logger.error(f"Invalid Matrix URL: {matrix_url}")
                return None
            
            # Convert mxc:// URL to HTTP URL
            mxc_parts = matrix_url[6:].split('/', 1)  # Remove 'mxc://' prefix
            if len(mxc_parts) != 2:
                logger.error(f"Invalid MXC URL format: {matrix_url}")
                return None
            
            server_name, media_id = mxc_parts
            download_url = f"{homeserver_url}/_matrix/media/r0/download/{server_name}/{media_id}"
            
            # Download the file
            async with self.session.get(download_url) as response:
                if response.status != 200:
                    logger.error(f"Failed to download media: HTTP {response.status}")
                    return None
                
                # Check content length
                content_length = response.headers.get('content-length')
                if content_length and int(content_length) > self.max_file_size:
                    logger.warning(f"File too large: {content_length} bytes")
                    return None
                
                # Read the file data
                media_data = b""
                async for chunk in response.content.iter_chunked(8192):
                    media_data += chunk
                    if len(media_data) > self.max_file_size:
                        logger.warning(f"File size limit exceeded during download")
                        return None
                
                logger.debug(f"Downloaded {len(media_data)} bytes from {matrix_url}")
                return media_data
                
        except Exception as e:
            logger.error(f"Error downloading media {matrix_url}: {e}")
            return None
    
    def get_media_type(self, mime_type: str) -> str:
        """Determine media type category from MIME type."""
        if mime_type.startswith('image/'):
            return 'image'
        elif mime_type.startswith('video/'):
            return 'video'
        elif mime_type.startswith('audio/'):
            return 'audio'
        elif mime_type == 'application/pdf':
            return 'document'
        elif mime_type.startswith('text/'):
            return 'text'
        else:
            return 'file'
    
    def sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for storage."""
        # Remove or replace problematic characters
        unsafe_chars = '<>:"/\\|?*'
        for char in unsafe_chars:
            filename = filename.replace(char, '_')
        
        # Limit length
        if len(filename) > 255:
            name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
            max_name_len = 250 - len(ext)
            filename = name[:max_name_len] + ('.' + ext if ext else '')
        
        return filename
    
    def get_file_extension(self, mime_type: str, filename: str) -> str:
        """Get appropriate file extension."""
        # If filename already has extension, use it
        if '.' in filename:
            return filename.split('.')[-1].lower()
        
        # Common MIME type to extension mappings
        mime_to_ext = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'audio/mpeg': 'mp3',
            'audio/ogg': 'ogg',
            'audio/wav': 'wav',
            'application/pdf': 'pdf',
            'text/plain': 'txt',
            'application/json': 'json'
        }
        
        return mime_to_ext.get(mime_type, 'bin')
    
    async def process_media(self, event_id: str, media_type: str, filename: str,
                          url: str, mime_type: str, file_size: int, 
                          data: bytes, homeserver_url: str) -> Dict[str, Any]:
        """Process media file for archiving."""
        try:
            # Sanitize filename
            clean_filename = self.sanitize_filename(filename)
            
            # Ensure proper extension
            if not clean_filename.endswith('.' + self.get_file_extension(mime_type, filename)):
                clean_filename += '.' + self.get_file_extension(mime_type, filename)
            
            # Determine media category
            media_category = self.get_media_type(mime_type)
            
            return {
                'event_id': event_id,
                'media_type': media_category,
                'original_filename': clean_filename,
                'file_size': len(data),
                'mime_type': mime_type,
                'matrix_url': url,
                'media_data': data
            }
            
        except Exception as e:
            logger.error(f"Error processing media for event {event_id}: {e}")
            return None