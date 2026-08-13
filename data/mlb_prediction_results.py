from __future__ import annotations

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import requests


MLB_SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule"
MLB_BOXSCORE_URL = (
    "https://statsapi.mlb.com/api/v1/game/{game_pk}/boxscore"
)

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
REQUEST_TIMEOUT_SECONDS = 20


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


def get_final_game_pks(
    result_date: date | str | None = None,
) -> dict[str, Any]:
    """Return completed MLB game IDs for one date."""
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
            "game_pks": [],
            "error": error,
        }

    game_pks: list[int] = []

    for date_block in payload.get("dates", []):
        for game in date_block.get("games", []):
            status = (
                game.get("status", {})
                .get("abstractGameState", "")
            )

            game_pk = game.get("gamePk")

            if (
                str(status).lower() == "final"
                and isinstance(game_pk, int)
            ):
                game_pks.append(game_pk)

    return {
        "success": True,
        "date": requested_date,
        "game_pks": game_pks,
        "error": None,
    }


def get_final_batter_results(
    result_date: date | str | None = None,
) -> dict[str, Any]:
    """
    Return final hitting totals by MLB player ID.

    Only completed games are included.
    """
    games_result = get_final_game_pks(result_date)

    if not games_result.get("success"):
        return {
            "success": False,
            "date": games_result.get("date"),
            "by_player_id": {},
            "player_count": 0,
            "errors": [games_result.get("error")],
        }

    by_player_id: dict[int, dict[str, Any]] = {}
    errors: list[str] = []

    for game_pk in games_result.get("game_pks", []):
        payload, error = _request_json(
            MLB_BOXSCORE_URL.format(game_pk=game_pk)
        )

        if error or payload is None:
            errors.append(
                f"Game {game_pk}: "
                f"{error or 'Box score unavailable.'}"
            )
            continue

        teams = payload.get("teams", {})

        for side in ("away", "home"):
            players = (
                teams.get(side, {})
                .get("players", {})
            )

            for player_record in players.values():
                person = player_record.get("person", {})
                player_id = person.get("id")

                batting = (
                    player_record.get("stats", {})
                    .get("batting", {})
                )

                if not isinstance(player_id, int):
                    continue

                hits = int(batting.get("hits") or 0)

                home_runs = int(
                    batting.get("homeRuns") or 0
                )

                total_bases = int(
                    batting.get("totalBases") or 0
                )

                at_bats = int(
                    batting.get("atBats") or 0
                )

                existing = by_player_id.get(
                    player_id,
                    {
                        "player_id": player_id,
                        "player_name": person.get(
                            "fullName",
                            "Unknown player",
                        ),
                        "hits": 0,
                        "home_runs": 0,
                        "total_bases": 0,
                        "at_bats": 0,
                    },
                )
                
                existing["hits"] += hits
                existing["home_runs"] += home_runs
                existing["total_bases"] += total_bases
                existing["at_bats"] += at_bats

                by_player_id[player_id] = existing

    return {
        "success": bool(by_player_id),
        "date": games_result.get("date"),
        "by_player_id": by_player_id,
        "player_count": len(by_player_id),
        "errors": errors,
    }


def grade_top_25(
    rankings: list[dict[str, Any]],
    category: str,
    result_date: date | str | None = None,
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

    results = get_final_batter_results(result_date)
    result_lookup = results.get("by_player_id", {})

    graded: list[dict[str, Any]] = []

    for prediction in rankings[:25]:
        player_id = prediction.get("player_id")
        actual = result_lookup.get(player_id)

        game_finished = actual is not None

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

        if not game_finished:
            correct = None
            result_label = "Game not final"

        elif normalized_category == "home_runs":
            correct = actual_home_runs >= 1
            result_label = (
                f"✅ {actual_home_runs} HR"
                if correct
                else "❌ 0 HR"
            )

         elif normalized_category == "hits":
            correct = actual_hits >= 1
            result_label = (
                f"✅ {actual_hits} hit"
                if actual_hits == 1
                else (
                    f"✅ {actual_hits} hits"
                    if correct
                    else "❌ 0 hits"
                )
            )

        else:
            correct = actual_total_bases >= 2
            result_label = (
                f"❌ {actual_total_bases} total base"
                if actual_total_bases == 1
                else (
                    f"✅ {actual_total_bases} total bases"
                    if correct
                    else "❌ 0 total bases"
                )
            )

        graded.append(        

        graded.append(
            {
                **prediction,
                "actual_hits": actual_hits,
                "actual_home_runs": actual_home_runs,
                "actual_total_bases": actual_total_bases,
                "game_finished": game_finished,
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
