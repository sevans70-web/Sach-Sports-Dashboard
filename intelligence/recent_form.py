"""
Recent Form Intelligence

Calculates a player's Recent Form Score based on performance
over the last 10 games.

The returned score is normalized to a value between 0 and 100.
"""


def calculate_recent_form(stats: dict) -> float:
    """
    Calculate a Recent Form Score.

    Parameters
    ----------
    stats : dict
        Dictionary containing recent player statistics.

    Expected Keys
    -------------
    batting_average
    home_runs
    rbi
    runs

    Returns
    -------
    float
        Recent Form Score (0-100)
    """

    batting_average = stats.get("batting_average", 0)
    home_runs = stats.get("home_runs", 0)
    rbi = stats.get("rbi", 0)
    runs = stats.get("runs", 0)

    score = (
        (batting_average * 200)
        + (home_runs * 5)
        + (rbi * 2)
        + runs
    )

    return min(round(score, 1), 100)
