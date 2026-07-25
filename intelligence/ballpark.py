"""
Ballpark Intelligence

Calculates a Ballpark Score based on how favorable a stadium is
for offensive production.

The returned score is normalized to a value between 0 and 100.
"""


def calculate_ballpark_score(stats: dict) -> float:
    """
    Calculate a Ballpark Score.

    Parameters
    ----------
    stats : dict
        Dictionary containing ballpark metrics.

    Expected Keys
    -------------
    park_factor
    home_run_factor
    run_factor

    Returns
    -------
    float
        Ballpark Score (0-100)
    """

    park_factor = stats.get("park_factor", 100)
    home_run_factor = stats.get("home_run_factor", 100)
    run_factor = stats.get("run_factor", 100)

    score = (
        ((park_factor - 100) * 0.4)
        + ((home_run_factor - 100) * 0.35)
        + ((run_factor - 100) * 0.25)
        + 50
    )

    return max(0, min(round(score, 1), 100))
