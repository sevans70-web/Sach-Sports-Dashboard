"""
Matchup Intelligence

Calculates a player's Matchup Score based on historical performance
against the opposing pitcher.

The returned score is normalized to a value between 0 and 100.
"""


def calculate_matchup_score(stats: dict) -> float:
    """
    Calculate a Matchup Score.

    Parameters
    ----------
    stats : dict
        Dictionary containing matchup statistics.

    Expected Keys
    -------------
    batting_average_vs_pitcher
    home_runs_vs_pitcher
    ops_vs_pitcher
    strikeouts_vs_pitcher

    Returns
    -------
    float
        Matchup Score (0-100)
    """

    batting_average = stats.get("batting_average_vs_pitcher", 0)
    home_runs = stats.get("home_runs_vs_pitcher", 0)
    ops = stats.get("ops_vs_pitcher", 0)
    strikeouts = stats.get("strikeouts_vs_pitcher", 0)

    score = (
        (batting_average * 200)
        + (ops * 70)
        + (home_runs * 4)
        - (strikeouts * 2)
    )

    return max(0, min(round(score, 1), 100))
