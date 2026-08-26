"""Soccer rankings for the five V1 player props."""
from __future__ import annotations

import pandas as pd

SOCCER_PROPS = [
    "Shots on Target",
    "Shots",
    "Goalkeeper Saves",
    "Goals",
    "Assists",
]

PROP_COLUMN = {
    "Shots on Target": "shots_on_target",
    "Shots": "shots",
    "Goalkeeper Saves": "saves",
    "Goals": "goals",
    "Assists": "assists",
}


def _norm_name(value):
    return "".join(ch.lower() for ch in str(value or "") if ch.isalnum())


def build_soccer_rankings(
    stats: pd.DataFrame,
    fixtures: pd.DataFrame,
    prop: str,
    markets: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Create market-first rankings, enriched by real recent stats when available.

    The sportsbook market is the candidate set. That prevents stale/non-playing
    players from appearing and gives every ranked player a real posted line.
    """
    if markets is None or markets.empty:
        return pd.DataFrame()

    market = markets[markets["prop"] == prop].copy()
    if market.empty:
        return pd.DataFrame()

    market["market_probability"] = pd.to_numeric(
        market["market_probability"], errors="coerce"
    )
    market["line"] = pd.to_numeric(market["line"], errors="coerce")
    market["books_available"] = pd.to_numeric(
        market["books_available"], errors="coerce"
    ).fillna(0)

    # De-vig is not possible from a single side alone. Keep this clearly as
    # sportsbook/fair implied probability rather than pretending it is model probability.
    market["market_score"] = market["market_probability"].fillna(50.0).clip(1, 99)

    metric = PROP_COLUMN.get(prop)
    recent_summary = pd.DataFrame()

    if (
        metric
        and stats is not None
        and not stats.empty
        and metric in stats.columns
        and "player_name" in stats.columns
    ):
        working = stats.copy()
        working["name_key"] = working["player_name"].map(_norm_name)
        working[metric] = pd.to_numeric(working[metric], errors="coerce").fillna(0)
        working["minutes"] = pd.to_numeric(
            working.get("minutes", 0), errors="coerce"
        ).fillna(0)

        if prop == "Goalkeeper Saves" and "position" in working:
            pos = working["position"].astype(str).str.upper()
            working = working[(pos == "GK") | (working[metric] > 0)]

        recent = working.groupby("name_key", group_keys=False).tail(5)
        recent_summary = (
            recent.groupby("name_key")
            .agg(
                games=("game_id", "nunique"),
                metric_avg=(metric, "mean"),
                avg_minutes=("minutes", "mean"),
            )
            .reset_index()
        )

    market["name_key"] = market["player_name"].map(_norm_name)

    if not recent_summary.empty:
        market = market.merge(recent_summary, on="name_key", how="left")
    else:
        market["games"] = 0
        market["metric_avg"] = pd.NA
        market["avg_minutes"] = pd.NA

    # Market gets the majority weight until the historical stat layer is fully populated.
    # Real recent stats add a modest evidence adjustment when they exist.
    market["history_available"] = market["metric_avg"].notna()

    def history_adjustment(row):
        if not row["history_available"]:
            return 0.0
        line = float(row["line"]) if pd.notna(row["line"]) else 0.5
        avg = float(row["metric_avg"])
        denom = max(line, 0.5)
        edge = (avg - line) / denom
        return max(-8.0, min(8.0, edge * 10.0))

    market["history_adjustment"] = market.apply(history_adjustment, axis=1)
    market["liquidity_bonus"] = (
        market["books_available"].clip(lower=0, upper=10) / 10.0 * 4.0
    )

    market["gi_score"] = (
        0.92 * market["market_score"]
        + market["history_adjustment"]
        + market["liquidity_bonus"]
    ).clip(0, 100).round(1)

    market["model_probability"] = market["market_probability"].round(1)

    def why(row):
        base = (
            f"Posted line {row['line']:g} • "
            f"{int(row['books_available'])} books"
        )
        if row["history_available"]:
            return (
                f"{base} • recent {prop.lower()} "
                f"{float(row['metric_avg']):.2f}/match"
            )
        return f"{base} • market-led until recent match history is available"

    market["why_engine"] = market.apply(why, axis=1)

    market = market.sort_values(
        ["gi_score", "market_probability", "books_available"],
        ascending=False,
        na_position="last",
    ).head(25).reset_index(drop=True)

    market.insert(0, "rank", range(1, len(market) + 1))

    keep = [
        "rank",
        "player_name",
        "player_id",
        "matchup",
        "line",
        "consensus_odds",
        "market_probability",
        "books_available",
        "gi_score",
        "model_probability",
        "metric_avg",
        "avg_minutes",
        "why_engine",
        "provider",
    ]
    return market[[c for c in keep if c in market.columns]]
