"""NBA Stage 2 baseline ranking engine.

These rankings are statistical baselines from the prior completed regular season.
They are intentionally not called predictions until current slate, availability,
matchup and market inputs are added in later stages.
"""

from __future__ import annotations

import pandas as pd

from data.nba_stats import NBA_BASELINE_SEASON, load_nba_player_baseline

PROP_METRICS = {
    "Points": ("points_per_game", "PTS/G"),
    "Rebounds": ("rebounds_per_game", "REB/G"),
    "Assists": ("assists_per_game", "AST/G"),
    "3-Pointers Made": ("threes_per_game", "3PM/G"),
    "Points + Rebounds + Assists (PRA)": ("pra_per_game", "PRA/G"),
    "Points + Rebounds": ("points_rebounds_per_game", "P+R/G"),
    "Points + Assists": ("points_assists_per_game", "P+A/G"),
    "Rebounds + Assists": ("rebounds_assists_per_game", "R+A/G"),
    "Steals": ("steals_per_game", "STL/G"),
    "Blocks": ("blocks_per_game", "BLK/G"),
}


def _add_combo_metrics(stats: pd.DataFrame) -> pd.DataFrame:
    out = stats.copy()
    out["pra_per_game"] = (
        out["points_per_game"] + out["rebounds_per_game"] + out["assists_per_game"]
    )
    out["points_rebounds_per_game"] = out["points_per_game"] + out["rebounds_per_game"]
    out["points_assists_per_game"] = out["points_per_game"] + out["assists_per_game"]
    out["rebounds_assists_per_game"] = out["rebounds_per_game"] + out["assists_per_game"]
    return out


def build_nba_baseline_top25(
    prop: str,
    season: str = NBA_BASELINE_SEASON,
    minimum_games: int = 20,
) -> pd.DataFrame:
    """Build a real-data Top 25 baseline for one supported NBA prop."""
    if prop not in PROP_METRICS:
        raise ValueError(f"Unsupported NBA prop: {prop}")

    stats = load_nba_player_baseline(season).copy()
    if stats.empty:
        return stats

    stats = _add_combo_metrics(stats)
    metric, metric_label = PROP_METRICS[prop]

    eligible = stats[
        (pd.to_numeric(stats["games_played"], errors="coerce") >= minimum_games)
        & pd.to_numeric(stats[metric], errors="coerce").notna()
    ].copy()

    if eligible.empty:
        return eligible

    eligible = eligible.sort_values(
        [metric, "minutes_per_game", "games_played"],
        ascending=[False, False, False],
    ).head(25).reset_index(drop=True)
    eligible.insert(0, "rank", range(1, len(eligible) + 1))
    eligible["ranking_value"] = pd.to_numeric(eligible[metric], errors="coerce")
    eligible["metric_label"] = metric_label
    eligible["prop"] = prop
    eligible["baseline_season"] = season
    return eligible
