"""Configuration management for Matrix archiver."""

import os
import yaml
import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class MatrixConfig:
    """Matrix connection configuration."""
    homeserver_url: str
    username: str
    password: str
    device_name: str


@dataclass
class SupabaseConfig:
    """Supabase configuration."""
    url: str
    service_role_key: str
    anon_key: str
    jwt_secret: str
    db_url: str
    storage_bucket: str
    file_size_limit: int


@dataclass
class RoomConfig:
    """Room monitoring configuration."""
    room_id: str
    enabled: bool = True
    backfill: bool = False


@dataclass
class ProcessingConfig:
    """Processing configuration."""
    max_file_size: int
    batch_size: int
    sync_timeout: int
    concurrent_uploads: int
    retry_attempts: int
    retry_delay: int


@dataclass
class Config:
    """Main configuration class."""
    matrix: MatrixConfig
    supabase: SupabaseConfig
    rooms: List[RoomConfig]
    processing: ProcessingConfig
    log_level: str = "INFO"


class ConfigLoader:
    """Loads and validates configuration."""
    
    def __init__(self, config_path: Optional[str] = None):
        """Initialize config loader."""
        self.config_path = config_path or self._find_config_file()
        
    def _find_config_file(self) -> str:
        """Find configuration file."""
        # Check multiple possible locations
        possible_paths = [
            "/home/matrix-ai/config/archiver/config.yaml",
            "/home/matrix-ai/services/archiver/config/archiver.yaml",
            "./config/archiver.yaml",
            "./archiver.yaml"
        ]
        
        for path in possible_paths:
            if Path(path).exists():
                return path
                
        # Default path
        return "/home/matrix-ai/config/archiver/config.yaml"
    
    def load(self) -> Config:
        """Load configuration from file and environment."""
        try:
            # Load from YAML file
            config_data = self._load_yaml_config()
            
            # Apply environment variable overrides
            config_data = self._apply_env_overrides(config_data)
            
            # Validate and create config objects
            return self._create_config(config_data)
            
        except Exception as e:
            logger.error(f"Failed to load configuration: {e}")
            raise
    
    def _load_yaml_config(self) -> Dict[str, Any]:
        """Load configuration from YAML file."""
        try:
            with open(self.config_path, 'r') as f:
                return yaml.safe_load(f)
        except FileNotFoundError:
            logger.warning(f"Config file not found: {self.config_path}")
            return {}
        except Exception as e:
            logger.error(f"Error reading config file: {e}")
            raise
    
    def _apply_env_overrides(self, config_data: Dict[str, Any]) -> Dict[str, Any]:
        """Apply environment variable overrides."""
        # Matrix configuration
        matrix_config = config_data.setdefault('matrix', {})
        matrix_config['homeserver_url'] = os.getenv('MATRIX_HOMESERVER_URL', 
                                                   matrix_config.get('homeserver_url', 'http://localhost:8008'))
        matrix_config['username'] = os.getenv('MATRIX_USERNAME', 
                                            matrix_config.get('username', '@archiver:matrix.radx.dev'))
        matrix_config['password'] = os.getenv('MATRIX_PASSWORD', 
                                            matrix_config.get('password', ''))
        matrix_config['device_name'] = os.getenv('MATRIX_DEVICE_NAME', 
                                                matrix_config.get('device_name', 'Supabase Matrix Archiver'))
        
        # Supabase configuration
        supabase_config = config_data.setdefault('supabase', {})
        supabase_config['url'] = os.getenv('SUPABASE_URL', 
                                         supabase_config.get('url', ''))
        supabase_config['service_role_key'] = os.getenv('SUPABASE_SERVICE_ROLE_KEY', 
                                                      supabase_config.get('service_role_key', ''))
        supabase_config['anon_key'] = os.getenv('SUPABASE_ANON_KEY', 
                                              supabase_config.get('anon_key', ''))
        supabase_config['jwt_secret'] = os.getenv('SUPABASE_JWT_SECRET', 
                                                supabase_config.get('jwt_secret', ''))
        supabase_config['db_url'] = os.getenv('SUPABASE_DB_URL', 
                                            supabase_config.get('db_url', ''))
        
        # Storage configuration
        storage_config = supabase_config.setdefault('storage', {})
        storage_config['bucket'] = os.getenv('SUPABASE_STORAGE_BUCKET', 
                                           storage_config.get('bucket', 'matrix-media'))
        storage_config['file_size_limit'] = os.getenv('SUPABASE_FILE_SIZE_LIMIT', 
                                                    storage_config.get('file_size_limit', '100MB'))
        
        return config_data
    
    def _create_config(self, config_data: Dict[str, Any]) -> Config:
        """Create configuration objects from data."""
        # Matrix config
        matrix_data = config_data.get('matrix', {})
        matrix_config = MatrixConfig(
            homeserver_url=matrix_data.get('homeserver_url', 'http://localhost:8008'),
            username=matrix_data.get('username', '@archiver:matrix.radx.dev'),
            password=matrix_data.get('password', ''),
            device_name=matrix_data.get('device_name', 'Supabase Matrix Archiver')
        )
        
        # Validate required Matrix fields
        if not matrix_config.password:
            raise ValueError("Matrix password is required")
        
        # Supabase config
        supabase_data = config_data.get('supabase', {})
        storage_data = supabase_data.get('storage', {})
        
        # Parse file size limit
        file_size_str = storage_data.get('file_size_limit', '100MB')
        file_size_bytes = self._parse_file_size(file_size_str)
        
        supabase_config = SupabaseConfig(
            url=supabase_data.get('url', ''),
            service_role_key=supabase_data.get('service_role_key', ''),
            anon_key=supabase_data.get('anon_key', ''),
            jwt_secret=supabase_data.get('jwt_secret', ''),
            db_url=supabase_data.get('db_url', ''),
            storage_bucket=storage_data.get('bucket', 'matrix-media'),
            file_size_limit=file_size_bytes
        )
        
        # Validate required Supabase fields
        required_fields = ['url', 'service_role_key', 'db_url']
        for field in required_fields:
            if not getattr(supabase_config, field):
                raise ValueError(f"Supabase {field} is required")
        
        # Room configs
        rooms_data = config_data.get('rooms', [])
        room_configs = []
        for room_data in rooms_data:
            if isinstance(room_data, str):
                # Simple format: just room ID
                room_configs.append(RoomConfig(room_id=room_data))
            else:
                # Full format with options
                room_configs.append(RoomConfig(
                    room_id=room_data.get('room_id', ''),
                    enabled=room_data.get('enabled', True),
                    backfill=room_data.get('backfill', False)
                ))
        
        # Processing config
        processing_data = config_data.get('processing', {})
        processing_config = ProcessingConfig(
            max_file_size=self._parse_file_size(processing_data.get('max_file_size', '100MB')),
            batch_size=processing_data.get('batch_size', 50),
            sync_timeout=processing_data.get('sync_timeout', 30000),
            concurrent_uploads=processing_data.get('concurrent_uploads', 5),
            retry_attempts=processing_data.get('retry_attempts', 3),
            retry_delay=processing_data.get('retry_delay', 5)
        )
        
        return Config(
            matrix=matrix_config,
            supabase=supabase_config,
            rooms=room_configs,
            processing=processing_config,
            log_level=config_data.get('log_level', 'INFO')
        )
    
    def _parse_file_size(self, size_str: str) -> int:
        """Parse file size string to bytes."""
        size_str = size_str.upper().strip()
        
        if size_str.endswith('KB'):
            return int(size_str[:-2]) * 1024
        elif size_str.endswith('MB'):
            return int(size_str[:-2]) * 1024 * 1024
        elif size_str.endswith('GB'):
            return int(size_str[:-2]) * 1024 * 1024 * 1024
        else:
            # Assume bytes
            return int(size_str)


def setup_logging(log_level: str = "INFO"):
    """Set up logging configuration."""
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler('/home/matrix-ai/logs/archiver.log')
        ]
    )
    
    # Reduce noise from libraries
    logging.getLogger('aiohttp').setLevel(logging.WARNING)
    logging.getLogger('asyncio').setLevel(logging.WARNING)