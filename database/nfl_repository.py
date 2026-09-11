"""Durable NFL prediction-history storage using the existing Supabase schema."""
from __future__ import annotations

from datetime import date
import json
from typing import Any

SOURCE_NAME = "nfl_prediction_performance_history"
SOURCE_TYPE = "prediction_history"


def _client():
    from database.connection import supabase
    return supabase


def _first(rows):
    return rows[0] if isinstance(rows, list) and rows else None


def _league_id() -> int:
    client = _client()
    league = _first(client.table("leagues").select("id").ilike("abbreviation", "NFL").limit(1).execute().data)
    if league:
        return int(league["id"])

    sports = client.table("sports").select("id,name,slug").eq("slug", "football").limit(1).execute().data
    sport = _first(sports)
    if not sport:
        sports = client.table("sports").select("id,name,slug").ilike("name", "%football%").limit(1).execute().data
        sport = _first(sports)
    if not sport:
        raise RuntimeError("Football sport row is missing from Supabase.")

    values = {
        "sport_id": int(sport["id"]), "name": "National Football League",
        "abbreviation": "NFL", "slug": "nfl", "provider_league_id": "nfl",
        "is_active": True,
    }
    client.table("leagues").upsert(values, on_conflict="sport_id,slug").execute()
    league = _first(client.table("leagues").select("id").eq("sport_id", int(sport["id"])).eq("slug", "nfl").limit(1).execute().data)
    if not league:
        raise RuntimeError("Unable to create or read the NFL league row.")
    return int(league["id"])


def load_nfl_prediction_history() -> dict[str, Any] | None:
    client = _client()
    rows = (client.table("source_snapshots").select("payload")
            .eq("league_id", _league_id()).eq("source_name", SOURCE_NAME)
            .eq("source_type", SOURCE_TYPE).order("created_at", desc=True)
            .limit(1).execute().data or [])
    payload = (_first(rows) or {}).get("payload")
    return payload if isinstance(payload, dict) else None


def save_nfl_prediction_history(history: dict[str, Any]) -> None:
    client = _client()
    league_id = _league_id()
    rows = (client.table("source_snapshots").select("id")
            .eq("league_id", league_id).eq("source_name", SOURCE_NAME)
            .eq("source_type", SOURCE_TYPE).order("created_at", desc=True)
            .limit(1).execute().data or [])
    payload = json.loads(json.dumps(history, default=str))
    current = _first(rows)
    values = {"game_date": date.today().isoformat(), "payload": payload}
    if current:
        client.table("source_snapshots").update(values).eq("id", current["id"]).execute()
    else:
        client.table("source_snapshots").insert({
            "league_id": league_id, "source_name": SOURCE_NAME,
            "source_type": SOURCE_TYPE, **values,
        }).execute()
