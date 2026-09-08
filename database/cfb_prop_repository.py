"""Persistent CFB sportsbook snapshot storage in the existing Supabase schema.

This deliberately reuses source_snapshots so CFB does not need a new database
migration. If the shared football/league rows are unavailable, callers can
continue with ESPN model projections without failing the dashboard.
"""
from __future__ import annotations

from datetime import date
from typing import Any
import json

from database.connection import supabase

_CACHE = None


def _first(rows):
    return rows[0] if isinstance(rows, list) and rows else None


def _json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))


def _cfb_league_id() -> int | None:
    global _CACHE
    if _CACHE is not None:
        return _CACHE

    try:
        rows = (
            supabase.table("sports")
            .select("id,name,slug")
            .eq("slug", "football")
            .limit(1)
            .execute()
            .data
            or []
        )
        sport = _first(rows)
        if not sport:
            rows = (
                supabase.table("sports")
                .select("id,name,slug")
                .ilike("name", "Football")
                .limit(1)
                .execute()
                .data
                or []
            )
            sport = _first(rows)
        if not sport:
            return None

        sport_id = int(sport["id"])
        payload = {
            "sport_id": sport_id,
            "name": "College Football",
            "abbreviation": "CFB",
            "slug": "cfb",
            "provider_league_id": "NCAAF",
            "is_active": True,
        }
        supabase.table("leagues").upsert(payload, on_conflict="sport_id,slug").execute()
        rows = (
            supabase.table("leagues")
            .select("id")
            .eq("sport_id", sport_id)
            .eq("slug", "cfb")
            .limit(1)
            .execute()
            .data
            or []
        )
        row = _first(rows)
        if not row:
            return None
        _CACHE = int(row["id"])
        return _CACHE
    except Exception:
        return None


def save_cfb_prop_snapshot(payload: dict[str, Any]) -> bool:
    """Persist one replaceable SportsGameOdds CFB payload."""
    league_id = _cfb_league_id()
    if not league_id:
        return False
    try:
        rows = (
            supabase.table("source_snapshots")
            .select("id")
            .eq("league_id", league_id)
            .eq("source_name", "sportsgameodds_cfb")
            .eq("source_type", "player_props")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        values = {
            "game_date": date.today().isoformat(),
            "payload": _json_safe(payload),
        }
        row = _first(rows)
        if row:
            supabase.table("source_snapshots").update(values).eq("id", row["id"]).execute()
        else:
            supabase.table("source_snapshots").insert(
                {
                    "league_id": league_id,
                    "source_name": "sportsgameodds_cfb",
                    "source_type": "player_props",
                    **values,
                }
            ).execute()
        return True
    except Exception:
        return False


def load_cfb_prop_snapshot() -> dict[str, Any] | None:
    """Return the newest durable CFB sportsbook snapshot, if one exists."""
    league_id = _cfb_league_id()
    if not league_id:
        return None
    try:
        rows = (
            supabase.table("source_snapshots")
            .select("payload,created_at,game_date")
            .eq("league_id", league_id)
            .eq("source_name", "sportsgameodds_cfb")
            .eq("source_type", "player_props")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        row = _first(rows)
        if not row:
            return None
        payload = row.get("payload") or {}
        if not isinstance(payload, dict):
            return None
        return {
            "payload": payload,
            "created_at": row.get("created_at"),
            "game_date": row.get("game_date"),
        }
    except Exception:
        return None
