"""
Contact Intelligence

Calculates a player's Contact Score based on hitting consistency
and plate discipline.

The returned score is normalized to a value between 0 and 100.
"""


def calculate_contact_score(stats: dict) -> float:
    """
    Calculate a Contact Score.

    Parameters
    ----------
    stats : dict
        Dictionary containing player contact statistics.

    Expected Keys
    -------------
    batting_average
    on_base_percentage
    strikeout_rate
    walk_rate

    Returns
    -------
    float
        Contact Score (0-100)
    """

    batting_average = stats.get("batting_average", 0)
    on_base_percentage = stats.get("on_base_percentage", 0)
    strikeout_rate = stats.get("strikeout_rate", 0)
    walk_rate = stats.get("walk_rate", 0)

    score = (
        (batting_average * 200)
        + (on_base_percentage * 150)
        + (walk_rate * 2)
        - strikeout_rate
    )

    return max(0, min(round(score, 1), 100))
