"""NHL shared baseline intelligence and Top-25 prop ranking engine."""
from __future__ import annotations

import pandas as pd
from data.nhl_data import load_goalie_baseline, load_skater_baseline

NHL_PROPS = ["Shots on Goal", "Points", "Goals", "Assists", "Goalie Saves"]

PROP_CONFIG = {
    "Shots on Goal": ("shots_per_game", "SOG/G", "shot volume and offensive opportunity"),
    "Points": ("points_per_game", "PTS/G", "scoring involvement and offensive production"),
    "Goals": ("goals_per_game", "G/G", "goal scoring and shot conversion"),
    "Assists": ("assists_per_game", "AST/G", "playmaking and scoring involvement"),
    "Goalie Saves": ("saves_per_start", "SV/Start", "save workload and shots faced"),
}


def _gi(values: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(values, errors="coerce")
    lo, hi = numeric.quantile(.05), numeric.quantile(.95)
    if pd.isna(lo) or pd.isna(hi) or hi <= lo:
        return pd.Series(70.0, index=values.index)
    return (62 + ((numeric.clip(lo, hi) - lo) / (hi - lo)) * 34).round(1)


def build_nhl_baseline_top25(prop: str, minimum_games: int = 20) -> pd.DataFrame:
    if prop not in PROP_CONFIG:
        raise ValueError(f"Unsupported NHL prop: {prop}")
    metric, label, reason_focus = PROP_CONFIG[prop]
    goalie = prop == "Goalie Saves"
    stats = (load_goalie_baseline() if goalie else load_skater_baseline()).copy()
    if stats.empty:
        return stats
    games_field = "games_started" if goalie else "games_played"
    threshold = 15 if goalie else minimum_games
    eligible = stats[(pd.to_numeric(stats[games_field], errors="coerce") >= threshold) & pd.to_numeric(stats[metric], errors="coerce").notna()].copy()
    if eligible.empty:
        return eligible
    eligible["gi_score"] = _gi(eligible[metric])
    eligible = eligible.sort_values([metric, games_field], ascending=[False, False]).head(25).reset_index(drop=True)
    eligible.insert(0, "rank", range(1, len(eligible) + 1))
    eligible["ranking_value"] = pd.to_numeric(eligible[metric], errors="coerce")
    eligible["metric_label"] = label
    eligible["prop"] = prop
    eligible["reason"] = eligible.apply(lambda r: _reason(r, prop, reason_focus), axis=1)
    return eligible


def _reason(row: pd.Series, prop: str, focus: str) -> str:
    if prop == "Goalie Saves":
        return (f"Prior-season baseline: {row.get('saves_per_start', 0):.1f} saves/start on "
                f"{row.get('shots_against_per_start', 0):.1f} shots/start. The live model will add opponent shot volume, "
                "confirmed starter status, recent workload and team defense.")
    return (f"Prior-season baseline emphasizes {focus}: {row.get('ranking_value', 0):.2f} {row.get('metric_label', '')}. "
            "The live model will add recent form, expected ice time, line/PP role, opponent defense and projected goalie.")
