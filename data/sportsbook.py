"""Shared sportsbook infrastructure for Sach Sports Dashboard.

All sports should use this module for provider credentials, HTTP reuse, cache/snapshot
handling, cooldowns and provider status. Sport-specific modules remain responsible for
market names and parsing. This prevents each dashboard from independently burning API
allowance and gives new sports one consistent provider path.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Mapping

import requests
import streamlit as st

CACHE_ROOT = Path("/tmp/sach_sportsbook_cache")
CACHE_ROOT.mkdir(parents=True, exist_ok=True)
DEFAULT_TTL = 6 * 60 * 60
DEFAULT_COOLDOWN = 90

_SECRET_ALIASES = {
    "SPORTSGAMEODDS_API_KEY": ("SPORTS_GAME_ODDS_API_KEY", "SPORTSGAMEODDS_KEY", "SGO_API_KEY"),
    "THE_ODDS_API_KEY": ("ODDS_API_KEY", "THEODDSAPI_KEY"),
}
_SECRET_GROUPS = {
    "SPORTSGAMEODDS_API_KEY": ("sportsgameodds", "sports_game_odds", "sgo"),
    "THE_ODDS_API_KEY": ("the_odds_api", "odds_api"),
}


def secret(name: str) -> str | None:
    """Read a provider key from Streamlit secrets or environment variables."""
    for key in (name, *_SECRET_ALIASES.get(name, ())):
        try:
            value = st.secrets.get(key)
            if value:
                return str(value).strip()
        except Exception:
            pass
        value = os.getenv(key)
        if value:
            return str(value).strip()
    try:
        for group in _SECRET_GROUPS.get(name, ()):
            section = st.secrets.get(group)
            if section:
                value = section.get("api_key") or section.get("key")
                if value:
                    return str(value).strip()
    except Exception:
        pass
    return None


@dataclass
class FeedStatus:
    provider: str
    state: str = "idle"  # idle/live/cached/rate_limited/quota/error/not_configured
    message: str = ""
    last_success: float = 0.0
    next_retry: float = 0.0
    cache_age_seconds: float | None = None


@st.cache_resource
def _runtime() -> dict[str, Any]:
    session = requests.Session()
    session.headers.update({"User-Agent": "SachSportsDashboard/1.0"})
    return {
        "session": session,
        "lock": threading.RLock(),
        "status": {},
        "memory": {},
    }


def _status_key(provider: str, sport: str) -> str:
    return f"{provider.lower()}::{sport.lower()}"


def set_status(provider: str, sport: str, **changes: Any) -> FeedStatus:
    runtime = _runtime()
    key = _status_key(provider, sport)
    with runtime["lock"]:
        current = runtime["status"].get(key) or FeedStatus(provider=provider)
        for field, value in changes.items():
            if hasattr(current, field):
                setattr(current, field, value)
        runtime["status"][key] = current
        return current


def get_status(provider: str, sport: str) -> dict[str, Any]:
    current = _runtime()["status"].get(_status_key(provider, sport))
    return asdict(current) if current else asdict(FeedStatus(provider=provider))


def _cache_key(provider: str, sport: str, url: str, params: Mapping[str, Any] | None) -> str:
    stable = json.dumps({"url": url, "params": dict(params or {})}, sort_keys=True, default=str)
    digest = hashlib.sha256(stable.encode("utf-8")).hexdigest()[:20]
    return f"{provider.lower()}_{sport.lower()}_{digest}"


def _cache_path(key: str) -> Path:
    return CACHE_ROOT / f"{key}.json"


def _read_snapshot(key: str) -> tuple[Any | None, float | None]:
    path = _cache_path(key)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        saved = float(payload.get("saved_at") or 0)
        return payload.get("data"), max(0.0, time.time() - saved)
    except Exception:
        return None, None


def _write_snapshot(key: str, data: Any) -> None:
    try:
        _cache_path(key).write_text(
            json.dumps({"saved_at": time.time(), "data": data}, default=str),
            encoding="utf-8",
        )
    except Exception:
        pass


def cached_json_get(
    *,
    provider: str,
    sport: str,
    url: str,
    params: Mapping[str, Any] | None = None,
    headers: Mapping[str, str] | None = None,
    ttl: int = DEFAULT_TTL,
    cooldown: int = DEFAULT_COOLDOWN,
    timeout: int = 15,
    allow_stale: bool = True,
) -> tuple[Any | None, dict[str, Any]]:
    """GET JSON once per cache window and share the result across all sessions/pages.

    Returns ``(data, status_dict)``. On 429 or transient provider failure, the last
    successful snapshot is returned when available. The cooldown is shared by every
    user/session in this Streamlit process, preventing refresh/navigation storms.
    """
    runtime = _runtime()
    key = _cache_key(provider, sport, url, params)
    now = time.time()

    with runtime["lock"]:
        mem = runtime["memory"].get(key)
        if mem and now - mem["saved_at"] < ttl:
            age = now - mem["saved_at"]
            status = set_status(provider, sport, state="cached", cache_age_seconds=age)
            return mem["data"], asdict(status)

        current = get_status(provider, sport)
        if now < float(current.get("next_retry") or 0):
            stale, age = _read_snapshot(key)
            if stale is not None and allow_stale:
                status = set_status(provider, sport, state="cached", cache_age_seconds=age)
                return stale, asdict(status)
            return None, current

        # Hold the lock through the request so simultaneous page loads cannot fan out
        # into duplicate provider calls.
        try:
            response = runtime["session"].get(
                url, params=dict(params or {}), headers=dict(headers or {}), timeout=timeout
            )
            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                try:
                    wait = max(cooldown, int(float(retry_after)))
                except Exception:
                    wait = cooldown
                status = set_status(
                    provider,
                    sport,
                    state="rate_limited",
                    message=f"{provider} is rate-limited; cached data will be used when available.",
                    next_retry=now + wait,
                )
                stale, age = _read_snapshot(key)
                if stale is not None and allow_stale:
                    status = set_status(provider, sport, state="cached", cache_age_seconds=age)
                    return stale, asdict(status)
                return None, asdict(status)

            response.raise_for_status()
            data = response.json()
            runtime["memory"][key] = {"saved_at": now, "data": data}
            _write_snapshot(key, data)
            status = set_status(
                provider,
                sport,
                state="live",
                message=f"{provider} connected.",
                last_success=now,
                next_retry=0.0,
                cache_age_seconds=0.0,
            )
            return data, asdict(status)
        except Exception as exc:
            status = set_status(
                provider,
                sport,
                state="error",
                message=f"{provider} temporarily unavailable: {type(exc).__name__}.",
                next_retry=now + cooldown,
            )
            stale, age = _read_snapshot(key)
            if stale is not None and allow_stale:
                status = set_status(provider, sport, state="cached", cache_age_seconds=age)
                return stale, asdict(status)
            return None, asdict(status)


def provider_configured(provider: str) -> bool:
    key = {
        "sportsgameodds": "SPORTSGAMEODDS_API_KEY",
        "the odds api": "THE_ODDS_API_KEY",
        "the_odds_api": "THE_ODDS_API_KEY",
    }.get(provider.strip().lower())
    return bool(secret(key)) if key else False


def clear_memory_cache() -> None:
    """Clear only in-process sportsbook response cache; snapshots remain available."""
    runtime = _runtime()
    with runtime["lock"]:
        runtime["memory"].clear()
