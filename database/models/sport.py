"""
Sport model for the Sach Sports Platform.
"""

from dataclasses import dataclass


@dataclass
class Sport:
    """
    Represents a sport within the platform.
    """

    id: int | None = None
    name: str = ""
    abbreviation: str = ""
    is_active: bool = True
