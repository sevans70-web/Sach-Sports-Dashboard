"""NFL Passing Yards current-season blend for Sach Sports Dashboard."""

import pandas as pd
import streamlit as st

from data.nfl_stats import load_nfl_weekly_player_stats
from engines.nfl_passing_projection import build_passing_yards_projection


def _current_season_weight(games_played: int) -> float:
    """Increase current-season influence gradually as real 2026 games accumulate."""
    if games_played <= 0:
        return 0.00
    if games_played == 1:
        return 0.20
    if games_played == 2:
        return 0.35
    if games_played == 3:
        return 0.50
    if games_played == 4:
        return 0.60
    if games_played == 5:
        return 0.70
    if games_played <= 7:
        return 0.75
    return 0.80


@st.cache_data(ttl=3600, show_spinner=False)
def _load_current_qb_stats(season: int = 2026) -> pd.DataFrame:
    """
    Load current regular-season QB stats.

    Before regular-season data exists, return an empty frame rather than
    breaking the NFL page.
    """
    try:
        weekly = load_nfl_weekly_player_stats(season).copy()
    except Exception:
        return pd.DataFrame()

    if weekly.empty or "position" not in weekly.columns:
        return pd.DataFrame()

    qbs = weekly[weekly["position"] == "QB"].copy()

    if qbs.empty:
        return pd.DataFrame()

    qbs["week"] = pd.to_numeric(qbs["week"], errors="coerce")
    qbs["passing_yards"] = pd.to_numeric(
        qbs["passing_yards"], errors="coerce"
    ).fillna(0)
    qbs["attempts"] = pd.to_numeric(
        qbs["attempts"], errors="coerce"
    ).fillna(0)
    qbs["completions"] = pd.to_numeric(
        qbs["completions"], errors="coerce"
    ).fillna(0)

    rows = []

    for player_id, group in qbs.groupby("player_id"):
        group = group.sort_values("week")
        last_3 = group.tail(3)
        last_5 = group.tail(5)

        games_played = int(group["week"].nunique())
        attempts = float(group["attempts"].sum())
        yards = float(group["passing_yards"].sum())
        completions = float(group["completions"].sum())

        rows.append(
            {
                "player_id": player_id,
                "current_games_played": games_played,
                "current_passing_yards_per_game": round(
                    float(group["passing_yards"].mean()), 1
                ),
                "current_last_3_passing_yards_per_game": round(
                    float(last_3["passing_yards"].mean()), 1
                ),
                "current_last_5_passing_yards_per_game": round(
                    float(last_5["passing_yards"].mean()), 1
                ),
                "current_attempts_per_game": round(
                    float(group["attempts"].mean()), 1
                ),
                "current_yards_per_attempt": (
                    round(yards / attempts, 2)
                    if attempts > 0
                    else pd.NA
                ),
                "current_completion_rate": (
                    round(completions / attempts, 3)
                    if attempts > 0
                    else pd.NA
                ),
            }
        )

    return pd.DataFrame(rows)


def build_passing_yards_blended_projection(
    opponent_team: str,
    roster_season: int = 2026,
    baseline_season: int = 2025,
) -> pd.DataFrame:
    """
    Blend the 2025 historical+matchup projection with real 2026 production.

    Before 2026 regular-season games exist, the historical+matchup projection
    remains unchanged. Current-season influence increases gradually instead
    of replacing 2025 after only one or two games.
    """

    projections = build_passing_yards_projection(
        opponent_team=opponent_team,
        roster_season=roster_season,
        baseline_season=baseline_season,
    ).copy()

    current = _load_current_qb_stats(roster_season)

    if current.empty:
        projections["current_games_played"] = 0
        projections["current_season_weight"] = 0.0
        projections["historical_weight"] = 1.0
        projections["passing_yards_projection_blended"] = projections[
            "passing_yards_projection_matchup"
        ]
        projections["season_blend_status"] = "2025 baseline active"
        return projections.reset_index(drop=True)

    projections = projections.merge(
        current,
        on="player_id",
        how="left",
        validate="one_to_one",
    )

    projections["current_games_played"] = (
        projections["current_games_played"]
        .fillna(0)
        .astype(int)
    )

    projections["current_season_weight"] = projections[
        "current_games_played"
    ].apply(_current_season_weight)

    projections["historical_weight"] = (
        1.0 - projections["current_season_weight"]
    )

    current_form = (
        projections["current_passing_yards_per_game"] * 0.55
        + projections["current_last_5_passing_yards_per_game"] * 0.25
        + projections["current_last_3_passing_yards_per_game"] * 0.20
    )

    projections["current_form_projection"] = current_form.round(1)

    projections["passing_yards_projection_blended"] = projections.apply(
        _blend_projection,
        axis=1,
    )

    projections["season_blend_status"] = projections[
        "current_games_played"
    ].apply(
        lambda games: (
            "2025 baseline active"
            if games == 0
            else f"2025 + 2026 blend ({games} current games)"
        )
    )

    return projections.reset_index(drop=True)


def _blend_projection(row: pd.Series):
    """Blend historical projection and current form safely."""

    historical = row.get("passing_yards_projection_matchup")
    current = row.get("current_form_projection")
    current_weight = float(row.get("current_season_weight", 0.0) or 0.0)
    historical_weight = 1.0 - current_weight

    if pd.isna(historical) and pd.isna(current):
        return pd.NA

    if pd.isna(current) or current_weight == 0:
        return historical

    if pd.isna(historical):
        return current

    return round(
        float(historical) * historical_weight
        + float(current) * current_weight,
        1,
    )


def get_qb_blended_passing_projection(
    player_id: str,
    opponent_team: str,
    roster_season: int = 2026,
    baseline_season: int = 2025,
) -> dict:
    """Return one QB's blended Passing Yards projection."""

    projections = build_passing_yards_blended_projection(
        opponent_team=opponent_team,
        roster_season=roster_season,
        baseline_season=baseline_season,
    )

    row = projections[
        projections["player_id"] == player_id
    ]

    if row.empty:
        return {}

    return row.iloc[0].to_dict()
