"""
Supabase persistence for MLB rankings.

This module is deliberately Streamlit-free. Railway background jobs can use it
to persist finished MLB ranking snapshots while the dashboard only reads data.
"""

from __future__ import annotations

from datetime import date
import json
from typing import Any

from database.connection import supabase


BATTER_MARKETS = {
    "home_runs": ("mlb_batter_home_runs", "Home Runs", "home_runs"),
    "hits": ("mlb_batter_hits", "Hits", "hits"),
    "total_bases": ("mlb_batter_total_bases", "Total Bases", "total_bases"),
    "runs": ("mlb_batter_runs", "Runs", "runs"),
    "rbis": ("mlb_batter_rbis", "RBIs", "rbis"),
    "walks": ("mlb_batter_walks", "Walks", "walks"),
    "stolen_bases": ("mlb_batter_stolen_bases", "Stolen Bases", "stolen_bases"),
    "hits_runs_rbis": (
        "mlb_batter_hits_runs_rbis",
        "Hits + Runs + RBIs",
        "hits_runs_rbis",
    ),
}

PITCHER_MARKETS = {
    "strikeouts": ("mlb_pitcher_strikeouts", "Pitcher Strikeouts", "strikeouts"),
    "outs_recorded": ("mlb_pitcher_outs_recorded", "Pitcher Outs", "outs_recorded"),
    "hits_allowed": ("mlb_pitcher_hits_allowed", "Pitcher Hits Allowed", "hits_allowed"),
    "walks_allowed": ("mlb_pitcher_walks_allowed", "Pitcher Walks Allowed", "walks_allowed"),
    "earned_runs": ("mlb_pitcher_earned_runs", "Pitcher Earned Runs", "earned_runs"),
}


def _json_safe(value: Any) -> Any:
    """Return a JSON-safe copy for jsonb columns."""
    return json.loads(json.dumps(value, default=str))


def _first(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list) and data:
        return data[0]
    return None


def ensure_mlb_foundation() -> dict[str, Any]:
    """Ensure the MLB league and supported ranking markets exist."""
    sports = (
        supabase.table("sports")
        .select("id,name,slug")
        .eq("slug", "baseball")
        .limit(1)
        .execute()
        .data
    )
    sport = _first(sports)

    if not sport:
        sports = (
            supabase.table("sports")
            .select("id,name,slug")
            .ilike("name", "Baseball")
            .limit(1)
            .execute()
            .data
        )
        sport = _first(sports)

    if not sport:
        raise RuntimeError("Baseball sport row is missing from Supabase.")

    sport_id = int(sport["id"])

    league_payload = {
        "sport_id": sport_id,
        "name": "Major League Baseball",
        "abbreviation": "MLB",
        "slug": "mlb",
        "provider_league_id": "mlb",
        "is_active": True,
    }

    (
        supabase.table("leagues")
        .upsert(league_payload, on_conflict="sport_id,slug")
        .execute()
    )

    league_rows = (
        supabase.table("leagues")
        .select("id,sport_id,name,slug")
        .eq("sport_id", sport_id)
        .eq("slug", "mlb")
        .limit(1)
        .execute()
        .data
    )
    league = _first(league_rows)
    if not league:
        raise RuntimeError("Unable to create/read MLB league row.")

    league_id = int(league["id"])

    market_ids: dict[str, int] = {}
    all_markets = {**BATTER_MARKETS, **PITCHER_MARKETS}

    for category, (code, name, stat_key) in all_markets.items():
        payload = {
            "sport_id": sport_id,
            "league_id": league_id,
            "code": code,
            "name": name,
            "stat_key": stat_key,
            "is_active": True,
        }
        (
            supabase.table("markets")
            .upsert(payload, on_conflict="sport_id,league_id,code")
            .execute()
        )

        rows = (
            supabase.table("markets")
            .select("id,code")
            .eq("sport_id", sport_id)
            .eq("league_id", league_id)
            .eq("code", code)
            .limit(1)
            .execute()
            .data
        )
        row = _first(rows)
        if not row:
            raise RuntimeError(f"Unable to create/read market {code}.")
        market_ids[category] = int(row["id"])

    return {
        "sport_id": sport_id,
        "league_id": league_id,
        "market_ids": market_ids,
    }


def _upsert_player(
    *,
    league_id: int,
    provider_player_id: Any,
    name: str,
    position: str = "",
    photo_url: str = "",
) -> int:
    provider_id = str(provider_player_id or "").strip()
    if not provider_id:
        raise ValueError(f"Missing provider player id for {name!r}")

    payload = {
        "league_id": league_id,
        "provider_player_id": provider_id,
        "name": str(name or "Player unavailable"),
        "position": str(position or ""),
        "photo_url": str(photo_url or ""),
        "is_active": True,
    }

    (
        supabase.table("players")
        .upsert(payload, on_conflict="league_id,provider_player_id")
        .execute()
    )

    rows = (
        supabase.table("players")
        .select("id")
        .eq("league_id", league_id)
        .eq("provider_player_id", provider_id)
        .limit(1)
        .execute()
        .data
    )
    row = _first(rows)
    if not row:
        raise RuntimeError(f"Unable to create/read player {name!r}.")
    return int(row["id"])


def _previous_rank_lookup(
    *,
    league_id: int,
    market_id: int,
    ranking_date: str,
) -> dict[int, int]:
    snapshots = (
        supabase.table("ranking_snapshots")
        .select("id,snapshot_time")
        .eq("league_id", league_id)
        .eq("market_id", market_id)
        .eq("ranking_date", ranking_date)
        .order("snapshot_time", desc=True)
        .limit(1)
        .execute()
        .data
    )
    previous = _first(snapshots)
    if not previous:
        return {}

    entries = (
        supabase.table("ranking_entries")
        .select("player_id,rank")
        .eq("snapshot_id", previous["id"])
        .execute()
        .data
        or []
    )

    return {
        int(entry["player_id"]): int(entry["rank"])
        for entry in entries
        if entry.get("player_id") is not None and entry.get("rank") is not None
    }


def save_ranking_category(
    *,
    league_id: int,
    market_id: int,
    ranking_date: date | str,
    category: str,
    rankings: list[dict[str, Any]],
    role: str,
    model_version: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Persist one finished ranking category and movement snapshot."""
    ranking_date_text = (
        ranking_date.isoformat() if isinstance(ranking_date, date) else str(ranking_date)
    )

    previous_ranks = _previous_rank_lookup(
        league_id=league_id,
        market_id=market_id,
        ranking_date=ranking_date_text,
    )

    snapshot_payload = {
        "league_id": league_id,
        "market_id": market_id,
        "ranking_date": ranking_date_text,
        "status": "ready",
        "model_version": model_version,
        "metadata": _json_safe(
            {
                "category": category,
                "role": role,
                **(metadata or {}),
            }
        ),
    }

    inserted = (
        supabase.table("ranking_snapshots")
        .insert(snapshot_payload)
        .execute()
        .data
    )
    snapshot = _first(inserted)
    if not snapshot:
        raise RuntimeError(f"Unable to create ranking snapshot for {category}.")

    snapshot_id = snapshot["id"]
    movement_rows: list[dict[str, Any]] = []

    for row in rankings:
        if role == "pitcher":
            provider_player_id = row.get("pitcher_id")
            player_name = row.get("pitcher_name") or "Pitcher unavailable"
            position = "P"
            photo_url = row.get("headshot_url") or ""
            projection = row.get("projection")
        else:
            provider_player_id = row.get("player_id")
            player_name = row.get("player_name") or row.get("player") or "Player unavailable"
            position = row.get("position_abbreviation") or row.get("position") or ""
            photo_url = row.get("headshot_url") or ""
            projection = (
                row.get("projected_total_bases")
                if category == "total_bases"
                else row.get("home_run_probability")
                if category == "home_runs"
                else row.get("one_plus_hit_probability")
                if category == "hits"
                else row.get("gi_score")
            )

        player_id = _upsert_player(
            league_id=league_id,
            provider_player_id=provider_player_id,
            name=str(player_name),
            position=str(position),
            photo_url=str(photo_url),
        )

        rank = int(row.get("rank") or 0)
        score = row.get("gi_score")
        confidence = row.get("benchmark_probability") if role == "pitcher" else None

        entry_payload = {
            "snapshot_id": snapshot_id,
            "player_id": player_id,
            "rank": rank,
            "score": score,
            "projection": projection,
            "confidence": confidence,
            "intelligence": _json_safe(row),
        }
        supabase.table("ranking_entries").insert(entry_payload).execute()

        previous_rank = previous_ranks.get(player_id)
        if previous_rank is None:
            movement_type = "new"
            movement = None
        else:
            movement = previous_rank - rank
            if movement > 0:
                movement_type = "up"
            elif movement < 0:
                movement_type = "down"
            else:
                movement_type = "unchanged"

        movement_rows.append(
            {
                "league_id": league_id,
                "market_id": market_id,
                "player_id": player_id,
                "ranking_date": ranking_date_text,
                "previous_rank": previous_rank,
                "current_rank": rank,
                "movement": movement,
                "movement_type": movement_type,
                "snapshot_id": snapshot_id,
            }
        )

    if movement_rows:
        supabase.table("ranking_movements").insert(movement_rows).execute()

    return {
        "snapshot_id": snapshot_id,
        "category": category,
        "role": role,
        "saved_count": len(rankings),
    }


def save_source_snapshot(
    *,
    league_id: int,
    source_name: str,
    source_type: str,
    game_date: date | str,
    payload: Any,
) -> None:
    game_date_text = game_date.isoformat() if isinstance(game_date, date) else str(game_date)
    supabase.table("source_snapshots").insert(
        {
            "league_id": league_id,
            "source_name": source_name,
            "source_type": source_type,
            "game_date": game_date_text,
            "payload": _json_safe(payload),
        }
    ).execute()


def start_refresh_run(*, league_id: int, job_name: str) -> str:
    rows = (
        supabase.table("refresh_runs")
        .insert(
            {
                "league_id": league_id,
                "job_name": job_name,
                "status": "running",
            }
        )
        .execute()
        .data
    )
    row = _first(rows)
    if not row:
        raise RuntimeError("Unable to create refresh run.")
    return str(row["id"])


def finish_refresh_run(
    *,
    run_id: str,
    status: str,
    records_processed: int,
    error_message: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    from datetime import datetime, timezone

    supabase.table("refresh_runs").update(
        {
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "records_processed": int(records_processed),
            "error_message": error_message,
            "metadata": _json_safe(metadata or {}),
        }
    ).eq("id", run_id).execute()


def get_latest_rankings(
    *,
    market_code: str,
    ranking_date: date | str | None = None,
    limit: int = 25,
) -> dict[str, Any]:
    """Read the newest finished ranking snapshot for a market."""
    foundation = ensure_mlb_foundation()
    league_id = foundation["league_id"]

    market_rows = (
        supabase.table("markets")
        .select("id,code,name")
        .eq("league_id", league_id)
        .eq("code", market_code)
        .limit(1)
        .execute()
        .data
    )
    market = _first(market_rows)
    if not market:
        return {"success": False, "rankings": [], "error": "Market not found"}

    query = (
        supabase.table("ranking_snapshots")
        .select("id,ranking_date,snapshot_time,status,model_version,metadata")
        .eq("league_id", league_id)
        .eq("market_id", market["id"])
        .eq("status", "ready")
    )

    if ranking_date is not None:
        date_text = ranking_date.isoformat() if isinstance(ranking_date, date) else str(ranking_date)
        query = query.eq("ranking_date", date_text)

    snapshots = query.order("snapshot_time", desc=True).limit(1).execute().data
    snapshot = _first(snapshots)
    if not snapshot:
        return {"success": False, "rankings": [], "error": "No finished snapshot yet"}

    entries = (
        supabase.table("ranking_entries")
        .select("rank,score,projection,confidence,intelligence")
        .eq("snapshot_id", snapshot["id"])
        .order("rank")
        .limit(max(1, int(limit)))
        .execute()
        .data
        or []
    )

    rankings = []
    for entry in entries:
        payload = dict(entry.get("intelligence") or {})
        payload["rank"] = entry.get("rank")
        payload["gi_score"] = payload.get("gi_score", entry.get("score"))
        rankings.append(payload)

    return {
        "success": bool(rankings),
        "snapshot": snapshot,
        "market": market,
        "rankings": rankings,
    }
