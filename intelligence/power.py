"""
Power Intelligence

Calculates a player's Power Score based on offensive power metrics.

The returned score is normalized to a value between 0 and 100.
"""


def calculate_power_score(stats: dict) -> float:
    """
    Calculate a Power Score.

    Parameters
    ----------
    stats : dict
        Dictionary containing player power statistics.

    Expected Keys
    -------------
    home_runs
    slugging
    iso
    hard_hit_rate
    barrel_rate

    Returns
    -------
    float
        Power Score (0-100)
    """

    home_runs = stats.get("home_runs", 0)
    slugging = stats.get("slugging", 0)
    iso = stats.get("iso", 0)
    hard_hit_rate = stats.get("hard_hit_rate", 0)
    barrel_rate = stats.get("barrel_rate", 0)

    score = (
        (home_runs * 3)
        + (slugging * 60)
        + (iso * 80)
        + hard_hit_rate
        + barrel_rate
    )

    return min(round(score, 1), 100)
