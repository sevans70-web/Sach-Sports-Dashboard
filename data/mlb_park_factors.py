from typing import Any


PARK_FACTORS: dict[str, dict[str, float]] = {
    "Coors Field": {
        "hits": 1.10,
        "home_runs": 1.12,
        "total_bases": 1.12,
    },
    "Great American Ball Park": {
        "hits": 1.02,
        "home_runs": 1.10,
        "total_bases": 1.07,
    },
    "Yankee Stadium": {
        "hits": 1.01,
        "home_runs": 1.08,
        "total_bases": 1.05,
    },
    "Citizens Bank Park": {
        "hits": 1.02,
        "home_runs": 1.07,
        "total_bases": 1.05,
    },
    "Fenway Park": {
        "hits": 1.07,
        "home_runs": 1.02,
        "total_bases": 1.07,
    },
    "Dodger Stadium": {
        "hits": 0.99,
        "home_runs": 1.05,
        "total_bases": 1.02,
    },
    "Oracle Park": {
        "hits": 0.98,
        "home_runs": 0.92,
        "total_bases": 0.95,
    },
    "T-Mobile Park": {
        "hits": 0.94,
        "home_runs": 0.96,
        "total_bases": 0.94,
    },
    "Petco Park": {
        "hits": 0.96,
        "home_runs": 0.94,
        "total_bases": 0.95,
    },
}


def get_park_factor(
    venue_name: str,
    category: str,
) -> float:
    """Return park multiplier; neutral parks return 1.0."""
    factors: dict[str, Any] = PARK_FACTORS.get(
        str(venue_name or ""),
        {},
    )

    return float(factors.get(category, 1.0))
