"""Freeze, grade, persist and summarize NFL ranking predictions by market."""
from __future__ import annotations

import base64
import json
import re
import unicodedata
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
import requests

from data.nfl_stats import load_nfl_weekly_player_stats

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
HISTORY_PATH = Path(__file__).with_name("nfl_prediction_performance_history.json")
REPOSITORY = "sevans70-web/Sach-Sports-Dashboard"
BRANCH = "main"
REMOTE_HISTORY_PATH = "data/nfl_prediction_performance_history.json"
GITHUB_API = "https://api.github.com"

PROJECTION_COLUMNS = {
    "Passing Yards": "passing_yards_projection_matchup",
    "Passing TDs": "passing_tds_projection",
    "Pass + Rush Yards": "passing_rushing_projection",
    "Interceptions": "interceptions_projection",
    "Receiving Yards": "receiving_projection",
    "Receptions": "receptions_projection",
    "Rushing Yards": "rushing_projection",
    "Rush + Receiving Yards": "rushing_receiving_projection",
    "Sacks": "sacks_projection",
    "Tackles": "solo_tackles_projection",
    "Tackles + Assists": "tackles_projection",
}


def _empty_history() -> dict[str, Any]:
    return {"schema_version": 2, "days": {}}


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _history_url() -> str:
    return f"{GITHUB_API}/repos/{REPOSITORY}/contents/{REMOTE_HISTORY_PATH}"


def _normalize_history(payload: object) -> dict[str, Any]:
    history = payload if isinstance(payload, dict) else _empty_history()
    history.setdefault("schema_version", 2)
    history.setdefault("days", {})
    return history


def _load_history_with_sha(token: str | None = None) -> tuple[dict[str, Any], str | None]:
    if token:
        try:
            response = requests.get(
                _history_url(), headers=_headers(token), params={"ref": BRANCH}, timeout=20
            )
            if response.status_code == 404:
                return _empty_history(), None
            response.raise_for_status()
            payload = response.json()
            raw = base64.b64decode(payload.get("content", "")).decode("utf-8")
            return _normalize_history(json.loads(raw) if raw.strip() else {}), payload.get("sha")
        except Exception:
            pass
    try:
        return _normalize_history(json.loads(HISTORY_PATH.read_text(encoding="utf-8"))), None
    except (OSError, json.JSONDecodeError):
        return _empty_history(), None


def load_history(token: str | None = None) -> dict[str, Any]:
    return _load_history_with_sha(token)[0]


def _save_history(history: dict[str, Any], token: str | None, sha: str | None) -> None:
    content = json.dumps(history, indent=2, sort_keys=True)
    if token:
        body: dict[str, Any] = {
            "message": "Update NFL prediction performance history",
            "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
            "branch": BRANCH,
        }
        if sha:
            body["sha"] = sha
        response = requests.put(_history_url(), headers=_headers(token), json=body, timeout=25)
        response.raise_for_status()
        return
    try:
        HISTORY_PATH.write_text(content, encoding="utf-8")
    except OSError:
        pass


def _name_key(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char)).lower()
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    text = re.sub(r"\b(jr|sr|ii|iii|iv)\b", " ", text)
    return " ".join(text.split())


def _text(value: object) -> str:
    try:
        return "" if value is None or pd.isna(value) else str(value)
    except (TypeError, ValueError):
        return str(value or "")


def _row_key(row: dict[str, Any]) -> str:
    player = _text(row.get("player_id")) or _name_key(row.get("player_name"))
    game = _text(row.get("game_id")) or _text(row.get("game"))
    return f"{player}|{game}"


def _number(value: object) -> float | None:
    try:
        number = float(value)
        return None if pd.isna(number) else number
    except (TypeError, ValueError):
        return None


def _prediction_threshold(row: dict[str, Any], market: str) -> tuple[float | None, str]:
    line = _number(row.get("consensus_line"))
    if line is None:
        line = _number(row.get("prop_line"))
    source = "market" if line is not None else "projection"
    if line is None and market in {"Anytime TD", "First TD"}:
        line = 0.5
    if line is None:
        line = _number(row.get(PROJECTION_COLUMNS.get(market, "")))
    return line, source


def _prediction_side(row: dict[str, Any]) -> str:
    text = " ".join(_text(row.get(key)) for key in ("model_side", "lean", "recommended_side")).lower()
    return "under" if "under" in text else "over"


def _freeze(row: dict[str, Any], market: str) -> dict[str, Any]:
    threshold, threshold_source = _prediction_threshold(row, market)
    kickoff = pd.to_datetime(row.get("game_kickoff"), errors="coerce")
    game_date = _text(row.get("game_date"))
    if not game_date and pd.notna(kickoff):
        game_date = kickoff.strftime("%Y-%m-%d")
    return {
        "market": market,
        "rank": int(row.get("rank") or 0),
        "player_id": row.get("player_id"),
        "player_name": _text(row.get("player_name")) or _text(row.get("player_display_name")) or "Player",
        "team": _text(row.get("team")).upper(),
        "opponent": _text(row.get("opponent")).upper(),
        "game": _text(row.get("game")),
        "game_id": _text(row.get("game_id")),
        "season": int(row.get("game_season") or 0),
        "week": int(row.get("game_week") or 0),
        "game_date": game_date,
        "threshold": threshold,
        "threshold_source": threshold_source,
        "side": _prediction_side(row),
        "projection": _number(row.get(PROJECTION_COLUMNS.get(market, ""))),
        "correct": None,
        "push": False,
        "actual": None,
        "result_label": "Pending",
        "game_finished": False,
    }


def _market_actual(player: pd.Series, market: str) -> float | None:
    def stat(column: str) -> float:
        return _number(player.get(column)) or 0.0

    if market == "Passing Yards": return stat("passing_yards")
    if market == "Passing TDs": return stat("passing_tds")
    if market == "Pass + Rush Yards": return stat("passing_yards") + stat("rushing_yards")
    if market == "Interceptions": return stat("interceptions")
    if market == "Anytime TD": return stat("rushing_tds") + stat("receiving_tds")
    if market == "First TD": return None
    if market == "Receiving Yards": return stat("receiving_yards")
    if market == "Receptions": return stat("receptions")
    if market == "Rushing Yards": return stat("rushing_yards")
    if market == "Rush + Receiving Yards": return stat("rushing_yards") + stat("receiving_yards")
    if market == "Sacks": return stat("sacks")
    if market == "Tackles": return stat("tackles_solo")
    if market == "Tackles + Assists": return stat("tackles_total")
    return None


def _find_player(stats: pd.DataFrame, row: dict[str, Any]) -> pd.Series | None:
    player_id = _text(row.get("player_id"))
    if player_id and "player_id" in stats.columns:
        found = stats[stats["player_id"].astype(str).eq(player_id)]
        if not found.empty:
            return found.iloc[0]
    wanted = _name_key(row.get("player_name"))
    if wanted and "player_display_name" in stats.columns:
        found = stats[stats["player_display_name"].map(_name_key).eq(wanted)]
        team = _text(row.get("team")).upper()
        if team and "recent_team" in found.columns:
            same_team = found[found["recent_team"].astype(str).str.upper().eq(team)]
            if not same_team.empty:
                found = same_team
        if not found.empty:
            return found.iloc[0]
    return None


def _grade(row: dict[str, Any], stats: pd.DataFrame) -> dict[str, Any]:
    updated = dict(row)
    if not bool(updated.get("game_finished")):
        return updated
    player = _find_player(stats, updated)
    actual = _market_actual(player, str(updated.get("market"))) if player is not None else None
    threshold = _number(updated.get("threshold"))
    if actual is None or threshold is None:
        updated["result_label"] = "Final · result unavailable"
        return updated
    updated["actual"] = actual
    if actual == threshold:
        updated["push"] = True
        updated["correct"] = None
        updated["result_label"] = f"➖ PUSH · {actual:g}"
    else:
        is_under = str(updated.get("side") or "over") == "under"
        correct = actual < threshold if is_under else actual > threshold
        updated["correct"] = bool(correct)
        updated["result_label"] = f"{'✅ HIT' if correct else '❌ MISS'} · {actual:g}"
    return updated


def sync_history(
    rankings_by_market: dict[str, pd.DataFrame],
    token: str | None = None,
    schedule: pd.DataFrame | None = None,
) -> tuple[dict[str, Any], dict[str, pd.DataFrame]]:
    """Freeze current rankings, grade final games, and annotate current cards."""
    history, sha = _load_history_with_sha(token)
    days = history.setdefault("days", {})
    changed = False
    final_game_ids: set[str] = set()
    if schedule is not None and not schedule.empty:
        final_rows = schedule[
            schedule.get("status_group", pd.Series("", index=schedule.index)).astype(str).str.lower().eq("final")
        ]
        final_game_ids = set(final_rows.get("game_id", pd.Series(dtype=str)).dropna().astype(str))

    for market, frame in rankings_by_market.items():
        if frame is None or frame.empty:
            continue
        for row in frame.head(25).to_dict("records"):
            frozen = _freeze(row, market)
            day_key = frozen.get("game_date") or datetime.now(TORONTO_TIMEZONE).date().isoformat()
            market_rows = days.setdefault(day_key, {"markets": {}}).setdefault("markets", {}).setdefault(market, [])
            key = _row_key(frozen)
            existing = next((item for item in market_rows if _row_key(item) == key), None)
            if existing is None:
                frozen["captured_at"] = datetime.now(TORONTO_TIMEZONE).isoformat()
                market_rows.append(frozen)
                existing = market_rows[-1]
                changed = True
            raw_finished = row.get("game_final", False)
            finished = pd.notna(raw_finished) and bool(raw_finished)
            if finished and not bool(existing.get("game_finished")):
                existing["game_finished"] = True
                changed = True

    stats_cache: dict[tuple[int, int], pd.DataFrame] = {}
    for day_record in days.values():
        for market, rows in (day_record.get("markets") or {}).items():
            for index, stored in enumerate(rows if isinstance(rows, list) else []):
                if str(stored.get("game_id") or "") in final_game_ids and not stored.get("game_finished"):
                    stored["game_finished"] = True
                    changed = True
                if not stored.get("game_finished") or isinstance(stored.get("correct"), bool) or stored.get("push"):
                    continue
                season, week = int(stored.get("season") or 0), int(stored.get("week") or 0)
                if not season or not week:
                    continue
                cache_key = (season, week)
                if cache_key not in stats_cache:
                    try:
                        all_stats = load_nfl_weekly_player_stats(season).copy()
                        stats_cache[cache_key] = all_stats[pd.to_numeric(all_stats.get("week"), errors="coerce").eq(week)].copy()
                    except Exception:
                        stats_cache[cache_key] = pd.DataFrame()
                graded = _grade(stored, stats_cache[cache_key])
                if graded != stored:
                    rows[index] = graded
                    changed = True

    if changed:
        try:
            _save_history(history, token, sha)
        except Exception:
            _save_history(history, None, None)

    result_lookup: dict[tuple[str, str], dict[str, Any]] = {}
    for day_record in days.values():
        for market, rows in (day_record.get("markets") or {}).items():
            for stored in rows if isinstance(rows, list) else []:
                result_lookup[(market, _row_key(stored))] = stored

    annotated: dict[str, pd.DataFrame] = {}
    for market, frame in rankings_by_market.items():
        updated = frame.copy()
        labels, corrects, pushes, actuals = [], [], [], []
        for row in updated.to_dict("records"):
            stored = result_lookup.get((market, _row_key(_freeze(row, market))), {})
            labels.append(stored.get("result_label"))
            corrects.append(stored.get("correct"))
            pushes.append(bool(stored.get("push", False)))
            actuals.append(stored.get("actual"))
        updated["prediction_result_label"] = labels
        updated["prediction_correct"] = corrects
        updated["prediction_push"] = pushes
        updated["prediction_actual"] = actuals
        annotated[market] = updated
    return history, annotated


def _start(period: str, today: date) -> date:
    if period == "Today": return today
    if period == "Week": return today - timedelta(days=6)
    if period == "Month": return today.replace(day=1)
    return today.replace(month=1, day=1)


def records_for_period(history: dict[str, Any], market: str, period: str) -> list[dict[str, Any]]:
    today = datetime.now(TORONTO_TIMEZONE).date()
    start = _start(period, today)
    rows: list[dict[str, Any]] = []
    for day_key, day_record in (history.get("days") or {}).items():
        try:
            day = date.fromisoformat(day_key)
        except ValueError:
            continue
        if not start <= day <= today:
            continue
        market_rows = (day_record or {}).get("markets", {}).get(market, [])
        for row in market_rows if isinstance(market_rows, list) else []:
            if isinstance(row, dict):
                rows.append({**row, "date": day_key})
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    settled = [row for row in rows if isinstance(row.get("correct"), bool)]
    wins = sum(row.get("correct") is True for row in settled)

    def tier(first: int, last: int) -> dict[str, float | int]:
        group = [row for row in settled if first <= int(row.get("rank") or 0) <= last]
        group_wins = sum(row.get("correct") is True for row in group)
        return {"wins": group_wins, "total": len(group), "rate": (100 * group_wins / len(group)) if group else 0.0}

    return {
        "wins": wins,
        "losses": len(settled) - wins,
        "settled": len(settled),
        "pending": sum(not isinstance(row.get("correct"), bool) and not row.get("push") for row in rows),
        "pushes": sum(bool(row.get("push")) for row in rows),
        "hit_rate": (100 * wins / len(settled)) if settled else 0.0,
        "tiers": {"top_5": tier(1, 5), "six_to_ten": tier(6, 10), "eleven_to_25": tier(11, 25)},
    }
