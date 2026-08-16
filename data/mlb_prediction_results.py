from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from time import monotonic
from typing import Any
from zoneinfo import ZoneInfo

import requests


MLB_SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule"
MLB_BOXSCORE_URL = (
    "https://statsapi.mlb.com/api/v1/game/{game_pk}/boxscore"
)
MLB_LIVE_FEED_URL = (
    "https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live"
)

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
REQUEST_TIMEOUT_SECONDS = 20
LIVE_RESULTS_CACHE_SECONDS = 30
_LIVE_RESULTS_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def _requested_date(
    result_date: date | str | None = None,
) -> str:
    """Return the requested Toronto date as YYYY-MM-DD."""
    if result_date is None:
        return datetime.now(
            TORONTO_TIMEZONE
        ).date().isoformat()

    if isinstance(result_date, date):
        return result_date.isoformat()

    return str(result_date)


def _request_json(
    url: str,
    params: dict[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
    """Request JSON and return a readable error when it fails."""
    try:
        response = requests.get(
            url,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json(), None
    except requests.RequestException as exc:
        return None, f"MLB request failed: {exc}"
    except ValueError:
        return None, "MLB returned data that could not be read."



def get_scoring_game_states(
    result_date: date | str | None = None,
) -> dict[str, Any]:
    """
    Return MLB games that can currently produce batter results.

    Preview games are excluded. Live and completed games are included.
    """
    requested_date = _requested_date(result_date)

    payload, error = _request_json(
        MLB_SCHEDULE_URL,
        params={
            "sportId": 1,
            "date": requested_date,
        },
    )

    if error or payload is None:
        return {
            "success": False,
            "date": requested_date,
            "games": [],
            "error": error,
        }

    games: list[dict[str, Any]] = []

    for date_block in payload.get("dates", []):
        for game in date_block.get("games", []):
            game_pk = game.get("gamePk")
            status = game.get("status", {}) or {}
            abstract_state = str(
                status.get("abstractGameState") or ""
            ).strip().lower()
            detailed_state = str(
                status.get("detailedState") or ""
            ).strip()

            if not isinstance(game_pk, int):
                continue

            if abstract_state not in {"live", "final"}:
                continue

            games.append(
                {
                    "game_pk": game_pk,
                    "abstract_state": abstract_state,
                    "detailed_state": detailed_state,
                    "is_final": abstract_state == "final",
                    "is_live": abstract_state == "live",
                }
            )

    return {
        "success": True,
        "date": requested_date,
        "games": games,
        "error": None,
    }


def _read_game_batter_results(
    game: dict[str, Any],
) -> tuple[int, list[dict[str, Any]], str | None]:
    """Read current batter totals from one live or completed MLB game."""
    game_pk = int(game["game_pk"])

    if game.get("is_live"):
        payload, error = _request_json(
            MLB_LIVE_FEED_URL.format(game_pk=game_pk)
        )
        teams = (
            payload.get("liveData", {})
            .get("boxscore", {})
            .get("teams", {})
            if payload
            else {}
        )
    else:
        payload, error = _request_json(
            MLB_BOXSCORE_URL.format(game_pk=game_pk)
        )
        teams = payload.get("teams", {}) if payload else {}

    if error or payload is None:
        return game_pk, [], error or "Game data unavailable."

    players: list[dict[str, Any]] = []
    teams = teams or {}

    for side in ("away", "home"):
        side_players = (
            teams.get(side, {})
            .get("players", {})
            or {}
        )

        for player_record in side_players.values():
            person = player_record.get("person", {}) or {}
            player_id = person.get("id")
            batting = (
                player_record.get("stats", {})
                .get("batting", {})
                or {}
            )

            if not isinstance(player_id, int):
                continue

            players.append(
                {
                    "player_id": player_id,
                    "player_name": person.get(
                        "fullName",
                        "Unknown player",
                    ),
                    "game_pk": game_pk,
                    "game_state": game.get("abstract_state"),
                    "game_status": game.get("detailed_state"),
                    "game_finished": bool(game.get("is_final")),
                    "result_live": bool(game.get("is_live")),
                    "hits": int(batting.get("hits") or 0),
                    "home_runs": int(batting.get("homeRuns") or 0),
                    "total_bases": int(batting.get("totalBases") or 0),
                    "at_bats": int(batting.get("atBats") or 0),
                }
            )

    return game_pk, players, None


def get_live_batter_results(
    result_date: date | str | None = None,
    force_refresh: bool = False,
) -> dict[str, Any]:
    """
    Return current batting totals for live and completed games.

    Results are cached briefly so Home Runs, Hits, and Total Bases do not
    make three identical MLB API passes during one Streamlit render.
    """
    requested_date = _requested_date(result_date)
    cached = _LIVE_RESULTS_CACHE.get(requested_date)

    if (
        not force_refresh
        and cached is not None
        and monotonic() - cached[0] < LIVE_RESULTS_CACHE_SECONDS
    ):
        return cached[1]

    games_result = get_scoring_game_states(requested_date)

    if not games_result.get("success"):
        result = {
            "success": False,
            "date": requested_date,
            "by_player_id": {},
            "player_count": 0,
            "live_game_count": 0,
            "final_game_count": 0,
            "errors": [games_result.get("error")],
        }
        _LIVE_RESULTS_CACHE[requested_date] = (monotonic(), result)
        return result

    games = games_result.get("games", [])
    by_player_id: dict[int, dict[str, Any]] = {}
    errors: list[str] = []

    worker_count = min(8, max(len(games), 1))

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = {
            executor.submit(_read_game_batter_results, game): game
            for game in games
        }

        for future in as_completed(futures):
            game = futures[future]
            try:
                game_pk, player_rows, error = future.result()
            except Exception as exc:
                game_pk = game.get("game_pk")
                player_rows = []
                error = f"Unexpected box-score error: {exc}"

            if error:
                errors.append(f"Game {game_pk}: {error}")
                continue

            for row in player_rows:
                by_player_id[row["player_id"]] = row

    result = {
        "success": True,
        "date": requested_date,
        "by_player_id": by_player_id,
        "player_count": len(by_player_id),
        "live_game_count": sum(
            1 for game in games if game.get("is_live")
        ),
        "final_game_count": sum(
            1 for game in games if game.get("is_final")
        ),
        "errors": errors,
    }

    _LIVE_RESULTS_CACHE[requested_date] = (monotonic(), result)
    return result


def get_final_game_pks(
    result_date: date | str | None = None,
) -> dict[str, Any]:
    """Backward-compatible helper returning completed game IDs only."""
    games_result = get_scoring_game_states(result_date)

    if not games_result.get("success"):
        return {
            "success": False,
            "date": games_result.get("date"),
            "game_pks": [],
            "error": games_result.get("error"),
        }

    return {
        "success": True,
        "date": games_result.get("date"),
        "game_pks": [
            game["game_pk"]
            for game in games_result.get("games", [])
            if game.get("is_final")
        ],
        "error": None,
    }


def get_final_batter_results(
    result_date: date | str | None = None,
) -> dict[str, Any]:
    """Backward-compatible final-only view of current batter results."""
    live_results = get_live_batter_results(result_date)
    by_player_id = {
        player_id: row
        for player_id, row in live_results.get("by_player_id", {}).items()
        if row.get("game_finished")
    }

    return {
        **live_results,
        "by_player_id": by_player_id,
        "player_count": len(by_player_id),
    }



def _normalized_player_name(value: Any) -> str:
    """Normalize a player name for a safe live-result fallback match."""
    return " ".join(
        str(value or "")
        .replace(".", "")
        .replace("’", "'")
        .strip()
        .casefold()
        .split()
    )


def grade_top_25(
    rankings: list[dict[str, Any]],
    category: str,
    result_date: date | str | None = None,
    force_refresh: bool = False,
) -> dict[str, Any]:
    """
    Grade saved Top 25 Home Run, Hit, or Total Base predictions.

    Home Runs:
        Correct when the player recorded at least one home run.

    Hits:
        Correct when the player recorded at least one hit.

    Total Bases:
        Correct when the player recorded at least two total bases
        (the displayed recommendation is over 1.5 total bases).
    """
    normalized_category = str(category).strip().lower()

    if normalized_category not in {
        "home_runs",
        "hits",
        "total_bases",
    }:
        raise ValueError(
            "category must be 'home_runs', 'hits', or 'total_bases'"
        )

    results = get_live_batter_results(
        result_date,
        force_refresh=force_refresh,
    )
    result_lookup = results.get("by_player_id", {})
    result_name_lookup = {
        _normalized_player_name(row.get("player_name")): row
        for row in result_lookup.values()
        if _normalized_player_name(row.get("player_name"))
    }

    graded: list[dict[str, Any]] = []

    for prediction in rankings[:25]:
        player_id = prediction.get("player_id")
        actual = result_lookup.get(player_id)

        if actual is None:
            try:
                numeric_player_id = int(player_id)
            except (TypeError, ValueError):
                numeric_player_id = None

            if numeric_player_id is not None:
                actual = result_lookup.get(numeric_player_id)

        if actual is None:
            prediction_name = (
                prediction.get("player")
                or prediction.get("player_name")
                or ""
            )
            actual = result_name_lookup.get(
                _normalized_player_name(prediction_name)
            )

        game_finished = bool(
            actual and actual.get("game_finished")
        )
        result_live = bool(
            actual and actual.get("result_live")
        )

        actual_hits = (
            int(actual.get("hits", 0))
            if actual
            else 0
        )

        actual_home_runs = (
            int(actual.get("home_runs", 0))
            if actual
            else 0
        )

        actual_total_bases = (
            int(actual.get("total_bases", 0))
            if actual
            else 0
        )

        if normalized_category == "home_runs":
            threshold_met = actual_home_runs >= 1
            live_value = f"{actual_home_runs} HR"
            final_failure = "❌ 0 HR"

        elif normalized_category == "hits":
            threshold_met = actual_hits >= 1
            live_value = (
                f"{actual_hits} hit"
                if actual_hits == 1
                else f"{actual_hits} hits"
            )
            final_failure = "❌ 0 hits"

        else:
            threshold_met = actual_total_bases >= 2
            live_value = (
                f"{actual_total_bases} total base"
                if actual_total_bases == 1
                else f"{actual_total_bases} total bases"
            )
            final_failure = (
                f"❌ {actual_total_bases} total base"
                if actual_total_bases == 1
                else "❌ 0 total bases"
            )

        if result_live:
            # Never grade a live miss as a loss. A player can still reach
            # the target later in the game.
            correct = None
            result_label = (
                f"🟢 LIVE · ✅ {live_value}"
                if threshold_met
                else f"🟡 LIVE · {live_value}"
            )

        elif game_finished:
            correct = threshold_met
            result_label = (
                f"✅ {live_value}"
                if threshold_met
                else final_failure
            )

        else:
            correct = None
            result_label = "Game not started"

        graded.append(
            {
                **prediction,
                "actual_hits": actual_hits,
                "actual_home_runs": actual_home_runs,
                "actual_total_bases": actual_total_bases,
                "game_finished": game_finished,
                "result_live": result_live,
                "game_status": (
                    actual.get("game_status")
                    if actual
                    else None
                ),
                "correct": correct,
                "result_label": result_label,
            }
        )

    completed = [
        item
        for item in graded
        if item.get("correct") is not None
    ]

    correct_count = sum(
        1
        for item in completed
        if item.get("correct") is True
    )

    completed_count = len(completed)

    accuracy = (
        round(
            (correct_count / completed_count) * 100,
            1,
        )
        if completed_count
        else 0.0
    )

    return {
        "success": results.get("success", False),
        "date": results.get("date"),
        "category": normalized_category,
        "graded": graded,
        "prediction_count": len(graded),
        "completed_count": completed_count,
        "correct_count": correct_count,
        "accuracy": accuracy,
        "errors": results.get("errors", []),
    }
