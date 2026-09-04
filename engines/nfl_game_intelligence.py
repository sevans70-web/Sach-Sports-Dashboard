"""Transparent NFL matchup intelligence built from prior-season weekly stats."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from data.nfl_stats import load_nfl_weekly_player_stats


def _safe_mean(series: pd.Series) -> float | None:
    value = pd.to_numeric(series, errors="coerce").mean()
    return None if pd.isna(value) else float(value)


@st.cache_data(ttl=21600, show_spinner=False)
def build_team_context(season: int = 2025) -> pd.DataFrame:
    weekly = load_nfl_weekly_player_stats(season).copy()
    if weekly.empty:
        return pd.DataFrame()

    for col in ["passing_yards", "rushing_yards", "passing_tds", "rushing_tds", "targets", "carries"]:
        if col not in weekly.columns:
            weekly[col] = 0.0

    # Team offense by week. Summing passing across QBs handles games with multiple passers.
    offense = (
        weekly.groupby(["recent_team", "week"], as_index=False)[
            ["passing_yards", "rushing_yards", "passing_tds", "rushing_tds", "targets", "carries"]
        ].sum()
    )
    offense_summary = offense.groupby("recent_team", as_index=False).agg(
        pass_yds_pg=("passing_yards", "mean"),
        rush_yds_pg=("rushing_yards", "mean"),
        pass_tds_pg=("passing_tds", "mean"),
        rush_tds_pg=("rushing_tds", "mean"),
        targets_pg=("targets", "mean"),
        carries_pg=("carries", "mean"),
    ).rename(columns={"recent_team":"team"})

    # What each defense allowed, using opponent_team from offensive stat rows.
    allowed = (
        weekly.groupby(["opponent_team", "week"], as_index=False)[["passing_yards", "rushing_yards"]].sum()
    )
    defense_summary = allowed.groupby("opponent_team", as_index=False).agg(
        pass_yds_allowed_pg=("passing_yards", "mean"),
        rush_yds_allowed_pg=("rushing_yards", "mean"),
    ).rename(columns={"opponent_team":"team"})

    out = offense_summary.merge(defense_summary, on="team", how="outer")
    for col in out.columns:
        if col != "team":
            out[col] = pd.to_numeric(out[col], errors="coerce")
    return out


def _rank_phrase(value: float | None, league: pd.Series, high_is_good: bool = True) -> str:
    if value is None or pd.isna(value) or league.dropna().empty:
        return "league context unavailable"
    percentile = float((league.dropna() <= value).mean())
    if not high_is_good:
        percentile = 1 - percentile
    if percentile >= .80:
        return "top-tier"
    if percentile >= .60:
        return "above average"
    if percentile <= .20:
        return "bottom-tier"
    if percentile <= .40:
        return "below average"
    return "near league average"


def build_matchup_intelligence(away: str, home: str, baseline_season: int = 2025) -> dict:
    ctx = build_team_context(baseline_season)
    if ctx.empty:
        return {
            "rundown": "Historical matchup context is still loading.",
            "signals": [],
        }

    lookup = {str(r.team).upper(): r for r in ctx.itertuples(index=False)}
    a = lookup.get(str(away).upper())
    h = lookup.get(str(home).upper())
    if a is None or h is None:
        return {"rundown":"Historical matchup context is limited for this pairing.", "signals":[]}

    pass_allowed = ctx["pass_yds_allowed_pg"]
    rush_allowed = ctx["rush_yds_allowed_pg"]

    a_pass_edge = (getattr(a, "pass_yds_pg", None) or 0) - (getattr(h, "pass_yds_allowed_pg", None) or 0)
    h_pass_edge = (getattr(h, "pass_yds_pg", None) or 0) - (getattr(a, "pass_yds_allowed_pg", None) or 0)
    a_rush_edge = (getattr(a, "rush_yds_pg", None) or 0) - (getattr(h, "rush_yds_allowed_pg", None) or 0)
    h_rush_edge = (getattr(h, "rush_yds_pg", None) or 0) - (getattr(a, "rush_yds_allowed_pg", None) or 0)

    edges = [
        (abs(a_pass_edge), f"{away} passing", a_pass_edge, "pass"),
        (abs(h_pass_edge), f"{home} passing", h_pass_edge, "pass"),
        (abs(a_rush_edge), f"{away} rushing", a_rush_edge, "rush"),
        (abs(h_rush_edge), f"{home} rushing", h_rush_edge, "rush"),
    ]
    strongest = sorted(edges, reverse=True)[0]
    direction = "positive" if strongest[2] > 0 else "challenging"

    rundown = (
        f"The clearest historical matchup signal is {strongest[1]}. "
        f"That profile grades as {direction} when prior-season production is compared with what the opponent allowed. "
        "Use the player cards below to see whether recent role and prop-specific form confirm the team-level signal."
    )

    signals = [
        f"{away} pass offense: {getattr(a,'pass_yds_pg',0):.0f} yds/game · {home} pass defense allowed {getattr(h,'pass_yds_allowed_pg',0):.0f}",
        f"{home} pass offense: {getattr(h,'pass_yds_pg',0):.0f} yds/game · {away} pass defense allowed {getattr(a,'pass_yds_allowed_pg',0):.0f}",
        f"{away} rush offense: {getattr(a,'rush_yds_pg',0):.0f} yds/game · {home} rush defense allowed {getattr(h,'rush_yds_allowed_pg',0):.0f}",
        f"{home} rush offense: {getattr(h,'rush_yds_pg',0):.0f} yds/game · {away} rush defense allowed {getattr(a,'rush_yds_allowed_pg',0):.0f}",
    ]
    return {"rundown": rundown, "signals": signals}
