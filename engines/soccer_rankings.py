"""Shared soccer intelligence/ranking engine for the five V1 player props."""
from __future__ import annotations

import math
import pandas as pd

SOCCER_PROPS = ["Shots on Target", "Shots", "Goalkeeper Saves", "Goals", "Assists"]
PROP_COLUMN = {
    "Shots on Target": "shots_on_target",
    "Shots": "shots",
    "Goalkeeper Saves": "saves",
    "Goals": "goals",
    "Assists": "assists",
}


def _clamp(value, low, high):
    return max(low, min(high, value))


def build_soccer_rankings(stats: pd.DataFrame, fixtures: pd.DataFrame, prop: str) -> pd.DataFrame:
    """Rank only players with real parsed match history and a team on the upcoming slate.

    No placeholder players or fabricated sportsbook lines are produced.  GI is a
    transparent recent-form score until a soccer sportsbook market layer is connected.
    """
    metric = PROP_COLUMN.get(prop)
    if not metric or stats.empty or fixtures.empty or metric not in stats:
        return pd.DataFrame()

    upcoming = fixtures[~fixtures["completed"].fillna(False)].copy()
    if upcoming.empty:
        return pd.DataFrame()

    matchup_by_team = {}
    for game in upcoming.sort_values("kickoff").itertuples():
        matchup = f"{game.away_team} @ {game.home_team}"
        matchup_by_team[str(game.away_team_id)] = matchup
        matchup_by_team[str(game.home_team_id)] = matchup

    working = stats[stats["team_id"].astype(str).isin(matchup_by_team)].copy()
    if prop == "Goalkeeper Saves":
        pos = working.get("position", pd.Series(index=working.index, dtype=str)).astype(str).str.upper()
        working = working[(pos == "GK") | (working["saves"] > 0)]
    if working.empty:
        return pd.DataFrame()

    # Each row is one real completed-match appearance. Recent sample is capped at five.
    working["appearance_order"] = working.groupby("player_id").cumcount()
    recent = working.groupby("player_id", group_keys=False).tail(5).copy()
    grouped = recent.groupby(["player_id", "player_name", "team_id", "team", "position"], dropna=False)
    agg = grouped.agg(
        games=("game_id", "nunique"),
        avg_minutes=("minutes", "mean"),
        metric_avg=(metric, "mean"),
        metric_total=(metric, "sum"),
        starts=("starter", "sum"),
    ).reset_index()
    agg = agg[agg["games"] > 0].copy()
    if agg.empty:
        return agg

    # Minutes/start reliability matters heavily in soccer. Players with tiny samples
    # remain visible only when they have actually produced the selected stat.
    agg["minutes_factor"] = (agg["avg_minutes"] / 90.0).clip(lower=0.20, upper=1.0)
    agg["start_rate"] = (agg["starts"] / agg["games"]).clip(lower=0, upper=1)
    agg["sample_factor"] = (agg["games"] / 5.0).clip(lower=0.35, upper=1.0)
    agg["form_score"] = agg["metric_avg"] * (0.60 + 0.25 * agg["minutes_factor"] + 0.15 * agg["start_rate"])

    max_form = float(agg["form_score"].max()) if len(agg) else 0.0
    if max_form <= 0:
        return pd.DataFrame()

    agg["gi_score"] = (
        50
        + 35 * (agg["form_score"] / max_form)
        + 10 * agg["sample_factor"]
        + 5 * agg["start_rate"]
    ).clip(0, 100).round(1)
    agg["model_probability"] = agg["gi_score"].map(lambda x: round(_clamp(35 + (x - 50) * 0.9, 35, 88), 1))
    agg["matchup"] = agg["team_id"].astype(str).map(matchup_by_team).fillna("")
    agg["why_engine"] = agg.apply(
        lambda r: f"Recent {prop.lower()}: {r.metric_avg:.2f}/match • {r.avg_minutes:.0f} avg min • {int(r.starts)}/{int(r.games)} starts",
        axis=1,
    )
    agg = agg.sort_values(["gi_score", "metric_avg", "avg_minutes"], ascending=False).head(25).reset_index(drop=True)
    agg.insert(0, "rank", range(1, len(agg) + 1))
    return agg
