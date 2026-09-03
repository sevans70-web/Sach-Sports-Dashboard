"""Mobile-first MLB pitcher rankings with durable movement snapshots."""

from __future__ import annotations

import re
import json
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor

from datetime import datetime
from html import escape
import os
from zoneinfo import ZoneInfo
import streamlit as st

from engines.mlb_pitcher_intelligence import get_pitcher_rankings
from database.mlb_dashboard_reads import load_pitcher_rankings_from_supabase
from data.mlb_pitcher_results import get_pitcher_game_result
from data.mlb_prediction_results import get_scoring_game_states
from data.mlb_players import get_player_headshot_url
from Utils.intraday_rankings import (
    GitHubSnapshotConfig,
    RankingSnapshotError,
    load_compare_and_save,
    load_compare_and_save_local,
)

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")


CATEGORY_CONFIG = {
    "strikeouts": ("🎯 Strikeouts", "K"),
    "outs_recorded": ("⏱️ Outs", "outs"),
    "hits_allowed": ("⚾ Hits Allowed", "hits"),
    "walks_allowed": ("◉ Walks Allowed", "BB"),
    "earned_runs": ("● Earned Runs", "ER"),
}

# Pitcher rankings are expensive because MLB schedule, season-stat and platoon
# feeds all have to be combined. Never make a Streamlit navigation click wait
# synchronously for those feeds.
_PITCHER_EXECUTOR = ThreadPoolExecutor(
    max_workers=1,
    thread_name_prefix="mlb-pitcher-refresh",
)
_PITCHER_LOCK = threading.Lock()
_PITCHER_FUTURE: Future | None = None
_PITCHER_FUTURE_STARTED_AT = 0.0
_PITCHER_SNAPSHOT: dict | None = None
_PITCHER_SNAPSHOT_AT = 0.0
_PITCHER_SNAPSHOT_TTL_SECONDS = 300
_PITCHER_MAX_WAIT_SECONDS = 35
_PITCHER_SNAPSHOT_PATH = "/tmp/sach_mlb_pitcher_rankings_snapshot.json"


def _read_runtime_pitcher_snapshot() -> dict | None:
    """Reuse the last successful snapshot in this Streamlit process."""
    global _PITCHER_SNAPSHOT, _PITCHER_SNAPSHOT_AT

    if _PITCHER_SNAPSHOT:
        return _PITCHER_SNAPSHOT

    try:
        with open(_PITCHER_SNAPSHOT_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        result = payload.get("result") if isinstance(payload, dict) else None
        saved_at = float(payload.get("saved_at") or 0) if isinstance(payload, dict) else 0
        if isinstance(result, dict) and result.get("success"):
            _PITCHER_SNAPSHOT = result
            _PITCHER_SNAPSHOT_AT = saved_at
            return result
    except Exception:
        pass

    return None


def _save_runtime_pitcher_snapshot(result: dict) -> None:
    """Keep successful pitcher rankings local to the running app."""
    global _PITCHER_SNAPSHOT, _PITCHER_SNAPSHOT_AT

    now = time.time()
    _PITCHER_SNAPSHOT = result
    _PITCHER_SNAPSHOT_AT = now

    try:
        with open(_PITCHER_SNAPSHOT_PATH, "w", encoding="utf-8") as handle:
            json.dump(
                {"saved_at": now, "result": result},
                handle,
                ensure_ascii=False,
                separators=(",", ":"),
            )
    except Exception:
        # Runtime snapshot persistence is an optimization only.
        pass


def _background_pitcher_job(limit: int) -> dict:
    """Plain Python worker; never calls Streamlit APIs."""
    return get_pitcher_rankings(limit=limit)


def _ensure_pitcher_refresh(limit: int = 25, *, force: bool = False) -> Future | None:
    """
    Start one background refresh at most.

    The caller returns immediately. A slow MLB endpoint therefore cannot hold
    the entire Streamlit page on a white loading screen.
    """
    global _PITCHER_FUTURE, _PITCHER_FUTURE_STARTED_AT

    with _PITCHER_LOCK:
        if _PITCHER_FUTURE is not None and not _PITCHER_FUTURE.done():
            return _PITCHER_FUTURE

        snapshot = _read_runtime_pitcher_snapshot()
        snapshot_is_fresh = bool(
            snapshot
            and _PITCHER_SNAPSHOT_AT
            and (time.time() - _PITCHER_SNAPSHOT_AT) < _PITCHER_SNAPSHOT_TTL_SECONDS
        )

        if snapshot_is_fresh and not force:
            return None

        _PITCHER_FUTURE = _PITCHER_EXECUTOR.submit(
            _background_pitcher_job,
            max(1, int(limit)),
        )
        _PITCHER_FUTURE_STARTED_AT = time.time()
        return _PITCHER_FUTURE


def _collect_pitcher_refresh() -> tuple[dict | None, str | None, bool]:
    """
    Return (snapshot, error, refreshing) without blocking on Future.result().
    """
    global _PITCHER_FUTURE, _PITCHER_FUTURE_STARTED_AT

    snapshot = _read_runtime_pitcher_snapshot()
    future = _PITCHER_FUTURE

    if future is None:
        return snapshot, None, False

    if not future.done():
        waited = max(0.0, time.time() - _PITCHER_FUTURE_STARTED_AT)
        if waited >= _PITCHER_MAX_WAIT_SECONDS:
            return (
                snapshot,
                "Pitcher data is taking longer than expected. "
                "The dashboard is still responsive and will keep the last "
                "successful snapshot instead of blocking the page.",
                True,
            )
        return snapshot, None, True

    try:
        result = future.result(timeout=0)
        if isinstance(result, dict) and result.get("success"):
            _save_runtime_pitcher_snapshot(result)
            snapshot = result
            error = None
        else:
            messages = result.get("errors", []) if isinstance(result, dict) else []
            error = (
                "; ".join(str(item) for item in messages if item)
                or "Pitcher rankings were unavailable from the MLB data feeds."
            )
    except Exception as exc:
        error = f"Pitcher refresh failed: {exc}"
    finally:
        with _PITCHER_LOCK:
            _PITCHER_FUTURE = None
            _PITCHER_FUTURE_STARTED_AT = 0.0

    return snapshot, error, False


def _render_html(html: str) -> None:
    """Render compact HTML as one line so Streamlit never exposes raw tags."""
    clean = " ".join(line.strip() for line in html.splitlines() if line.strip())
    st.markdown(clean, unsafe_allow_html=True)


def _token() -> str | None:
    token = os.getenv("SACH_GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN")
    if token:
        return token
    try:
        return (
            st.secrets.get("SACH_GITHUB_TOKEN")
            or st.secrets.get("GITHUB_TOKEN")
        )
    except Exception:
        return None


def _normalized_rankings(rankings: dict[str, list[dict]]) -> dict[str, list[dict]]:
    normalized = {}
    for category, rows in rankings.items():
        normalized[category] = []
        for row in rows:
            normalized[category].append({
                **row,
                "player_id": row.get("pitcher_id"),
                "player": row.get("pitcher_name") or "Pitcher",
                "team": row.get("team_name") or "",
                "team_id": row.get("team_id"),
                "opponent": row.get("opponent_name") or "",
                "opponent_id": row.get("opponent_id"),
                "score": row.get("gi_score"),
            })
    return normalized


def _attach_persistent_movement(rankings: dict[str, list[dict]]) -> dict[str, list[dict]]:
    """Preserve Supabase movement and add a session-only fallback.

    The previous implementation read ``current``/``previous`` keys that are not
    returned by ``load_compare_and_save_local``. That turned a valid 25-row
    Supabase payload into an empty dict, which is why the pitcher tabs rendered
    as blank even though the Railway worker had saved 25 pitchers per market.

    Supabase movement is authoritative. The session baseline is used only when a
    row has no durable movement yet. No ranking rows are ever discarded here.
    """
    previous = st.session_state.get("mlb_pitcher_previous_rankings", {})
    merged: dict[str, list[dict]] = {}

    for category, rows in (rankings or {}).items():
        old_rows = previous.get(category, []) if isinstance(previous, dict) else []
        old_map = {
            str(row.get("pitcher_id") or row.get("pitcher_name") or ""): int(row.get("rank") or 0)
            for row in old_rows
            if isinstance(row, dict)
        }

        category_rows: list[dict] = []
        for row in rows or []:
            item = dict(row)
            existing = item.get("movement") or {}
            status = str(existing.get("status") or "").lower()

            if status not in {"new", "up", "down", "same", "unchanged"}:
                key = str(item.get("pitcher_id") or item.get("pitcher_name") or "")
                current_rank = int(item.get("rank") or 0)
                previous_rank = old_map.get(key)
                if previous_rank is None:
                    existing = {"status": "new", "previous": None, "current": current_rank}
                elif previous_rank > current_rank:
                    existing = {"status": "up", "previous": previous_rank, "current": current_rank}
                elif previous_rank < current_rank:
                    existing = {"status": "down", "previous": previous_rank, "current": current_rank}
                else:
                    existing = {"status": "same", "previous": previous_rank, "current": current_rank}
                item["movement"] = existing

            category_rows.append(item)

        merged[category] = category_rows

    st.session_state["mlb_pitcher_previous_rankings"] = {
        category: [dict(row) for row in rows]
        for category, rows in merged.items()
    }
    return merged


def _movement_label(row: dict) -> str:
    movement = row.get("movement", {}) or {}
    status = str(movement.get("status") or "").lower()
    old = movement.get("previous")
    current = movement.get("current")
    if status == "new":
        return "NEW"
    if status == "up" and old and current:
        return f"↑ {old}→{current}"
    if status == "down" and old and current:
        return f"↓ {old}→{current}"
    return "—"


def _headshot_html(row: dict) -> str:
    """Use the stable MLB player-id headshot path; initials if no ID exists."""
    pitcher_id = int(row.get("pitcher_id") or 0)
    name = str(row.get("pitcher_name") or "Pitcher")
    initials = "".join(part[0] for part in name.split()[:2]).upper() or "P"

    if pitcher_id:
        url = str(
            get_player_headshot_url(pitcher_id)
            or row.get("headshot_url")
            or ""
        ).strip()
        return (
            f'<img class="pitcher-headshot" src="{escape(url)}" '
            f'alt="{escape(name)} headshot" loading="lazy" '
            f'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\';">'
            f'<span class="pitcher-photo-fallback" style="display:none">{escape(initials)}</span>'
        )

    return f'<span class="pitcher-photo-fallback">{escape(initials)}</span>'


MLB_TEAM_IDS = {
    "Los Angeles Angels":108,"Arizona Diamondbacks":109,"Baltimore Orioles":110,
    "Boston Red Sox":111,"Chicago Cubs":112,"Cincinnati Reds":113,
    "Cleveland Guardians":114,"Colorado Rockies":115,"Detroit Tigers":116,
    "Houston Astros":117,"Kansas City Royals":118,"Los Angeles Dodgers":119,
    "Washington Nationals":120,"New York Mets":121,"Athletics":133,
    "Pittsburgh Pirates":134,"San Diego Padres":135,"Seattle Mariners":136,
    "San Francisco Giants":137,"St. Louis Cardinals":138,"Tampa Bay Rays":139,
    "Texas Rangers":140,"Toronto Blue Jays":141,"Minnesota Twins":142,
    "Philadelphia Phillies":143,"Atlanta Braves":144,"Chicago White Sox":145,
    "Miami Marlins":146,"New York Yankees":147,"Milwaukee Brewers":158,
}


def _short_team(value: str) -> str:
    teams = {
        "Arizona Diamondbacks": "ARI", "Athletics": "ATH",
        "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL",
        "Boston Red Sox": "BOS", "Chicago Cubs": "CHC",
        "Chicago White Sox": "CWS", "Cincinnati Reds": "CIN",
        "Cleveland Guardians": "CLE", "Colorado Rockies": "COL",
        "Detroit Tigers": "DET", "Houston Astros": "HOU",
        "Kansas City Royals": "KC", "Los Angeles Angels": "LAA",
        "Los Angeles Dodgers": "LAD", "Miami Marlins": "MIA",
        "Milwaukee Brewers": "MIL", "Minnesota Twins": "MIN",
        "New York Mets": "NYM", "New York Yankees": "NYY",
        "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT",
        "San Diego Padres": "SD", "San Francisco Giants": "SF",
        "Seattle Mariners": "SEA", "St. Louis Cardinals": "STL",
        "Tampa Bay Rays": "TB", "Texas Rangers": "TEX",
        "Toronto Blue Jays": "TOR", "Washington Nationals": "WSH",
    }
    value = str(value or "").strip()
    return teams.get(value, value)


def _team_logo(team_id: object, team_name: str) -> str:
    try:
        numeric_id = int(team_id or 0)
    except (TypeError, ValueError):
        numeric_id = 0
    if not numeric_id:
        numeric_id = int(MLB_TEAM_IDS.get(str(team_name or "").strip()) or 0)
    if not numeric_id:
        return ""
    return (
        f'<img class="pitcher-team-logo" '
        f'src="https://www.mlbstatic.com/team-logos/{numeric_id}.svg" '
        f'alt="{escape(_short_team(team_name))} logo" loading="lazy">'
    )


def _matchup_html(row: dict) -> str:
    team = str(row.get("team_name") or "TBD")
    opponent = str(row.get("opponent_name") or "TBD")
    if row.get("is_home") is True:
        away_name, away_id = opponent, row.get("opponent_id")
        home_name, home_id = team, row.get("team_id")
    else:
        away_name, away_id = team, row.get("team_id")
        home_name, home_id = opponent, row.get("opponent_id")

    return (
        f'{_team_logo(away_id, away_name)}'
        f'<span>{escape(_short_team(away_name))}</span>'
        f'<span class="pitcher-vs">vs.</span>'
        f'{_team_logo(home_id, home_name)}'
        f'<span>{escape(_short_team(home_name))}</span>'
    )


def _projection_text(category: str, row: dict) -> str:
    return f"{float(row.get('projection') or 0):.1f} {CATEGORY_CONFIG[category][1]}"


@st.cache_data(ttl=60, show_spinner=False)
def _cached_pitcher_game_result(game_pk: int, pitcher_id: int) -> dict:
    return get_pitcher_game_result(game_pk=game_pk, pitcher_id=pitcher_id)


@st.cache_data(ttl=60, show_spinner=False)
def _pitcher_game_phase_lookup() -> dict[int, str]:
    """Use one schedule-status call to avoid opening every pregame live feed."""
    result = get_scoring_game_states(datetime.now(TORONTO_TIMEZONE).date())
    lookup: dict[int, str] = {}
    for game in result.get("games", []) or []:
        game_pk = int(game.get("game_pk") or 0)
        if not game_pk:
            continue
        if game.get("is_final"):
            lookup[game_pk] = "final"
        elif game.get("is_live"):
            lookup[game_pk] = "live"
        else:
            lookup[game_pk] = "pregame"
    return lookup


def _pitcher_result(row: dict) -> dict:
    game_pk = int(row.get("game_pk") or 0)
    pitcher_id = int(row.get("pitcher_id") or 0)
    if not game_pk or not pitcher_id:
        return {"game_phase":"pregame","result_available":False}

    phase = _pitcher_game_phase_lookup().get(game_pk, "pregame")
    if phase == "pregame":
        return {
            "game_phase": "pregame",
            "game_live": False,
            "game_finished": False,
            "result_available": False,
        }

    return _cached_pitcher_game_result(game_pk, pitcher_id)


def _result_value(category: str, result: dict) -> str:
    if not result.get("result_available"):
        return ""
    values = {
        "strikeouts": (result.get("actual_strikeouts"), "K"),
        "outs_recorded": (result.get("actual_outs_recorded"), "outs"),
        "hits_allowed": (result.get("actual_hits_allowed"), "H"),
        "walks_allowed": (result.get("actual_walks_allowed"), "BB"),
        "earned_runs": (result.get("actual_earned_runs"), "ER"),
    }
    value, unit = values.get(category, ("", ""))
    if value in (None, ""):
        return ""
    return f"{value} {unit}"


def _result_line(category: str, row: dict, result: dict) -> str:
    """Mirror batter-card grading: LIVE shows the value; FINAL shows ✅/❌."""
    value = _result_value(category, result)
    if not value:
        return ""

    phase = str(result.get("game_phase") or "").lower()
    if phase != "final" and not result.get("game_finished"):
        return f"Result: {value}"

    try:
        projection = float(row.get("projection") or 0)
        actual_map = {
            "strikeouts": result.get("actual_strikeouts"),
            "outs_recorded": result.get("actual_outs_recorded"),
            "hits_allowed": result.get("actual_hits_allowed"),
            "walks_allowed": result.get("actual_walks_allowed"),
            "earned_runs": result.get("actual_earned_runs"),
        }
        actual = float(actual_map.get(category))
        hit = abs(actual - projection) <= 1.0
    except (TypeError, ValueError):
        hit = False

    mark = "✅" if hit else "❌"
    return f"Result: {mark} {value}"


def _render_pitcher_intelligence(category: str, row: dict) -> None:
    season = row.get("season_stats", {}) or {}
    _render_html(
        "<div class='pitch-intel-summary'>"
        f"<div><span>GI Score</span><b>{float(row.get('gi_score') or 0):.1f}</b></div>"
        f"<div><span>Projection</span><b>{escape(_projection_text(category,row))}</b></div>"
        f"<div><span>Benchmark</span><b>{float(row.get('benchmark_probability') or 0):.0f}%</b></div>"
        "</div>"
    )

    with st.expander("Performance Evidence", expanded=False):
        _render_html(
            "<div class='pitch-evidence-grid'>"
            f"<div><span>K/9</span><b>{float(row.get('k9') or 0):.1f}</b></div>"
            f"<div><span>H/9</span><b>{float(row.get('h9') or 0):.1f}</b></div>"
            f"<div><span>BB/9</span><b>{float(row.get('bb9') or 0):.1f}</b></div>"
            f"<div><span>Matchup ERA</span><b>{float(row.get('era_matchup') or 0):.2f}</b></div>"
            f"<div><span>Reliability</span><b>{float(row.get('reliability') or 0)*100:.0f}%</b></div>"
            f"<div><span>Starts</span><b>{int(season.get('games_started') or 0)}</b></div>"
            "</div>"
        )

    with st.expander("Why This Pitcher Ranks Here", expanded=False):
        reason = str(row.get("why") or "Pitcher profile is being evaluated.")
        st.write(f"• {reason}")
        game_result = _pitcher_result(row)
        phase = str(game_result.get("game_phase") or "").lower()
        if phase == "live":
            value = _result_value(category, game_result)
            if value:
                st.write(f"• Live result: {value}.")
        elif phase == "final":
            value = _result_value(category, game_result)
            if value:
                st.write(f"• Final result: {value}.")
        elif row.get("lineup_context_confirmed"):
            st.write("• Confirmed opponent lineup is included in the matchup weighting.")
        elif row.get("lineup_context_projected"):
            st.write("• Projected opponent lineup is included in the matchup weighting until the official order posts.")
        if row.get("venue"):
            st.write(f"• Venue: {row.get('venue')}.")


def _compact_pitcher_reason(row: dict, game_phase: str) -> str:
    """Remove stale lineup wording from LIVE / FINAL compact cards."""
    reason = str(row.get("why") or "").strip()
    if game_phase not in {"live", "final"}:
        return reason

    reason = re.sub(
        r"\s*(?:Confirmed|Projected) opponent lineup\s*:[^.;]*[.;]?",
        "",
        reason,
        flags=re.IGNORECASE,
    ).strip()
    reason = re.sub(
        r"\s*(?:Confirmed|Projected) opponent lineup[^.]*\.?",
        "",
        reason,
        flags=re.IGNORECASE,
    ).strip()
    return reason.rstrip(" ·;/,")


def _render_pitcher_card(category: str, row: dict) -> None:
    rank = int(row.get("rank") or 0)
    name = str(row.get("pitcher_name") or "Pitcher")
    score = float(row.get("gi_score") or 0)
    hand = str(row.get("pitcher_hand") or "")
    confirmed = bool(row.get("lineup_context_confirmed"))
    projected = bool(row.get("lineup_context_projected"))
    game_result = _pitcher_result(row)
    game_phase = str(game_result.get("game_phase") or "").lower()
    result_line = _result_line(category, row, game_result)
    reason = _compact_pitcher_reason(row, game_phase)

    if game_phase == "live":
        lineup = "LIVE"
        lineup_class = "pitch-game-live"
    elif game_phase == "final":
        lineup = "FINAL"
        lineup_class = "pitch-game-final"
    elif confirmed:
        lineup = "✓ Confirmed lineup"
        lineup_class = "pitch-lineup-confirmed"
    elif projected:
        lineup = "○ Projected lineup"
        lineup_class = "pitch-lineup-projected"
    else:
        lineup = "○ Opponent lineup unavailable"
        lineup_class = "pitch-lineup-unavailable"

    state_key = f"pitcher_intelligence_{category}_{row.get('pitcher_id')}_{rank}"
    if state_key not in st.session_state:
        st.session_state[state_key] = False

    with st.container(border=True, key=f"pitcher_card_{category}_{row.get('pitcher_id')}_{rank}"):
        _render_html(
            f"""
            <div class="pitcher-card-main">
                <div class="pitcher-rank"><strong>#{rank}</strong><small>{escape(_movement_label(row))}</small></div>
                <div class="pitcher-photo">{_headshot_html(row)}</div>
                <div class="pitcher-copy">
                    <strong>{escape(name)}</strong>
                    <span class="pitcher-matchup">{_matchup_html(row)}{escape(f' · {hand}HP' if hand else '')}</span>
                    <span class="pitcher-projection"><b>Projection:</b> {escape(_projection_text(category,row))}</span>
                    <span class="pitcher-reason">{escape(reason)}</span>
                    <div class="pitcher-state-result">
                        <em class="{lineup_class}">{escape(lineup)}</em>
                        <span class="pitcher-card-result{'' if result_line else ' pitcher-result-placeholder'}">{escape(result_line or 'Result: —')}</span>
                    </div>
                </div>
                <div class="pitcher-score"><small>GI SCORE</small><strong>{score:.1f}</strong></div>
            </div>
            """
        )

        if st.button(
            "ⓘ Hide Intelligence" if st.session_state[state_key] else "ⓘ View Intelligence",
            key=f"{state_key}_button",
            use_container_width=True,
        ):
            st.session_state[state_key] = not st.session_state[state_key]

        if st.session_state[state_key]:
            _render_pitcher_intelligence(category, row)


def _toggle_pitcher_list(key: str) -> None:
    st.session_state[key] = not bool(st.session_state.get(key, False))


def _render_category(category: str, rows: list[dict]) -> None:
    st.markdown(f"### {CATEGORY_CONFIG[category][0]}")
    st.caption(
        "Ranked by pitcher GI score using workload, season rates, sample reliability, "
        "matchup and opponent handedness."
    )

    if not rows:
        st.caption("No probable pitchers with usable season data are available yet.")
        return

    for row in rows[:5]:
        _render_pitcher_card(category, row)

    state_key = f"show_pitcher_{category}_25"
    if state_key not in st.session_state:
        st.session_state[state_key] = False

    st.button(
        "Show Top 5 Only" if st.session_state[state_key] else "View Full Top 25",
        key=f"toggle_pitcher_{category}_25",
        use_container_width=True,
        on_click=_toggle_pitcher_list,
        args=(state_key,),
    )

    if st.session_state.get(state_key, False):
        for row in rows[5:]:
            _render_pitcher_card(category, row)


def render_pitcher_rankings() -> None:
    st.markdown(
        """
        <style>
        /* PITCHER TOP-25 = EXACT BATTER CARD GEOMETRY, GOLD ROLE ACCENT */
        div[class*="st-key-pitcher_card_"]{
            border-left:5px solid #d6b35c!important;
            border-radius:16px!important;
        }

        div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlockBorderWrapper"]{
            background:#101112!important;
            border:2px solid #3a3d42!important;
            border-left:5px solid #d6b35c!important;
            border-radius:16px!important;
            overflow:hidden!important;
        }

        div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlock"]{
            gap:.12rem!important;
        }

        .pitcher-card-main{
            display:grid!important;
            grid-template-columns:38px 54px minmax(0,1fr) 54px!important;
            gap:7px!important;
            align-items:start!important;
            min-width:0!important;
            padding:5px 1px 2px!important;
        }

        .pitcher-rank{
            text-align:center!important;
            min-width:0!important;
            padding-top:5px!important;
            font-size:.92rem!important;
            line-height:1!important;
        }
        .pitcher-rank strong{
            display:block!important;
            color:#19d978!important;
            font-size:.92rem!important;
            font-weight:900!important;
            line-height:1!important;
        }
        .pitcher-rank small{
            display:block!important;
            color:#f6c84c!important;
            margin-top:5px!important;
            font-size:.55rem!important;
            line-height:1!important;
            font-weight:900!important;
            white-space:nowrap!important;
        }

        /* SAME circle dimensions/ring system as batter. */
        .pitcher-photo{
            width:52px!important;
            height:52px!important;
            min-width:52px!important;
            min-height:52px!important;
            max-width:52px!important;
            max-height:52px!important;
            border-radius:50%!important;
            border:2px solid rgba(214,179,92,.86)!important;
            overflow:hidden!important;
            background:#080909!important;
            display:grid!important;
            place-items:center!important;
        }

        /* Important: contain the MLB headshot instead of cropping it.
           This is the face/chin correction. */
        .pitcher-headshot{
            display:block!important;
            width:100%!important;
            height:100%!important;
            object-fit:contain!important;
            object-position:center center!important;
            transform:scale(.90) translateY(-2%)!important;
            transform-origin:center center!important;
            border-radius:50%!important;
            background:#080909!important;
        }

        .pitcher-photo-fallback{
            width:100%!important;
            height:100%!important;
            display:grid!important;
            place-items:center!important;
            border-radius:50%!important;
            color:#fff!important;
            font-size:.82rem!important;
            font-weight:900!important;
            background:#080909!important;
        }

        .pitcher-copy{
            min-width:0!important;
            display:grid!important;
            gap:1px!important;
            align-self:start!important;
            overflow:hidden!important;
        }
        .pitcher-copy>strong{
            color:#fff!important;
            font-size:.92rem!important;
            font-weight:900!important;
            line-height:1.08!important;
            margin-bottom:1px!important;
            overflow-wrap:anywhere!important;
        }
        .pitcher-copy>span{
            color:#d0d2d5!important;
            font-size:.69rem!important;
            line-height:1.18!important;
            overflow-wrap:anywhere!important;
        }
        .pitcher-matchup{
            display:flex!important;
            align-items:center!important;
            gap:5px!important;
            min-width:0!important;
            white-space:nowrap!important;
            overflow:hidden!important;
            text-overflow:ellipsis!important;
        }
        .pitcher-team-logo{
            width:19px!important;height:19px!important;
            object-fit:contain!important;flex:0 0 19px!important;
        }
        .pitcher-vs{color:#a7abb2!important;font-weight:700!important}
        .pitcher-projection b{color:#f6c84c!important}
        .pitcher-reason{
            display:-webkit-box!important;
            -webkit-line-clamp:2!important;
            -webkit-box-orient:vertical!important;
            overflow:hidden!important;
            margin-top:2px!important;
            color:#e5e7eb!important;
        }
        .pitcher-copy em{
            justify-self:start!important;
            display:inline-block!important;
            width:auto!important;
            margin:4px 0 7px!important;
            padding:3px 7px!important;
            border-radius:999px!important;
            font-size:.58rem!important;
            line-height:1.08!important;
            font-style:normal!important;
            font-weight:850!important;
            white-space:nowrap!important;
        }

        .pitcher-live-result{
            color:#fff!important;
            font-weight:900!important;
            margin-top:2px!important;
        }
        .pitch-game-live{
            color:#20e783!important;
            border:1px solid rgba(32,231,131,.82)!important;
            background:rgba(32,231,131,.10)!important;
        }
        .pitch-game-final{
            color:#f6c84c!important;
            border:1px solid rgba(246,200,76,.82)!important;
            background:rgba(246,200,76,.10)!important;
        }
        .pitch-lineup-confirmed{
            color:#c8f7d9!important;
            border:1px solid rgba(47,191,113,.55)!important;
            background:rgba(47,191,113,.10)!important;
        }
        .pitch-lineup-projected{
            color:#fde68a!important;
            border:1px solid rgba(214,179,92,.55)!important;
            background:rgba(214,179,92,.10)!important;
        }
        .pitch-lineup-unavailable{
            color:#a7abb2!important;
            border:1px solid #3a3d42!important;
            background:#101112!important;
        }

        .pitcher-score{
            text-align:right!important;
            min-width:0!important;
            align-self:start!important;
            padding-top:5px!important;
        }
        .pitcher-score small{
            display:block!important;
            color:#a7abb2!important;
            font-size:.50rem!important;
            font-weight:850!important;
        }
        .pitcher-score strong{
            display:block!important;
            color:#f6c84c!important;
            font-size:.88rem!important;
            margin-top:2px!important;
        }

        /* EXACT SAME green/gold language as batter intelligence boxes. */
        .pitch-intel-summary,.pitch-evidence-grid{
            display:grid!important;
            grid-template-columns:repeat(3,minmax(0,1fr))!important;
            gap:6px!important;
            margin:2px 0 8px!important;
        }
        .pitch-intel-summary>div,.pitch-evidence-grid>div{
            min-width:0!important;
            background:#101112!important;
            border:2px solid #3a3d42!important;
            border-radius:10px!important;
            padding:6px!important;
        }
        .pitch-intel-summary>div:nth-child(odd),
        .pitch-evidence-grid>div:nth-child(odd){
            border-left:3px solid #19d978!important;
            border-bottom-color:rgba(25,217,120,.55)!important;
        }
        .pitch-intel-summary>div:nth-child(even),
        .pitch-evidence-grid>div:nth-child(even){
            border-left:3px solid #d6b35c!important;
            border-bottom-color:rgba(214,179,92,.62)!important;
        }
        .pitch-intel-summary span,.pitch-evidence-grid span{
            display:block!important;
            color:#a7abb2!important;
            font-size:.57rem!important;
            line-height:1.08!important;
        }
        .pitch-intel-summary b,.pitch-evidence-grid b{
            display:block!important;
            color:#fff!important;
            font-size:.81rem!important;
            line-height:1.05!important;
            margin-top:2px!important;
        }

        div[class*="st-key-pitcher_intelligence_"] button{
            background:#080909!important;
            color:#fff!important;
            border:2px solid #d6b35c!important;
            border-radius:9px!important;
            min-height:34px!important;
            padding:.15rem .55rem!important;
            margin-top:0!important;
            font-size:.72rem!important;
        }

        div[data-testid="stExpander"]{margin:.18rem 0!important}
        div[data-testid="stExpander"] summary{
            min-height:33px!important;
            padding:.18rem .42rem!important;
        }
        div[data-testid="stExpander"] [data-testid="stExpanderDetails"]{
            padding:.08rem .42rem .62rem!important;
        }

        [data-testid="stTabs"] [data-baseweb="tab-highlight"],
        [data-baseweb="tab-highlight"]{
            background:#d6b35c!important;
            background-color:#d6b35c!important;
        }
        [data-testid="stTabs"] button[role="tab"][aria-selected="true"],
        button[data-baseweb="tab"][aria-selected="true"]{
            box-shadow:inset 0 -3px 0 #d6b35c!important;
            border-bottom-color:#d6b35c!important;
            color:#fff!important;
        }

        @media(max-width:700px){
            .pitcher-card-main{
                grid-template-columns:34px 50px minmax(0,1fr) 48px!important;
                gap:6px!important;
            }
            .pitcher-photo{
                width:48px!important;
                height:48px!important;
                min-width:48px!important;
                min-height:48px!important;
                max-width:48px!important;
                max-height:48px!important;
            }
            .pitcher-copy>strong{font-size:.88rem!important}
            .pitcher-copy>span{font-size:.66rem!important}
            h3{margin-top:.10rem!important;margin-bottom:.08rem!important}
            [data-testid="stTabs"] [role="tablist"]{margin-bottom:0!important}
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


    # Read the completed Railway worker snapshot from Supabase.
    result = load_pitcher_rankings_from_supabase(limit=25)

    if not result.get("success"):
        st.warning(
            "Pitcher rankings are unavailable from the completed worker snapshot. "
            "The worker will preserve the last good snapshot instead of replacing it with blanks."
        )
        return

    if result.get("stale"):
        st.caption(
            f"Showing the latest completed pitcher snapshot ({result.get('date')})."
        )

    rankings = _attach_persistent_movement(result.get("rankings") or {})
    tabs = st.tabs([CATEGORY_CONFIG[k][0] for k in CATEGORY_CONFIG])
    for tab, category in zip(tabs, CATEGORY_CONFIG):
        with tab:
            _render_category(category, rankings.get(category, []))


st.markdown(
    """
    <style>
    div[class*="st-key-pitcher_card_"],
    div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlockBorderWrapper"],
    .pitcher-card-main{
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        box-sizing:border-box!important;
        transform:none!important;
        translate:none!important;
        transition:none!important;
        animation:none!important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    """
    <style>
    /* MLB FINAL CLOSEOUT: pitcher card type/spacing mirrors batter card. */
    .pitcher-photo{
        box-sizing:border-box!important;
        padding:2px!important;
    }
    .pitcher-headshot{
        width:100%!important;
        height:100%!important;
        object-fit:contain!important;
        object-position:center center!important;
        transform:none!important;
        border-radius:50%!important;
    }

    .pitcher-copy>strong{
        font-size:.92rem!important;
        line-height:1.08!important;
        margin-bottom:1px!important;
    }
    .pitcher-copy>span{
        font-size:.69rem!important;
        line-height:1.18!important;
    }
    .pitcher-copy em{
        margin-top:4px!important;
        margin-bottom:7px!important;
        font-size:.58rem!important;
        line-height:1.08!important;
    }

    .pitcher-card-result{
        display:block!important;
        min-height:1.16rem!important;
        margin-top:1px!important;
        margin-bottom:2px!important;
        color:#fff!important;
        font-size:.92rem!important;
        line-height:1.16!important;
        font-weight:800!important;
        white-space:nowrap!important;
    }
    .pitcher-result-placeholder{
        visibility:hidden!important;
    }

    div[class*="st-key-pitcher_intelligence_"] button{
        margin-top:5px!important;
    }

    @media(max-width:700px){
        .pitcher-copy>strong{
            font-size:.88rem!important;
        }
        .pitcher-copy>span{
            font-size:.66rem!important;
        }
        .pitcher-copy em{
            font-size:.58rem!important;
            margin-bottom:7px!important;
        }
        .pitcher-card-result{
            font-size:.76rem!important;
            min-height:.92rem!important;
        }
    }
    </style>
    """,
    unsafe_allow_html=True,
)



st.markdown(
    """
    <style>
    /* MLB TRUE CARD MATCH — PITCHER */
    .pitcher-card-main{
        grid-template-columns:34px 50px minmax(0,1fr) 48px!important;
        gap:6px!important;
        align-items:start!important;
        padding:5px 1px 18px!important;
        min-width:0!important;
    }

    .pitcher-rank{
        padding-top:5px!important;
        font-size:.92rem!important;
        line-height:1!important;
    }
    .pitcher-rank strong{
        font-size:.92rem!important;
        line-height:1!important;
    }
    .pitcher-rank small{
        margin-top:5px!important;
        font-size:.55rem!important;
        line-height:1!important;
    }

    .pitcher-photo{
        width:48px!important;
        height:48px!important;
        min-width:48px!important;
        min-height:48px!important;
        max-width:48px!important;
        max-height:48px!important;
        padding:0!important;
        display:grid!important;
        place-items:center!important;
        overflow:hidden!important;
    }
    .pitcher-headshot{
        width:100%!important;
        height:100%!important;
        object-fit:contain!important;
        object-position:center center!important;
        transform:scale(.84) translateY(-2%)!important;
        transform-origin:center center!important;
        background:#080909!important;
    }

    .pitcher-copy{
        gap:1px!important;
        overflow:visible!important;
    }
    .pitcher-copy>strong{
        font-size:.88rem!important;
        line-height:1.08!important;
        font-weight:900!important;
        margin-bottom:1px!important;
    }
    .pitcher-copy>span{
        font-size:.66rem!important;
        line-height:1.18!important;
    }
    .pitcher-copy em{
        display:inline-block!important;
        width:auto!important;
        margin:5px 0 7px!important;
        padding:3px 7px!important;
        border-radius:999px!important;
        font-size:.58rem!important;
        line-height:1.08!important;
        font-weight:850!important;
        white-space:nowrap!important;
    }

    .pitcher-card-result{
        display:block!important;
        min-height:.92rem!important;
        margin-top:1px!important;
        margin-bottom:5px!important;
        color:#fff!important;
        font-size:.76rem!important;
        line-height:1.16!important;
        font-weight:800!important;
        white-space:nowrap!important;
    }

    .pitcher-score{
        padding-top:5px!important;
    }
    .pitcher-score small{font-size:.50rem!important}
    .pitcher-score strong{
        font-size:.88rem!important;
        margin-top:2px!important;
    }

    div[class*="st-key-pitcher_intelligence_"] button{
        margin-top:8px!important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


# MLB CLOSEOUT: pitcher geometry mirrors batter geometry.
st.markdown(
    """
    <style>
    .pitcher-photo{
        width:48px!important;
        height:48px!important;
        min-width:48px!important;
        min-height:48px!important;
        max-width:48px!important;
        max-height:48px!important;
        border-radius:50%!important;
        overflow:hidden!important;
        padding:0!important;
        background:#080909!important;
        border:2px solid rgba(214,179,92,.86)!important;
    }
    .pitcher-headshot{
        width:100%!important;
        height:100%!important;
        display:block!important;
        object-fit:cover!important;
        object-position:center 28%!important;
        transform:none!important;
        border-radius:50%!important;
    }
    .pitcher-copy>strong{
        font-size:.88rem!important;
        line-height:1.08!important;
        font-weight:900!important;
    }
    .pitcher-copy>span{
        font-size:.66rem!important;
        line-height:1.18!important;
    }
    .pitcher-state-result{
        display:flex!important;
        flex-direction:column!important;
        align-items:flex-start!important;
        width:100%!important;
        min-height:48px!important;
        margin:5px 0 0!important;
        padding:0 0 7px!important;
    }
    .pitcher-state-result em{
        display:inline-block!important;
        width:auto!important;
        margin:0 0 7px!important;
        padding:3px 7px!important;
        font-size:.58rem!important;
        line-height:1.08!important;
        font-weight:850!important;
        white-space:nowrap!important;
    }
    .pitcher-state-result .pitcher-card-result{
        display:block!important;
        position:static!important;
        margin:0!important;
        padding:0!important;
        min-height:.92rem!important;
        font-size:.76rem!important;
        line-height:1.16!important;
        font-weight:800!important;
        color:#fff!important;
        white-space:nowrap!important;
    }
    .pitcher-result-placeholder{
        visibility:hidden!important;
    }
    div[class*="st-key-pitcher_intelligence_"] button{
        position:static!important;
        margin-top:8px!important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


# MLB PLATFORM CLOSEOUT — pitcher Top-25 uses the same locked geometry as batter Top-25.
st.markdown(
    """
    <style>
    .pitcher-card-main{
        grid-template-columns:34px 50px minmax(0,1fr) 48px!important;
        gap:6px!important;align-items:start!important;
        padding:5px 1px 12px!important;min-width:0!important;
    }
    .pitcher-photo{
        width:48px!important;height:48px!important;
        min-width:48px!important;min-height:48px!important;
        max-width:48px!important;max-height:48px!important;
        padding:0!important;border-radius:50%!important;overflow:hidden!important;
        background:#080909!important;border:2px solid rgba(214,179,92,.86)!important;
    }
    .pitcher-headshot{
        width:100%!important;height:100%!important;display:block!important;
        object-fit:cover!important;object-position:center 28%!important;
        transform:none!important;border-radius:50%!important;background:#080909!important;
    }
    .pitcher-copy{gap:1px!important;align-self:start!important;min-width:0!important;overflow:visible!important}
    .pitcher-copy>strong{font-size:.88rem!important;line-height:1.08!important;font-weight:900!important;margin-bottom:1px!important}
    .pitcher-copy>span{font-size:.66rem!important;line-height:1.18!important}
    .pitcher-state-result{
        display:flex!important;flex-direction:column!important;align-items:flex-start!important;
        width:100%!important;min-height:0!important;margin:5px 0 0!important;padding:0!important;overflow:visible!important;
    }
    .pitcher-state-result em{
        display:inline-block!important;width:auto!important;
        margin:0 0 7px!important;padding:3px 7px!important;
        border-radius:999px!important;font-size:.58rem!important;line-height:1.08!important;
        font-weight:850!important;white-space:nowrap!important;
    }
    .pitcher-state-result .pitcher-card-result{
        display:block!important;position:static!important;width:auto!important;
        min-height:.92rem!important;margin:0 0 7px!important;padding:0!important;
        color:#fff!important;font-size:.76rem!important;line-height:1.16!important;
        font-weight:800!important;white-space:nowrap!important;overflow:visible!important;
    }
    .pitcher-result-placeholder{visibility:hidden!important}
    div[class*="st-key-pitcher_intelligence_"] button{position:static!important;margin-top:5px!important}
    </style>
    """,
    unsafe_allow_html=True,
)


# MLB FINAL CARD GEOMETRY — exact mobile summary height shared with batter cards.
st.markdown(
    """
    <style>
    @media(max-width:700px){
      .pitcher-card-main{
        min-height:142px!important;
        height:auto!important;
        box-sizing:border-box!important;
        overflow:visible!important;
      }
    }
    </style>
    """,
    unsafe_allow_html=True,
)


# MLB FINAL CLOSEOUT — same growable result contract as batter cards.
st.markdown(
    """
    <style>
    @media(max-width:700px){
      .pitcher-card-main{
        min-height:142px!important;
        height:auto!important;
        overflow:visible!important;
      }
      .pitcher-copy,.pitcher-state-result{overflow:visible!important;}
      .pitcher-state-result .pitcher-card-result{
        display:block!important;
        visibility:visible!important;
        position:static!important;
        min-height:.92rem!important;
        margin:0 0 7px!important;
        overflow:visible!important;
      }
      .pitcher-result-placeholder{visibility:hidden!important;}
    }
    </style>
    """,
    unsafe_allow_html=True,
)


# MLB NIGHT CLOSEOUT — exact physical match to batter cards.
st.markdown(
    """
    <style>
    div[class*="st-key-pitcher_card_"]{
        margin-bottom:10px!important;
        border-radius:16px!important;
        box-sizing:border-box!important;
    }
    div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlockBorderWrapper"]{
        border-radius:16px!important;
        overflow:visible!important;
        box-sizing:border-box!important;
    }
    .pitcher-card-main{
        grid-template-columns:36px 54px minmax(0,1fr) 50px!important;
        gap:7px!important;
        min-height:150px!important;
        height:auto!important;
        padding:6px 2px 10px!important;
        align-items:start!important;
        box-sizing:border-box!important;
        overflow:visible!important;
    }
    .pitcher-photo{
        width:54px!important;height:54px!important;
        min-width:54px!important;min-height:54px!important;
        max-width:54px!important;max-height:54px!important;
        border-radius:50%!important;
        border:2px solid rgba(214,179,92,.90)!important;
        overflow:hidden!important;
        display:grid!important;
        place-items:center!important;
        background:#0b0c0d!important;
    }
    .pitcher-headshot{
        width:100%!important;height:100%!important;
        object-fit:contain!important;
        object-position:center 30%!important;
        transform:scale(.94)!important;
        transform-origin:center center!important;
        border-radius:50%!important;
        background:#0b0c0d!important;
    }
    .pitcher-copy{min-width:0!important;overflow:visible!important}
    .pitcher-copy>strong{font-size:.90rem!important;line-height:1.08!important}
    .pitcher-copy span{font-size:.67rem!important;line-height:1.18!important}
    .pitcher-score{width:50px!important;min-width:50px!important}
    div[class*="st-key-pitcher_intelligence_"] button{
        min-height:36px!important;
        border-radius:10px!important;
        margin-top:5px!important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


# MLB TRUE CLOSEOUT — pitcher card must physically match the batter card.
st.markdown(
    """
    <style>
    div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlockBorderWrapper"]{
        min-height:232px!important;
        border-radius:16px!important;
        box-sizing:border-box!important;
    }
    .pitcher-card-main{
        grid-template-columns:38px 64px minmax(0,1fr) 50px!important;
        gap:8px!important;
        min-height:176px!important;
        padding:8px 2px 8px!important;
        align-items:start!important;
        box-sizing:border-box!important;
    }
    .pitcher-photo{
        width:64px!important;height:64px!important;
        min-width:64px!important;min-height:64px!important;
        max-width:64px!important;max-height:64px!important;
        border-radius:50%!important;
        overflow:hidden!important;
        display:grid!important;
        place-items:center!important;
        padding:0!important;
        background:#0b0c0d!important;
        border:2px solid rgba(214,179,92,.92)!important;
    }
    .pitcher-headshot{
        width:100%!important;height:100%!important;
        object-fit:contain!important;
        object-position:center 28%!important;
        transform:scale(.88)!important;
        transform-origin:center center!important;
        border-radius:50%!important;
        background:#0b0c0d!important;
    }
    .pitcher-card-result{
        font-weight:900!important;
        white-space:nowrap!important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)
