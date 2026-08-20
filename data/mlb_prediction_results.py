from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
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

            away_team = (
                game.get("teams", {})
                .get("away", {})
                .get("team", {})
                or {}
            )
            home_team = (
                game.get("teams", {})
                .get("home", {})
                .get("team", {})
                or {}
            )

            games.append(
                {
                    "game_pk": game_pk,
                    "abstract_state": abstract_state,
                    "detailed_state": detailed_state,
                    "is_final": abstract_state == "final",
                    "is_live": abstract_state == "live",
                    "away_team_name": str(
                        away_team.get("name") or "Away"
                    ),
                    "home_team_name": str(
                        home_team.get("name") or "Home"
                    ),
                }
            )

    return {
        "success": True,
        "date": requested_date,
        "games": games,
        "error": None,
    }



def _is_statcast_barrel(
    exit_velocity: float | None,
    launch_angle: float | None,
) -> bool:
    """Apply the MLB Statcast barrel launch-speed/angle window."""
    if exit_velocity is None or launch_angle is None or exit_velocity < 98.0:
        return False

    mph_over_98 = min(exit_velocity - 98.0, 18.0)
    minimum_angle = max(8.0, 26.0 - mph_over_98)
    maximum_angle = min(50.0, 30.0 + (2.0 * mph_over_98))
    return minimum_angle <= launch_angle <= maximum_angle


def _live_contact_by_player(
    payload: dict[str, Any],
) -> dict[int, dict[str, Any]]:
    """Aggregate qualifying live batted-ball contact for every batter."""
    contact: dict[int, dict[str, Any]] = {}

    all_plays = (
        payload.get("liveData", {})
        .get("plays", {})
        .get("allPlays", [])
        or []
    )

    for play in all_plays:
        batter_id = (
            play.get("matchup", {})
            .get("batter", {})
            .get("id")
        )
        if not isinstance(batter_id, int):
            continue

        for event in play.get("playEvents", []) or []:
            hit_data = event.get("hitData") or {}

            try:
                exit_velocity = float(hit_data.get("launchSpeed"))
            except (TypeError, ValueError):
                continue

            try:
                launch_angle = (
                    float(hit_data.get("launchAngle"))
                    if hit_data.get("launchAngle") is not None
                    else None
                )
            except (TypeError, ValueError):
                launch_angle = None

            hard_hit = exit_velocity >= 95.0
            barrel = _is_statcast_barrel(
                exit_velocity,
                launch_angle,
            )

            if not hard_hit and not barrel:
                continue

            row = contact.setdefault(
                batter_id,
                {
                    "hard_hit_count": 0,
                    "barrel_count": 0,
                    "best_exit_velocity": 0.0,
                    "best_launch_angle": None,
                    "best_was_barrel": False,
                },
            )

            row["hard_hit_count"] += 1
            if barrel:
                row["barrel_count"] += 1

            if exit_velocity > float(
                row.get("best_exit_velocity") or 0.0
            ):
                row["best_exit_velocity"] = round(
                    exit_velocity,
                    1,
                )
                row["best_launch_angle"] = (
                    round(launch_angle, 1)
                    if launch_angle is not None
                    else None
                )
                row["best_was_barrel"] = barrel

    return contact

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
    live_contact = (
        _live_contact_by_player(payload)
        if game.get("is_live") and payload
        else {}
    )

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
                    "away_team_name": game.get(
                        "away_team_name",
                        "Away",
                    ),
                    "home_team_name": game.get(
                        "home_team_name",
                        "Home",
                    ),
                    "game_state": game.get("abstract_state"),
                    "game_status": game.get("detailed_state"),
                    "game_finished": bool(game.get("is_final")),
                    "result_live": bool(game.get("is_live")),
                    "hits": int(batting.get("hits") or 0),
                    "home_runs": int(batting.get("homeRuns") or 0),
                    "total_bases": int(batting.get("totalBases") or 0),
                    "runs": int(batting.get("runs") or 0),
                    "rbis": int(batting.get("rbi") or 0),
                    "walks": int(batting.get("baseOnBalls") or 0),
                    "stolen_bases": int(batting.get("stolenBases") or 0),
                    "at_bats": int(batting.get("atBats") or 0),
                    "live_contact": live_contact.get(player_id),
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


def _read_final_game_contact_results(
    game: dict[str, Any],
) -> tuple[int, list[dict[str, Any]], str | None]:
    """Read final-game batter totals plus archived batted-ball contact."""
    game_pk = int(game["game_pk"])
    payload, error = _request_json(
        MLB_LIVE_FEED_URL.format(game_pk=game_pk)
    )

    if error or payload is None:
        return game_pk, [], error or "Game feed unavailable."

    teams = (
        payload.get("liveData", {})
        .get("boxscore", {})
        .get("teams", {})
        or {}
    )
    contact = _live_contact_by_player(payload)
    players: list[dict[str, Any]] = []

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

            live_contact = contact.get(player_id)
            if not live_contact:
                continue

            players.append(
                {
                    "player_id": player_id,
                    "player_name": person.get(
                        "fullName",
                        "Unknown player",
                    ),
                    "game_pk": game_pk,
                    "away_team_name": game.get(
                        "away_team_name",
                        "Away",
                    ),
                    "home_team_name": game.get(
                        "home_team_name",
                        "Home",
                    ),
                    "home_runs": int(
                        batting.get("homeRuns") or 0
                    ),
                    "hard_hit_count": int(
                        live_contact.get("hard_hit_count") or 0
                    ),
                    "barrel_count": int(
                        live_contact.get("barrel_count") or 0
                    ),
                    "best_exit_velocity": float(
                        live_contact.get("best_exit_velocity") or 0.0
                    ),
                    "best_launch_angle": live_contact.get(
                        "best_launch_angle"
                    ),
                }
            )

    return game_pk, players, None


def get_yesterday_hr_near_misses(
    reference_date: date | None = None,
) -> dict[str, Any]:
    """
    Return yesterday's qualifying hard-contact hitters who finished with 0 HR.

    This is descriptive follow-up intelligence only. It does not imply that a
    player is due to homer today.
    """
    current = reference_date or datetime.now(
        TORONTO_TIMEZONE
    ).date()
    yesterday = current - timedelta(days=1)
    yesterday_key = yesterday.isoformat()

    games_result = get_scoring_game_states(yesterday_key)
    if not games_result.get("success"):
        return {
            "success": False,
            "date": yesterday_key,
            "signals": [],
            "signal_count": 0,
            "errors": [games_result.get("error")],
        }

    final_games = [
        game
        for game in games_result.get("games", [])
        if game.get("is_final")
    ]

    signals: list[dict[str, Any]] = []
    errors: list[str] = []
    worker_count = min(8, max(len(final_games), 1))

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = {
            executor.submit(
                _read_final_game_contact_results,
                game,
            ): game
            for game in final_games
        }

        for future in as_completed(futures):
            game = futures[future]
            try:
                game_pk, rows, error = future.result()
            except Exception as exc:
                game_pk = game.get("game_pk")
                rows = []
                error = (
                    "Unexpected archived contact error: "
                    f"{exc}"
                )

            if error:
                errors.append(f"Game {game_pk}: {error}")
                continue

            for row in rows:
                # Part 2 is specifically strong contact WITHOUT a home run.
                if int(row.get("home_runs") or 0) > 0:
                    continue

                barrels = int(row.get("barrel_count") or 0)
                best_ev = float(
                    row.get("best_exit_velocity") or 0.0
                )
                best_angle = row.get("best_launch_angle")

                try:
                    best_angle_value = float(best_angle)
                except (TypeError, ValueError):
                    best_angle_value = None

                hr_shaped_hard_contact = (
                    best_ev >= 100.0
                    and best_angle_value is not None
                    and 15.0 <= best_angle_value <= 40.0
                )

                if barrels == 0 and not hr_shaped_hard_contact:
                    continue

                signals.append(
                    {
                        **row,
                        "near_miss_type": (
                            "barrel"
                            if barrels > 0
                            else "hr_shaped_hard_contact"
                        ),
                    }
                )

    signals.sort(
        key=lambda item: (
            -int(item.get("barrel_count") or 0),
            -float(item.get("best_exit_velocity") or 0.0),
        )
    )

    return {
        "success": True,
        "date": yesterday_key,
        "signals": signals,
        "signal_count": len(signals),
        "errors": errors,
    }



def get_live_hr_contact_signals(
    result_date: date | str | None = None,
    force_refresh: bool = False,
) -> dict[str, Any]:
    """Return qualifying hard-contact signals from all hitters in live MLB games."""
    live_results = get_live_batter_results(
        result_date,
        force_refresh=force_refresh,
    )

    signals: list[dict[str, Any]] = []

    for row in live_results.get("by_player_id", {}).values():
        if not row.get("result_live"):
            continue

        # Live HR Intelligence is for hitters who are still searching for
        # today's first home run. Once a player homers, remove the signal.
        if int(row.get("home_runs") or 0) >= 1:
            continue

        contact = row.get("live_contact") or {}
        barrels = int(contact.get("barrel_count") or 0)
        hard_hits = int(contact.get("hard_hit_count") or 0)

        if barrels == 0 and hard_hits == 0:
            continue

        signals.append(
            {
                "player_id": row.get("player_id"),
                "player_name": row.get("player_name"),
                "away_team_name": row.get("away_team_name"),
                "home_team_name": row.get("home_team_name"),
                "home_runs": int(row.get("home_runs") or 0),
                "hard_hit_count": hard_hits,
                "barrel_count": barrels,
                "best_exit_velocity": float(
                    contact.get("best_exit_velocity") or 0.0
                ),
                "best_launch_angle": contact.get(
                    "best_launch_angle"
                ),
            }
        )

    signals.sort(
        key=lambda item: (
            -int(item.get("barrel_count") or 0),
            -float(item.get("best_exit_velocity") or 0.0),
        )
    )

    return {
        "success": bool(live_results.get("success")),
        "signals": signals,
        "signal_count": len(signals),
        "live_game_count": int(
            live_results.get("live_game_count") or 0
        ),
    }



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
        "runs",
        "rbis",
        "walks",
        "stolen_bases",
        "hits_runs_rbis",
    }:
        raise ValueError("Unsupported MLB prop category")

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
        actual_runs = int(actual.get("runs", 0)) if actual else 0
        actual_rbis = int(actual.get("rbis", 0)) if actual else 0
        actual_walks = int(actual.get("walks", 0)) if actual else 0
        actual_stolen_bases = int(actual.get("stolen_bases", 0)) if actual else 0
        actual_hits_runs_rbis = actual_hits + actual_runs + actual_rbis
        live_contact = actual.get("live_contact") if actual else None

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

        elif normalized_category == "total_bases":
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
        elif normalized_category == "runs":
            threshold_met = actual_runs >= 1
            live_value = f"{actual_runs} run" if actual_runs == 1 else f"{actual_runs} runs"
            final_failure = "❌ 0 runs"
        elif normalized_category == "rbis":
            threshold_met = actual_rbis >= 1
            live_value = f"{actual_rbis} RBI" if actual_rbis == 1 else f"{actual_rbis} RBIs"
            final_failure = "❌ 0 RBIs"
        elif normalized_category == "walks":
            threshold_met = actual_walks >= 1
            live_value = f"{actual_walks} walk" if actual_walks == 1 else f"{actual_walks} walks"
            final_failure = "❌ 0 walks"
        elif normalized_category == "stolen_bases":
            threshold_met = actual_stolen_bases >= 1
            live_value = (
                f"{actual_stolen_bases} stolen base"
                if actual_stolen_bases == 1
                else f"{actual_stolen_bases} stolen bases"
            )
            final_failure = "❌ 0 stolen bases"

        else:
            threshold_met = actual_hits_runs_rbis >= 2
            live_value = f"{actual_hits_runs_rbis} H+R+RBI"
            final_failure = (
                f"❌ {actual_hits_runs_rbis} H+R+RBI"
                if actual_hits_runs_rbis
                else "❌ 0 H+R+RBI"
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

        contact_label = ""
        if (
            normalized_category == "home_runs"
            and result_live
            and actual_home_runs == 0
            and live_contact
        ):
            ev = live_contact.get("best_exit_velocity")
            angle = live_contact.get("best_launch_angle")
            angle_text = (
                f" · {angle:.0f}°"
                if isinstance(angle, (int, float))
                else ""
            )
            if int(live_contact.get("barrel_count") or 0) > 0:
                contact_label = f"🔥 STILL ALIVE · BARREL {ev:.1f} mph{angle_text}"
            elif int(live_contact.get("hard_hit_count") or 0) > 0:
                contact_label = f"💥 HARD HIT · {ev:.1f} mph{angle_text}"

        graded.append(
            {
                **prediction,
                "actual_hits": actual_hits,
                "actual_home_runs": actual_home_runs,
                "actual_total_bases": actual_total_bases,
                "actual_runs": actual_runs,
                "actual_rbis": actual_rbis,
                "actual_walks": actual_walks,
                "actual_stolen_bases": actual_stolen_bases,
                "actual_hits_runs_rbis": actual_hits_runs_rbis,
                "game_finished": game_finished,
                "result_live": result_live,
                "game_status": (
                    actual.get("game_status")
                    if actual
                    else None
                ),
                "correct": correct,
                "result_label": result_label,
                "live_contact": live_contact,
                "live_contact_label": contact_label,
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
