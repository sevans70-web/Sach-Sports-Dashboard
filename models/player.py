"""
Player data model used by the GI Score engine.

This model represents a player's normalized scoring metrics,
independent of sport.
"""

from dataclasses import dataclass


@dataclass
class Player:

    name: str
    sport: str

    recent_form: float
    matchup: float
    power: float
    contact: float
    ballpark: float
    weather: float
    lineup: float
    team_context: float
    availability: float
