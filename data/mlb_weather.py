"""
MLB game-weather data.

Uses Open-Meteo to retrieve hourly weather near an MLB venue.
No API key is required.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import requests


FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
REQUEST_TIMEOUT_SECONDS = 15


def get_game_weather(
    latitude: float,
    longitude: float,
    game_time: datetime,
    timezone_name: str,
) -> dict[str, Any]:
    """Return the hourly weather closest to the scheduled game time."""

    if latitude is None or longitude is None or game_time is None:
        return {
            "success": False,
            "error": "Weather data unavailable for this game.",
        }
        
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": (
            "temperature_2m,"
            "relative_humidity_2m,"
            "precipitation_probability,"
            "wind_speed_10m,"
            "wind_direction_10m,"
            "weather_code"
        ),
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "timezone": timezone_name,
        "forecast_days": 2,
    }

    try:
        response = requests.get(
            FORECAST_URL,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        return {
            "success": False,
            "error": f"Weather request failed: {exc}",
        }

    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])

    if not times:
        return {
            "success": False,
            "error": "No hourly weather data was returned.",
        }

    venue_timezone = ZoneInfo(timezone_name)
    local_game_time = game_time.astimezone(venue_timezone)
    target_hour = local_game_time.replace(
        minute=0,
        second=0,
        microsecond=0,
    )

    parsed_times = [
        datetime.fromisoformat(value).replace(tzinfo=venue_timezone)
        for value in times
    ]

    closest_index = min(
        range(len(parsed_times)),
        key=lambda index: abs(
            (parsed_times[index] - target_hour).total_seconds()
        ),
    )

    return {
        "success": True,
        "forecast_time": times[closest_index],
        "temperature_f": hourly.get(
            "temperature_2m",
            [],
        )[closest_index],
        "humidity_percent": hourly.get(
            "relative_humidity_2m",
            [],
        )[closest_index],
        "precipitation_probability": hourly.get(
            "precipitation_probability",
            [],
        )[closest_index],
        "wind_speed_mph": hourly.get(
            "wind_speed_10m",
            [],
        )[closest_index],
        "wind_direction_degrees": hourly.get(
            "wind_direction_10m",
            [],
        )[closest_index],
        "weather_code": hourly.get(
            "weather_code",
            [],
        )[closest_index],
        "error": None,
    }
