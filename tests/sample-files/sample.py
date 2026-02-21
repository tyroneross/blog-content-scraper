"""
Sample Python Module for Parser Testing

This module demonstrates various Python constructs that the parser
should be able to handle including classes, functions, decorators,
type annotations, and nested structures.
"""

import os
import sys
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from pathlib import Path

# Configuration constants
MAX_RETRIES: int = 3
DEFAULT_TIMEOUT = 30
BASE_URL = "https://api.example.com/v2"
DEBUG_MODE: bool = False


@dataclass
class Config:
    """Application configuration container."""

    host: str = "localhost"
    port: int = 8080
    debug: bool = False
    workers: int = 4
    log_level: str = "INFO"
    tags: List[str] = field(default_factory=list)


class DataProcessor:
    """
    Process and transform data from various sources.

    Supports CSV, JSON, and database inputs with configurable
    transformation pipelines.
    """

    SUPPORTED_FORMATS = ["csv", "json", "parquet"]

    def __init__(self, config: Config, name: str = "default"):
        """Initialize the processor with configuration."""
        self.config = config
        self.name = name
        self._pipeline: List[callable] = []
        self._cache: Dict[str, Any] = {}

    def add_transform(self, func: callable) -> 'DataProcessor':
        """Add a transformation function to the pipeline."""
        self._pipeline.append(func)
        return self

    async def process(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Process data through the transformation pipeline.

        Args:
            data: List of records to process

        Returns:
            Transformed records
        """
        result = data
        for transform in self._pipeline:
            result = [transform(record) for record in result]
        return result

    def validate(self, record: Dict[str, Any]) -> bool:
        """Validate a single record against the schema."""
        required_fields = ["id", "timestamp", "value"]
        return all(field in record for field in required_fields)

    @staticmethod
    def from_file(path: str) -> 'DataProcessor':
        """Create a processor from a configuration file."""
        config = Config()
        return DataProcessor(config)

    @classmethod
    def create_default(cls) -> 'DataProcessor':
        """Create a processor with default settings."""
        return cls(Config())


def load_data(
    source: str,
    format: str = "json",
    limit: Optional[int] = None,
    **kwargs
) -> List[Dict[str, Any]]:
    """
    Load data from the specified source.

    Args:
        source: Path or URL to the data source
        format: Data format (json, csv, parquet)
        limit: Maximum number of records to load
        **kwargs: Additional format-specific options

    Returns:
        List of loaded records

    Raises:
        ValueError: If format is not supported
        FileNotFoundError: If source file doesn't exist
    """
    if format not in DataProcessor.SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported format: {format}")

    # Implementation would go here
    return []


async def fetch_remote(
    url: str,
    timeout: int = DEFAULT_TIMEOUT,
    retries: int = MAX_RETRIES
) -> Dict[str, Any]:
    """Fetch data from a remote API endpoint."""
    for attempt in range(retries):
        try:
            # Simulated fetch
            return {"status": "ok", "data": []}
        except Exception as e:
            if attempt == retries - 1:
                raise
    return {}


def _internal_helper(x: int, y: int) -> int:
    """Internal helper function (private)."""
    return x + y


# Entry point
if __name__ == "__main__":
    config = Config(debug=True)
    processor = DataProcessor(config)
    print(f"Processor: {processor.name}")
