"""
Game Intelligence - MLB Page v1.1
----------------------------------
File location: pages/mlb.py

Fixes in this version:
- Prevents player-card HTML from appearing as raw code.
- Removes dependency on temporary internet avatar images.
- Uses official MLB headshots with initials only as a fallback.
- Keeps the existing tablet/app-first visual design.
- Adds responsive desktop behaviour without changing the mobile identity.

Important:
The page uses live ranking data and official MLB player headshots when available.
"""

from datetime import datetime
from html import escape
from textwrap import dedent
from zoneinfo import ZoneInfo
import os
import streamlit as st

from components.mlb_schedule import (
    load_today_lineups,
    load_today_schedule,
    render_live_mlb_schedule,
    schedule_summary,
)
from components.player_card import render_player_card
from components.mlb_performance_tracker import render_prediction_performance_tracker
from components.mlb_pitcher_rankings import render_pitcher_rankings
from engines.game_intelligence import (
    get_all_rankings,
    get_daily_ranking_snapshot,
)
from data.mlb_prediction_results import (
    get_live_hr_contact_signals,
    get_yesterday_hr_near_misses,
    grade_top_25,
)
from data.mlb_emerging_power import (
    build_emerging_power_candidates,
    emerging_power_explanation,
)
from data.ranking_history import load_previous_day_snapshot
from Utils.intraday_rankings import (
    GitHubSnapshotConfig,
    RankingSnapshotError,
    load_compare_and_save,
    load_compare_and_save_local,
    player_key,
)

# ============================================================
# TIME AND BASIC HELPERS
# ============================================================

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")


def _github_token() -> str | None:
    """Return movement snapshot token from env or Streamlit secrets."""
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


def get_toronto_now() -> datetime:
    """Return the current date and time in Toronto."""
    return datetime.now(TORONTO_TIMEZONE)

def player_initials(player_name: str) -> str:
    """Return two initials only as a safe image fallback."""
    words = [word for word in str(player_name).split() if word]

    if not words:
        return "MLB"

    if len(words) == 1:
        return words[0][:2].upper()

    return f"{words[0][0]}{words[-1][0]}".upper()


def player_photo_html(
    player: dict,
    css_class: str,
    fallback_class: str,
) -> str:
    """Return official MLB headshot HTML when available."""
    name = str(player.get("player") or player.get("player_name") or "MLB Player")
    headshot_url = str(player.get("headshot_url") or "").strip()
    initials = player_initials(name)

    if headshot_url:
        return (
            f'<div class="{escape(css_class)}">'
            f'<img src="{escape(headshot_url)}" '
            f'alt="{escape(name)} headshot" '
            f'loading="lazy" referrerpolicy="no-referrer">'
            "</div>"
        )

    return (
        f'<div class="{escape(fallback_class)}" '
        f'aria-label="Headshot unavailable for {escape(name)}">'
        f'{escape(initials)}'
        "</div>"
    )


def render_html(html: str) -> None:
    """Render HTML as one continuous line so Streamlit cannot split it."""
    clean_html = " ".join(
        line.strip()
        for line in html.splitlines()
        if line.strip()
    )
    st.markdown(clean_html, unsafe_allow_html=True)

def build_placeholder_rankings(category: str) -> list[dict]:
    """Create 25 placeholder ranking records for one category."""
    team_pairs = [
        ("NYY", "BOS"),
        ("LAD", "SF"),
        ("ATL", "NYM"),
        ("HOU", "SEA"),
        ("PHI", "MIA"),
        ("TOR", "TB"),
        ("CHC", "MIL"),
        ("BAL", "CLE"),
        ("TEX", "KC"),
        ("SD", "ARI"),
    ]

    reasons = {
        "Home Runs": [
            "Recent power, matchup quality, and park conditions support the profile.",
            "Strong barrel indicators align with a favourable pitcher matchup.",
            "Platoon advantage and hard-contact form create meaningful upside.",
            "Power indicators are positive, with lineup confirmation still important.",
            "The player grades well for damage against the projected pitch mix.",
        ],
        "Hits": [
            "Contact quality, batting-order opportunity, and matchup support a hit.",
            "Low strikeout profile combines with a favourable pitcher contact rate.",
            "Recent consistency and platoon splits strengthen the hitting outlook.",
            "Expected plate appearances and line-drive form support the ranking.",
            "The matchup favours the player's strongest contact zones.",
        ],
        "Total Bases": [
            "Extra-base potential and contact quality support the total-base profile.",
            "Recent power and gap contact provide more than one path to clear.",
            "Matchup, park, and expected plate appearances align positively.",
            "The player combines hit probability with meaningful damage potential.",
            "Hard-hit form and pitch-type success raise the total-base ceiling.",
        ],
    }

    records = []

    for index in range(1, 26):
        team, opponent = team_pairs[(index - 1) % len(team_pairs)]

        records.append(
            {
                "rank": index,
                "player": f"Sample Player {index:02d}",
                "team": team,
                "opponent": opponent,
                "category": category,
                "score": max(54, 96 - (index * 2)),
                "reason": reasons[category][(index - 1) % len(reasons[category])],
                "status": (
                    "Lineup projected"
                    if index % 3
                    else "Awaiting lineup confirmation"
                ),
            }
        )

    return records


def convert_live_rankings(
    engine_result: dict,
    category_label: str,
) -> list[dict]:
    """Convert live engine results into the format used by the player cards."""

    converted = []

    for player in engine_result.get("rankings", []):
        reasons = player.get("why", [])
        risk_flags = player.get("risk_flags", [])

        converted.append(
            {
                "rank": player.get("rank", 0),
                "player": player.get(
                    "player_name",
                    "Player unavailable",
                ),
                "team": player.get("team_name", "TBD"),
                "opponent": player.get("opponent_name", "TBD"),
                "team_id": player.get("team_id"),
                "opponent_id": player.get("opponent_id"),
                "is_home": player.get("is_home"),
                "headshot_url": player.get("headshot_url"),
                "player_id": player.get("player_id"),
                "game_pk": player.get("game_pk"),
                "weather": player.get("weather", {}),
                "park_factor": player.get("park_factor", 1.0),
                "park_adjustment": player.get("park_adjustment", 0.0),
                "pitcher_adjustment": player.get("pitcher_adjustment", 0.0),
                "handedness_adjustment": player.get("handedness_adjustment", 0.0),
                "statcast": player.get("statcast", {}),
                "position": player.get(
                    "position_abbreviation",
                    "",
                ),
                "category": category_label,
                "score": player.get("gi_score", 0),
                "projected_hits": player.get(
                    "projected_hits",
                    0.0,
                ),
                "projected_total_bases": player.get(
                    "projected_total_bases",
                    0.0,
                ),
                "home_run_probability": player.get(
                    "home_run_probability",
                    0.0,
                ),
                "one_plus_hit_probability": player.get(
                    "one_plus_hit_probability",
                    0.0,
                ),
                "over_1_5_total_bases_probability": player.get(
                    "over_1_5_total_bases_probability",
                    0.0,
                ),
                "projected_runs": player.get("projected_runs", 0.0),
                "projected_rbis": player.get("projected_rbis", 0.0),
                "projected_walks": player.get("projected_walks", 0.0),
                "projected_stolen_bases": player.get("projected_stolen_bases", 0.0),
                "one_plus_run_probability": player.get("one_plus_run_probability", 0.0),
                "one_plus_rbi_probability": player.get("one_plus_rbi_probability", 0.0),
                "one_plus_walk_probability": player.get("one_plus_walk_probability", 0.0),
                "one_plus_stolen_base_probability": player.get("one_plus_stolen_base_probability", 0.0),
                "projected_hits_runs_rbis": player.get("projected_hits_runs_rbis", 0.0),
                "over_1_5_hits_runs_rbis_probability": player.get(
                    "over_1_5_hits_runs_rbis_probability", 0.0
                ),
                "gi_score": player.get("gi_score", 0),
                "player_name": player.get(
                    "player_name",
                    "Player unavailable",
                ),
                "team_abbreviation": player.get(
                    "team_abbreviation",
                    "",
                ),
                "opponent_abbreviation": player.get(
                    "opponent_abbreviation",
                    "",
                ),
                "batting_order": player.get("batting_order"),
                "projected_batting_order": player.get(
                    "projected_batting_order"
                ),
                "lineup_status": player.get(
                    "lineup_status",
                    "confirmed"
                    if player.get("lineup_confirmed")
                    else "unconfirmed",
                ),
                "lineup_confirmed": player.get(
                    "lineup_confirmed",
                    False,
                ),
                "opposing_probable_pitcher": player.get(
                    "opposing_probable_pitcher",
                    "Not announced",
                ),
                "opposing_pitcher_hand": player.get(
                    "opposing_pitcher_hand",
                    "",
                ),
                "bat_side": player.get("bat_side", ""),
                "platoon_adjustment": player.get(
                    "platoon_adjustment",
                    0.0,
                ),
                "platoon_matchup": player.get(
                    "platoon_matchup",
                    {},
                ),
                "why": reasons,
                "risk_flags": risk_flags,
                "season_stats": player.get("season_stats", {}),
                "recent_stats": player.get("recent_stats", {}),
                "reason": (
                    reasons[0]
                    if reasons
                    else "Live statistical profile is being evaluated."
                ),
                "status": (
                    risk_flags[0]
                    if risk_flags
                    else "Live data available"
                ),
            }
        )

    return converted
def attach_persistent_movement(
    rankings: list[dict],
    comparison: dict,
    has_previous_snapshot: bool,
) -> list[dict]:
    """Attach persistent Top 25 movement details to the live card records."""
    movement_lookup = {
        item["player_key"]: item.get("movement", {})
        for item in comparison.get("current", [])
    }

    for player in rankings:
        try:
            key = player_key(player)
        except ValueError:
            key = ""

        movement = movement_lookup.get(
            key,
            {
                "status": "unchanged",
                "current": player.get("rank"),
                "previous": player.get("rank"),
                "change": 0,
                "label": "—",
            },
        )

        if not has_previous_snapshot:
            movement = {
                "status": "unchanged",
                "current": player.get("rank"),
                "previous": player.get("rank"),
                "change": 0,
                "label": "—",
            }

        player["movement"] = movement

    return rankings


def team_logo_html(team_id: object, team_name: str) -> str:
    """Return a small official MLB team mark for compact matchup rows."""
    try:
        numeric_id = int(team_id or 0)
    except (TypeError, ValueError):
        numeric_id = 0
    if not numeric_id:
        return ""
    return (
        f'<img class="gi-team-logo" '
        f'src="https://www.mlbstatic.com/team-logos/{numeric_id}.svg" '
        f'alt="{escape(_short_team(team_name))} logo" loading="lazy">'
    )


def matchup_html(player: dict) -> str:
    """Return abbreviated matchup with official team marks when IDs exist."""
    team = str(player.get("team") or "TBD")
    opponent = str(player.get("opponent") or "TBD")
    is_home = player.get("is_home")
    if is_home is True:
        away_name, away_id = opponent, player.get("opponent_id")
        home_name, home_id = team, player.get("team_id")
    else:
        away_name, away_id = team, player.get("team_id")
        home_name, home_id = opponent, player.get("opponent_id")
    return (
        f'{team_logo_html(away_id, away_name)}<span>{escape(_short_team(away_name))}</span>'
        f'<span class="gi-vs">vs.</span>'
        f'{team_logo_html(home_id, home_name)}<span>{escape(_short_team(home_name))}</span>'
    )


def matchup_display(player: dict) -> str:
    """Return the scheduled matchup in consistent away-team vs. home-team order."""
    team = str(player.get("team") or "TBD")
    opponent = str(player.get("opponent") or "TBD")
    is_home = player.get("is_home")

    if is_home is True:
        return f"{opponent} vs. {team}"
    if is_home is False:
        return f"{team} vs. {opponent}"
    return f"{team} vs. {opponent}"


def lineup_status_html(player: dict) -> str:
    """Return a compact lineup-status label for ranking cards."""
    status = str(player.get("lineup_status") or "").strip().lower()

    if status == "confirmed" or player.get("lineup_confirmed"):
        batting_order = player.get("batting_order")
        order_text = (
            f" · batting #{int(batting_order)}"
            if isinstance(batting_order, int)
            else ""
        )
        compact_order = (
            f" · #{int(batting_order)}"
            if isinstance(batting_order, int)
            else ""
        )
        return (
            '<span class="gi-lineup-status gi-lineup-confirmed">'
            f'✓ Confirmed{escape(compact_order)}'
            '</span>'
        )

    if status == "projected":
        batting_order = player.get("projected_batting_order")
        order_text = (
            f" · projected #{int(batting_order)}"
            if isinstance(batting_order, int)
            else ""
        )
        compact_order = (
            f" · #{int(batting_order)}"
            if isinstance(batting_order, int)
            else ""
        )
        return (
            '<span class="gi-lineup-status gi-lineup-projected">'
            f'◌ Projected{escape(compact_order)}'
            '</span>'
        )

    return (
        '<span class="gi-lineup-status gi-lineup-unconfirmed">'
        '○ Lineup not confirmed'
        '</span>'
    )


def movement_label(player: dict) -> str:
    """Return NEW / ↑ old→new / ↓ old→new beside every batter rank."""
    movement = player.get("movement", {})
    if not isinstance(movement, dict):
        return "—"

    status = str(movement.get("status") or "").lower()
    previous = movement.get("previous")
    current = movement.get("current")

    if status == "new":
        return "NEW"
    if status == "up" and previous and current:
        return f"↑ {previous}→{current}"
    if status == "down" and previous and current:
        return f"↓ {previous}→{current}"
    return "—"


def render_recent_movement(changes: list[str]) -> None:
    """Display the most meaningful movement across the full Top 25."""
    if not changes:
        return

    st.markdown("**Recent Top 25 Movement**")

    for change in changes:
        st.write(change)
@st.cache_data(ttl=180, show_spinner=False)
def attach_results_to_rankings(
    rankings: list[dict],
    category: str,
) -> list[dict]:
    """Attach completed game results to the player records."""
    if not rankings:
        return rankings

    result = grade_top_25(
        rankings=rankings,
        category=category,
    )

    return result.get("graded", rankings)


def card_result_html(player: dict) -> str:
    """Return live or final result HTML when game data is available."""
    if not (
        player.get("game_finished")
        or player.get("result_live")
    ):
        return ""

    result_label = escape(
        str(player.get("result_label", "Result unavailable"))
    )

    return f"""
        <div
            style="
                margin-top: 10px;
                font-weight: 700;
                font-size: 0.92rem;
            "
        >
            Result: {result_label}
        </div>
    """
@st.cache_data(ttl=600, show_spinner=False)
def load_emerging_power_pool() -> list[dict]:
    """Load a wider HR-ranked pool only when Emerging Power is opened."""
    schedule_date = datetime.now(TORONTO_TIMEZONE).date()
    result = get_all_rankings(
        schedule_date=schedule_date,
        recent_days=14,
        limit=125,
    )
    return list((result.get("home_runs", {}) or {}).get("rankings", []) or [])


@st.cache_data(ttl=300, show_spinner=False)
def load_live_rankings() -> dict:
    """Load live MLB rankings, falling back only when the live refresh is empty."""
    schedule_date = datetime.now(TORONTO_TIMEZONE).date()

    rankings = get_all_rankings(
        schedule_date=schedule_date,
        recent_days=14,
        limit=25,
    )

    has_live_rankings = any(
        bool(category_result.get("rankings"))
        for category_result in rankings.values()
        if isinstance(category_result, dict)
    )

    if has_live_rankings:
        return rankings

    # The rankings were intentionally "unfrozen" so they can recalculate
    # throughout the day.  A temporary MLB/provider failure must not turn every
    # category blank, though.  Reuse the valid same-day snapshot only when the
    # live refresh returned no players at all.  If no snapshot exists yet,
    # get_daily_ranking_snapshot() performs one fresh retry and saves it.
    fallback_snapshot = get_daily_ranking_snapshot(
        schedule_date=schedule_date,
        recent_days=14,
        limit=25,
    )
    fallback_rankings = fallback_snapshot.get("rankings", {})

    has_fallback_rankings = any(
        bool(category_result.get("rankings"))
        for category_result in fallback_rankings.values()
        if isinstance(category_result, dict)
    )

    if has_fallback_rankings:
        return fallback_rankings

    return rankings

def load_previous_rankings() -> dict:
    """Load yesterday's saved MLB rankings when available."""
    snapshot = load_previous_day_snapshot()

    if snapshot.get("status") != "ready":
        return {}

    return snapshot.get("rankings", {})
    
@st.cache_data(ttl=300, show_spinner=False)
def load_batter_movement_snapshot(
    category_rankings: dict[str, list[dict]],
) -> dict:
    """
    Compare today's Top 25 against the last material ranking.

    GitHub remains the durable source when its token can read/write. If that
    persistence is unavailable, keep a server-runtime snapshot instead of
    dropping all the way back to browser-session state.
    """
    captured_at = get_toronto_now()
    token = _github_token()

    if token:
        try:
            snapshot_config = GitHubSnapshotConfig(
                repository="sevans70-web/Sach-Sports-Dashboard",
                token=token,
                branch="main",
                path="data/intraday_rankings.json",
            )
            return load_compare_and_save(
                config=snapshot_config,
                category_rankings=category_rankings,
                captured_at=captured_at,
            )
        except (ValueError, KeyError, RankingSnapshotError):
            pass

    return load_compare_and_save_local(
        category_rankings=category_rankings,
        captured_at=captured_at,
        path="/tmp/sach_mlb_batter_intraday_rankings.json",
    )


live_rankings = load_live_rankings()
previous_rankings = load_previous_rankings()
use_previous_rankings = False
today_schedule = load_today_schedule()

home_run_status = live_rankings.get("home_runs", {})

RANKING_GAME_COUNT = home_run_status.get("game_count", 0)
RANKING_TEAM_COUNT = home_run_status.get("team_count", 0)
RANKING_HITTER_COUNT = home_run_status.get("hitter_count", 0)

HAS_FULL_TEAM_SLATE = home_run_status.get(
    "has_full_team_slate",
    False,
)

ALL_TOP_25_COMPLETE = all(
    live_rankings.get(category, {}).get(
        "complete_top_25",
        False,
    )
    for category in (
        "home_runs", "hits", "total_bases",
        "runs", "rbis", "walks", "stolen_bases", "hits_runs_rbis",
    )
)

HOME_RUN_RANKINGS = convert_live_rankings(
    live_rankings.get("home_runs", {}),
    "Home Runs",
)

HIT_RANKINGS = convert_live_rankings(
    live_rankings.get("hits", {}),
    "Hits",
)

TOTAL_BASE_RANKINGS = convert_live_rankings(
    live_rankings.get("total_bases", {}),
    "Total Bases",
)
RUN_RANKINGS = convert_live_rankings(live_rankings.get("runs", {}), "Runs")
RBI_RANKINGS = convert_live_rankings(live_rankings.get("rbis", {}), "RBIs")
WALK_RANKINGS = convert_live_rankings(live_rankings.get("walks", {}), "Walks")
STOLEN_BASE_RANKINGS = convert_live_rankings(
    live_rankings.get("stolen_bases", {}), "Stolen Bases"
)
HITS_RUNS_RBIS_RANKINGS = convert_live_rankings(
    live_rankings.get("hits_runs_rbis", {}), "Hits + Runs + RBIs"
)
HOME_RUN_RANKINGS = attach_results_to_rankings(
    HOME_RUN_RANKINGS,
    "home_runs",
)

HIT_RANKINGS = attach_results_to_rankings(
    HIT_RANKINGS,
    "hits",
)

TOTAL_BASE_RANKINGS = attach_results_to_rankings(
    TOTAL_BASE_RANKINGS,
    "total_bases",
)
RUN_RANKINGS = attach_results_to_rankings(RUN_RANKINGS, "runs")
RBI_RANKINGS = attach_results_to_rankings(RBI_RANKINGS, "rbis")
WALK_RANKINGS = attach_results_to_rankings(WALK_RANKINGS, "walks")
STOLEN_BASE_RANKINGS = attach_results_to_rankings(
    STOLEN_BASE_RANKINGS, "stolen_bases"
)
HITS_RUNS_RBIS_RANKINGS = attach_results_to_rankings(
    HITS_RUNS_RBIS_RANKINGS, "hits_runs_rbis"
)
MOVEMENT_SUMMARIES = {
    "home_runs": [],
    "hits": [],
    "total_bases": [],
}

try:
    movement_result = load_batter_movement_snapshot(
        {
            "home_runs": HOME_RUN_RANKINGS,
            "hits": HIT_RANKINGS,
            "total_bases": TOTAL_BASE_RANKINGS,
            "runs": RUN_RANKINGS,
            "rbis": RBI_RANKINGS,
            "walks": WALK_RANKINGS,
            "stolen_bases": STOLEN_BASE_RANKINGS,
            "hits_runs_rbis": HITS_RUNS_RBIS_RANKINGS,
        }
    )

    has_previous_snapshot = movement_result["previous_snapshot"] is not None
    comparisons = movement_result["comparisons"]

    HOME_RUN_RANKINGS = attach_persistent_movement(
        HOME_RUN_RANKINGS,
        comparisons.get("home_runs", {}),
        has_previous_snapshot,
    )
    HIT_RANKINGS = attach_persistent_movement(
        HIT_RANKINGS,
        comparisons.get("hits", {}),
        has_previous_snapshot,
    )
    TOTAL_BASE_RANKINGS = attach_persistent_movement(
        TOTAL_BASE_RANKINGS,
        comparisons.get("total_bases", {}),
        has_previous_snapshot,
    )
    RUN_RANKINGS = attach_persistent_movement(
        RUN_RANKINGS,
        comparisons.get("runs", {}),
        has_previous_snapshot,
    )
    RBI_RANKINGS = attach_persistent_movement(
        RBI_RANKINGS,
        comparisons.get("rbis", {}),
        has_previous_snapshot,
    )
    WALK_RANKINGS = attach_persistent_movement(
        WALK_RANKINGS,
        comparisons.get("walks", {}),
        has_previous_snapshot,
    )
    STOLEN_BASE_RANKINGS = attach_persistent_movement(
        STOLEN_BASE_RANKINGS,
        comparisons.get("stolen_bases", {}),
        has_previous_snapshot,
    )
    HITS_RUNS_RBIS_RANKINGS = attach_persistent_movement(
        HITS_RUNS_RBIS_RANKINGS,
        comparisons.get("hits_runs_rbis", {}),
        has_previous_snapshot,
    )

    if has_previous_snapshot:
        MOVEMENT_SUMMARIES = movement_result["summaries"]

except (KeyError, ValueError, RankingSnapshotError):
    # GitHub persistence is unavailable. Keep the page usable and compare
    # against the previous rankings held in this Streamlit session.
    current_rankings_by_category = {
        "home_runs": HOME_RUN_RANKINGS, "hits": HIT_RANKINGS,
        "total_bases": TOTAL_BASE_RANKINGS, "runs": RUN_RANKINGS,
        "rbis": RBI_RANKINGS, "walks": WALK_RANKINGS,
        "stolen_bases": STOLEN_BASE_RANKINGS,
        "hits_runs_rbis": HITS_RUNS_RBIS_RANKINGS,
    }
    previous_rankings_by_category = st.session_state.get(
        "mlb_previous_rankings_by_category"
    )

    if previous_rankings_by_category:
        for category_key, rankings in current_rankings_by_category.items():
            previous = previous_rankings_by_category.get(category_key, [])
            previous_positions = {
                player_key(player): index + 1
                for index, player in enumerate(previous)
            }

            comparison_rows = []
            for index, player in enumerate(rankings):
                key = player_key(player)
                new_rank = index + 1
                old_rank = previous_positions.get(key)

                if old_rank is None:
                    movement = {
                        "status": "new",
                        "previous": None,
                        "current": new_rank,
                        "change": None,
                        "label": "NEW",
                    }
                elif new_rank < old_rank:
                    movement = {
                        "status": "up",
                        "previous": old_rank,
                        "current": new_rank,
                        "change": old_rank - new_rank,
                        "label": f"↑ {old_rank}→{new_rank}",
                    }
                elif new_rank > old_rank:
                    movement = {
                        "status": "down",
                        "previous": old_rank,
                        "current": new_rank,
                        "change": old_rank - new_rank,
                        "label": f"↓ {old_rank}→{new_rank}",
                    }
                else:
                    movement = {
                        "status": "unchanged",
                        "previous": old_rank,
                        "current": new_rank,
                        "change": 0,
                        "label": "—",
                    }

                comparison_rows.append({
                    "player_key": key,
                    "movement": movement,
                })

            attach_persistent_movement(
                rankings,
                {"current": comparison_rows},
                True,
            )

    st.session_state["mlb_previous_rankings_by_category"] = {
        category_key: [dict(player) for player in rankings]
        for category_key, rankings in current_rankings_by_category.items()
    }


# Persistent snapshots survive refresh/app restarts; this session overlay catches
# any rank movement that occurs before the next durable snapshot comparison.
_current_batter_rankings = {
    "home_runs": HOME_RUN_RANKINGS,
    "hits": HIT_RANKINGS,
    "total_bases": TOTAL_BASE_RANKINGS,
    "runs": RUN_RANKINGS,
    "rbis": RBI_RANKINGS,
    "walks": WALK_RANKINGS,
    "stolen_bases": STOLEN_BASE_RANKINGS,
    "hits_runs_rbis": HITS_RUNS_RBIS_RANKINGS,
}
_previous_batter_rankings = st.session_state.get("mlb_live_movement_baseline", {})

if _previous_batter_rankings:
    for _category, _rows in _current_batter_rankings.items():
        _old_positions = {
            player_key(_row): int(_row.get("rank") or _i + 1)
            for _i, _row in enumerate(_previous_batter_rankings.get(_category, []))
        }

        for _i, _row in enumerate(_rows):
            _current = int(_row.get("rank") or _i + 1)
            _old = _old_positions.get(player_key(_row))
            _existing = _row.get("movement", {}) or {}
            _existing_status = str(_existing.get("status") or "").lower()

            if _existing_status in {"new", "up", "down"}:
                continue

            if _old is None:
                _row["movement"] = {
                    "status": "new",
                    "previous": None,
                    "current": _current,
                    "label": "NEW",
                }
            elif _current < _old:
                _row["movement"] = {
                    "status": "up",
                    "previous": _old,
                    "current": _current,
                    "label": f"↑ {_old}→{_current}",
                }
            elif _current > _old:
                _row["movement"] = {
                    "status": "down",
                    "previous": _old,
                    "current": _current,
                    "label": f"↓ {_old}→{_current}",
                }

st.session_state["mlb_live_movement_baseline"] = {
    _category: [dict(_row) for _row in _rows]
    for _category, _rows in _current_batter_rankings.items()
}


# ============================================================
# SESSION STATE
# ============================================================

for state_key in (
    "show_hr_25", "show_hits_25", "show_tb_25",
    "show_runs_25", "show_rbis_25", "show_walks_25", "show_sb_25",
    "show_hrr_25",
):
    if state_key not in st.session_state:
        st.session_state[state_key] = False


# ============================================================
# CARD RENDERING
# ============================================================

def projection_display(player: dict) -> tuple[str, str]:
    """Return the most useful projection label and value for the market."""
    category = str(player.get("category", "")).strip().lower()

    if category in {"home run", "home runs"}:
        probability = float(
            player.get("home_run_probability", 0.0) or 0.0
        )
        return "HR Probability", f"{probability:.0f}%"

    if category in {"hit", "hits"}:
        projected_hits = float(
            player.get("projected_hits", 0.0) or 0.0
        )
        hit_probability = float(
            player.get("one_plus_hit_probability", 0.0) or 0.0
        )
        return (
            "Projected Hits",
            f"{projected_hits:.1f} · {hit_probability:.0f}% for 1+",
        )

    if category in {"total base", "total bases"}:
        projected_bases = float(
            player.get("projected_total_bases", 0.0) or 0.0
        )
        over_probability = float(
            player.get(
                "over_1_5_total_bases_probability",
                0.0,
            )
            or 0.0
        )
        return (
            "Projected Total Bases",
            f"{projected_bases:.1f} · {over_probability:.0f}% over 1.5",
        )

    if category == "runs":
        projected = float(player.get("projected_runs", 0.0) or 0.0)
        probability = float(player.get("one_plus_run_probability", 0.0) or 0.0)
        return "Projected Runs", f"{projected:.1f} · {probability:.0f}% for 1+"

    if category in {"rbi", "rbis"}:
        projected = float(player.get("projected_rbis", 0.0) or 0.0)
        probability = float(player.get("one_plus_rbi_probability", 0.0) or 0.0)
        return "Projected RBIs", f"{projected:.1f} · {probability:.0f}% for 1+"

    if category == "walks":
        projected = float(player.get("projected_walks", 0.0) or 0.0)
        probability = float(player.get("one_plus_walk_probability", 0.0) or 0.0)
        return "Projected Walks", f"{projected:.1f} · {probability:.0f}% for 1+"

    if "stolen" in category:
        projected = float(player.get("projected_stolen_bases", 0.0) or 0.0)
        probability = float(player.get("one_plus_stolen_base_probability", 0.0) or 0.0)
        return "Projected Stolen Bases", f"{projected:.2f} · {probability:.0f}% for 1+"

    if "hits + runs + rbis" in category or "hits runs rbis" in category:
        projected = float(player.get("projected_hits_runs_rbis", 0.0) or 0.0)
        probability = float(
            player.get("over_1_5_hits_runs_rbis_probability", 0.0) or 0.0
        )
        return "Projected H+R+RBI", f"{projected:.1f} · {probability:.0f}% over 1.5"

    return "Projection", "Unavailable"

def category_card_reason(player: dict) -> str:
    """Return one concise, evidence-driven reason unique to this player's rank."""
    category = str(player.get("category") or "").strip().lower()
    pitcher = str(player.get("opposing_probable_pitcher") or "").strip()
    pitcher_text = pitcher if pitcher and pitcher != "Not announced" else "the opposing starter"

    season = player.get("season_stats", {}) or {}
    recent = player.get("recent_stats", {}) or {}
    statcast = player.get("statcast", {}) or {}
    weather = player.get("weather", {}) or {}

    order = player.get("batting_order") or player.get("projected_batting_order")
    try:
        order_num = int(order) if order not in (None, "", "—") else None
    except (TypeError, ValueError):
        order_num = None

    hr = float(player.get("home_run_probability", 0.0) or 0.0)
    hit = float(player.get("one_plus_hit_probability", 0.0) or 0.0)
    tb = float(player.get("over_1_5_total_bases_probability", 0.0) or 0.0)
    run = float(player.get("one_plus_run_probability", 0.0) or 0.0)
    rbi = float(player.get("one_plus_rbi_probability", 0.0) or 0.0)
    walk = float(player.get("one_plus_walk_probability", 0.0) or 0.0)
    sb = float(player.get("one_plus_stolen_base_probability", 0.0) or 0.0)

    season_hr = int(season.get("home_runs") or 0)
    recent_hr = int(recent.get("home_runs") or 0)
    season_slg = float(season.get("slg") or 0.0)
    barrel = float(statcast.get("barrel_rate") or 0.0)
    hard_hit = float(statcast.get("hard_hit_rate") or 0.0)
    xslg = float(statcast.get("xslg") or 0.0)
    pitcher_adj = float(player.get("pitcher_adjustment") or 0.0)
    platoon_adj = float(player.get("platoon_adjustment") or 0.0)
    park_adj = float(player.get("park_adjustment") or 0.0)

    if category in {"home run", "home runs"}:
        candidates: list[tuple[float, str]] = []

        if season_hr:
            candidates.append((
                min(season_hr / 4.0, 10.0),
                f"{season_hr} season HR and {season_slg:.3f} SLG give this ranking proven power"
            ))
        if barrel:
            candidates.append((
                barrel / 1.5,
                f"{barrel:.1f}% barrel rate and {xslg:.3f} xSLG provide elite contact-quality support"
            ))
        if recent_hr:
            candidates.append((
                5.5 + recent_hr,
                f"{recent_hr} recent HR show the power is arriving into today's matchup"
            ))
        if pitcher_adj >= 1.5:
            candidates.append((
                7.0 + pitcher_adj,
                f"{pitcher_text} materially improves the HR matchup"
            ))
        if platoon_adj >= 1.0:
            candidates.append((
                6.5 + platoon_adj,
                f"the handedness matchup vs. {pitcher_text} is a meaningful advantage"
            ))
        if park_adj >= 0.8:
            candidates.append((
                6.0 + park_adj,
                "today's park environment adds measurable home-run upside"
            ))
        if order_num and order_num <= 3:
            candidates.append((
                5.0,
                f"batting #{order_num} adds expected plate appearances"
            ))
        if hr >= 23:
            candidates.append((
                5.5,
                f"{hr:.0f}% HR probability is among the strongest raw chances on the slate"
            ))
        if tb >= 64:
            candidates.append((
                5.0,
                f"{tb:.0f}% over-1.5-TB probability confirms extra-base damage upside"
            ))

        candidates.sort(key=lambda item: item[0], reverse=True)
        chosen = [text for _, text in candidates[:2]]
        if chosen:
            return "; ".join(chosen) + "."
        return f"{hr:.0f}% HR probability is supported by the matchup vs. {pitcher_text}."

    if category in {"hit", "hits"}:
        recent_avg = float(recent.get("avg") or 0.0)
        if recent_avg >= .300:
            return f"{hit:.0f}% for 1+ hit with a {recent_avg:.3f} recent AVG; current contact form is the separator."
        if pitcher_adj >= 1.5:
            return f"{hit:.0f}% for 1+ hit; {pitcher_text}'s profile is the strongest matchup edge."
        return f"{hit:.0f}% for 1+ hit with batting #{order_num or '—'} supplying the opportunity volume."

    if category in {"total base", "total bases"}:
        if xslg >= .475:
            return f"{tb:.0f}% over 1.5 TB with a {xslg:.3f} xSLG; quality of contact drives the ceiling."
        return f"{tb:.0f}% over 1.5 TB; {hr:.0f}% HR probability adds a second path to clearing the line."

    if category == "runs":
        return f"{run:.0f}% to score; batting #{order_num or '—'} and on-base opportunity are the main ranking drivers."

    if category in {"rbi", "rbis"}:
        return f"{rbi:.0f}% for 1+ RBI; batting #{order_num or '—'} and the matchup vs. {pitcher_text} shape the run-producing opportunity."

    if category == "walks":
        return f"{walk:.0f}% for 1+ walk; plate-discipline opportunity against {pitcher_text} is the core edge."

    if "stolen" in category:
        return f"{sb:.0f}% for 1+ stolen base; on-base access plus speed creates the attempt opportunity."

    if "hits + runs + rbis" in category or "hits runs rbis" in category:
        return f"{hit:.0f}% hit, {run:.0f}% run and {rbi:.0f}% RBI chances give this player multiple paths to production."

    reasons = player.get("why", []) or []
    return str(reasons[0] if reasons else player.get("reason") or "Live statistical profile is being evaluated.")


def opposing_pitcher_line(player: dict) -> str:
    """Return the opposing pitcher line shown before intelligence is expanded."""
    pitcher = str(player.get("opposing_probable_pitcher") or "Not announced").strip()
    hand = str(player.get("opposing_pitcher_hand") or "").upper()
    hand_text = f" · {hand}HP" if hand else ""
    return f'<span class="gi-card-pitcher"><b>vs. {escape(pitcher)}</b>{escape(hand_text)}</span>'


def render_featured_player(player: dict) -> None:
    """Render the #1 player using the same card design as the rest of the Top 5."""
    render_compact_player(player)


def render_compact_player(player: dict) -> None:
    """Render players #2 through #5 in a compact card."""
    photo_html = player_photo_html(
        player,
        "gi-compact-photo",
        "gi-compact-photo-placeholder",
    )

    render_html(
        f"""
        <div class="gi-compact-player">
            {photo_html}

            <div class="gi-compact-rank">
                #{player['rank']}<br>
                <small>{escape(movement_label(player))}</small>
            </div>

            <div class="gi-compact-main">
                <div class="gi-compact-topline">
                    <span class="gi-compact-name">
                        {escape(player['player'])}
                    </span>
                </div>

                <div class="gi-compact-matchup">
                    {matchup_html(player)}
                    <span class="gi-score-inline">GI {player['score']}</span>
                </div>

                <div class="gi-compact-reason">
                    {escape(player['reason'])}
                </div>

                <div class="gi-lineup-row">
                    {lineup_status_html(player)}
                </div>

                {card_result_html(player)}
            </div>
        </div>
        """
    )


def render_full_ranking_row(player: dict) -> None:
    """Render one row in the full Top 25 view."""
    projection_label, projection_value = projection_display(player)
    photo_html = player_photo_html(
        player,
        "gi-full-photo",
        "gi-full-photo-placeholder",
    )

    render_html(
        f"""
        <div class="gi-full-row">
            <div class="gi-full-rank">
                #{player['rank']}<br>
                <small>{escape(movement_label(player))}</small>
            </div>

            {photo_html}

            <div class="gi-full-main">
                <div class="gi-full-name">
                    {escape(player['player'])}
                </div>

                <div class="gi-full-matchup">
                    {escape(matchup_display(player))}
                </div>

                <div class="gi-full-projection">
                    <strong>{escape(projection_label)}:</strong>
                    {escape(projection_value)}
                </div>

                <div class="gi-full-reason">
                    {escape(player['reason'])}
                </div>

                {card_result_html(player)}
            </div>

            <div class="gi-full-score">
                <span class="gi-score-label">GI score</span>
                <span class="gi-score-number">{player['score']}</span>
            </div>
        </div>
        """
    )


def render_expandable_ranking_header(player: dict) -> None:
    """Render the ranking summary inside the interactive Streamlit card."""
    projection_label, projection_value = projection_display(player)
    photo_html = player_photo_html(
        player,
        "gi-native-photo",
        "gi-native-initials",
    )
    render_html(
        f"""
        <div class="gi-card-header">
            <div class="gi-card-rank">
                #{player['rank']}
                <small>{escape(movement_label(player))}</small>
            </div>
            {photo_html}
            <div class="gi-card-player">
                <strong>{escape(player['player'])}</strong>
                <span class="gi-card-matchup">{matchup_html(player)}</span>
                {opposing_pitcher_line(player)}
                <span><b>{escape(projection_label)}:</b> {escape(projection_value)}</span>
                <span class="gi-card-reason">{escape(category_card_reason(player))}</span>
                <span>{lineup_status_html(player)}</span>
                {card_result_html(player)}
            </div>
            <div class="gi-card-score">
                <small>GI SCORE</small>
                <strong>{player['score']}</strong>
            </div>
        </div>
        """
    )


def render_ranking_category(
    title: str,
    icon: str,
    rankings: list[dict],
    state_key: str,
    button_key: str,
    movement_summary: list[str],
    category_key: str,
) -> None:
    """Render a Top 5 preview and optional full Top 25 ranking."""
    render_html(
        f"""
        <div class="gi-section-heading">
            <div>
                <div class="gi-section-title">
                    {icon} {escape(title)} Rankings
                </div>

                <div class="gi-section-subtitle">
                    Ranked by GI Score. Probability is one component of the score,
                    alongside player performance, matchup, lineup position, ballpark,
                    weather, and sample reliability. Top 5 shown first.
                </div>
            </div>

            <div class="gi-section-count">25 ranked</div>
        </div>
        """
    )

    if not rankings:
        st.info(f"No {title.lower()} rankings are available right now.")
        return

    # Rankings were already graded once when the page data was prepared.
    # Do not force another MLB results request for every tab on every click.

    render_recent_movement(movement_summary)

    for player in rankings[:5]:
        intelligence_key = f"{state_key}_top5_intelligence_{player['rank']}"
        if intelligence_key not in st.session_state:
            st.session_state[intelligence_key] = False

        with st.container(
            border=True,
            key=f"{state_key}_top5_player_{player['rank']}",
        ):
            render_expandable_ranking_header(player)

            if st.button(
                "ⓘ Hide Intelligence"
                if st.session_state[intelligence_key]
                else "ⓘ View Intelligence",
                key=f"{intelligence_key}_button",
                use_container_width=True,
            ):
                st.session_state[intelligence_key] = not st.session_state[intelligence_key]

            if st.session_state[intelligence_key]:
                render_player_card(player)

    button_label = (
        "Show Top 5 Only"
        if st.session_state[state_key]
        else "View Full Top 25"
    )

    if st.button(
        button_label,
        key=button_key,
        use_container_width=True,
    ):
        st.session_state[state_key] = not st.session_state[state_key]
        

    if st.session_state[state_key]:
        render_html(
            """
            <div class="gi-full-list-heading">
                Full Ranking
            </div>
            """
        )

        # The Top 5 is already visible above. Expanded view continues at #6.
        for player in rankings[5:]:
            intelligence_key = (
                f"{state_key}_intelligence_{player['rank']}"
            )
            if intelligence_key not in st.session_state:
                st.session_state[intelligence_key] = False

            with st.container(
                border=True,
                key=f"{state_key}_player_{player['rank']}",
            ):
                render_expandable_ranking_header(player)

                button_label = (
                    "ⓘ Hide Intelligence" if st.session_state[intelligence_key] else "ⓘ View Intelligence"
                )
                if st.button(
                    button_label,
                    key=f"{intelligence_key}_button",
                    use_container_width=True,
                ):
                    st.session_state[intelligence_key] = not (
                        st.session_state[intelligence_key]
                    )

                if st.session_state[intelligence_key]:
                    render_player_card(player)
                


# ============================================================
# PAGE THEME
# ============================================================

st.markdown(
    """
    <style>
        :root {
            --gi-bg: #090a0b;
            --gi-panel: rgba(20, 20, 18, 0.92);
            --gi-panel-soft: rgba(24, 24, 21, 0.82);
            --gi-border: rgba(214, 179, 92, 0.28);
            --gi-blue: #d6b35c;
            --gi-blue-light: #f3ead5;
            --gi-text: #f7f1e3;
            --gi-muted: #b8b09f;
            --gi-green: #2fbf71;
            --gi-yellow: #d6b35c;
            --gi-orange: #c99445;
        }

        .stApp {
            background:
                radial-gradient(
                    circle at 50% -8%,
                    rgba(214, 179, 92, 0.10),
                    transparent 30%
                ),
                linear-gradient(180deg, #080909 0%, #10110f 52%, #15140f 100%);
            color: var(--gi-text);
        }

        [data-testid="stSidebar"] {
            background: #050606;
            border-right: 1px solid rgba(214, 179, 92, 0.20);
        }

        [data-testid="stSidebarNav"] a,
        [data-testid="stSidebarNav"] span {
            color: #f3ead5;
        }

        .block-container {
            max-width: 1320px;
            padding-top: 1.35rem;
            padding-bottom: 4rem;
        }

        h1, h2, h3 {
            color: var(--gi-text);
            letter-spacing: -0.025em;
        }

        p {
            color: #d8d0bf;
        }

        .gi-hero {
            padding: 34px 32px;
            margin-bottom: 18px;
            border-radius: 24px;
            background:
                radial-gradient(
                    circle at 84% 12%,
                    rgba(214, 179, 92, 0.24),
                    transparent 28%
                ),
                linear-gradient(
                    135deg,
                    rgba(10, 10, 9, 0.99),
                    rgba(31, 27, 18, 0.97)
                );
            border: 1px solid rgba(214, 179, 92, 0.36);
            box-shadow: 0 18px 48px rgba(2, 8, 23, 0.32);
        }

        .gi-eyebrow {
            color: var(--gi-blue);
            font-size: 0.78rem;
            font-weight: 850;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            margin-bottom: 10px;
        }

        .gi-hero-title {
            color: #ffffff;
            font-size: clamp(2rem, 4vw, 3.5rem);
            font-weight: 900;
            line-height: 1.04;
            margin: 0;
        }

        .gi-hero-subtitle {
            color: var(--gi-blue-light);
            max-width: 820px;
            font-size: 1.02rem;
            line-height: 1.62;
            margin: 16px 0 0;
        }

        .gi-status-strip {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 10px;
            padding: 14px 18px;
            margin: 10px 0 25px;
            border-radius: 15px;
            background: rgba(15, 23, 42, 0.72);
            border: 1px solid rgba(148, 163, 184, 0.16);
        }

        .gi-status-primary {
            color: #ffffff;
            font-weight: 750;
        }

        .gi-status-secondary {
            color: var(--gi-muted);
        }

        div[data-testid="stMetric"] {
            min-height: 120px;
            padding: 16px;
            border-radius: 17px;
            background: var(--gi-panel-soft);
            border: 1px solid var(--gi-border);
        }

        div[data-testid="stMetricLabel"] {
            color: #d8d0bf;
        }

        div[data-testid="stMetricValue"] {
            color: #ffffff;
            font-weight: 850;
        }

        .gi-before-ranking {
            padding: 17px 19px;
            margin: 20px 0 28px;
            border-radius: 16px;
            background: rgba(15, 23, 42, 0.65);
            border: 1px solid rgba(251, 191, 36, 0.30);
        }

        .gi-before-title {
            color: #ffffff;
            font-weight: 800;
            margin-bottom: 5px;
        }

        .gi-before-text {
            color: #d8d0bf;
            line-height: 1.55;
        }

        .gi-tabs-note {
            color: var(--gi-muted);
            font-size: 0.91rem;
            margin-bottom: 10px;
        }

        .gi-section-heading {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin: 18px 0 13px;
        }

        .gi-section-title {
            color: #ffffff;
            font-size: 1.08rem;
            font-weight: 850;
        }

        .gi-section-subtitle {
            color: var(--gi-muted);
            font-size: 0.87rem;
            margin-top: 3px;
        }

        .gi-section-count {
            color: #f3ead5;
            padding: 6px 10px;
            border-radius: 999px;
            background: rgba(214, 179, 92, 0.13);
            border: 1px solid rgba(214, 179, 92, 0.28);
            font-size: 0.76rem;
            font-weight: 800;
        }

        .gi-featured-player {
            display: grid;
            grid-template-columns: 145px minmax(0, 1fr);
            gap: 22px;
            padding: 21px;
            margin-bottom: 13px;
            border-radius: 20px;
            background:
                linear-gradient(
                    135deg,
                    rgba(14, 116, 144, 0.15),
                    rgba(15, 23, 42, 0.88)
                );
            border: 1px solid rgba(214, 179, 92, 0.30);
            box-shadow: 0 14px 34px rgba(2, 8, 23, 0.22);
        }

        .gi-featured-photo-wrap {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
        }

        .gi-featured-photo-placeholder {
            width: 128px;
            height: 150px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 18px;
            background:
                radial-gradient(
                    circle at 50% 30%,
                    rgba(214, 179, 92, 0.24),
                    transparent 45%
                ),
                linear-gradient(
                    160deg,
                    #123e66,
                    #0a1c31
                );
            border: 1px solid rgba(214, 179, 92, 0.36);
            color: #ffffff;
            font-size: 2.2rem;
            font-weight: 900;
            letter-spacing: 0.04em;
        }

        .gi-photo-note {
            color: var(--gi-muted);
            font-size: 0.72rem;
            margin-top: 7px;
        }

        .gi-featured-content {
            min-width: 0;
        }

        .gi-featured-topline {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
        }

        .gi-rank-badge {
            color: #ffffff;
            padding: 6px 10px;
            border-radius: 10px;
            background: rgba(214, 179, 92, 0.13);
            border: 1px solid rgba(214, 179, 92, 0.28);
            font-weight: 850;
        }
        
        .gi-featured-name {
            color: #ffffff;
            font-size: 1.62rem;
            font-weight: 900;
            margin-top: 13px;
        }

        .gi-featured-matchup {
            color: var(--gi-muted);
            margin-top: 2px;
        }

        .gi-featured-market {
            color: var(--gi-blue-light);
            font-size: 1rem;
            font-weight: 800;
            margin-top: 11px;
        }

        .gi-featured-reason {
            color: #d8d0bf;
            line-height: 1.58;
            margin-top: 8px;
        }

        .gi-featured-footer {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 8px;
            color: var(--gi-green);
            font-size: 0.82rem;
            font-weight: 750;
            margin-top: 16px;
        }

        .gi-compact-player {
        border-left:5px solid #ffcc33 !important;
        border-top:2px solid rgba(255,204,51,.88) !important;
            display: grid;
            grid-template-columns: 54px 42px minmax(0, 1fr);
            align-items: center;
            gap: 13px;
            padding: 14px 16px;
            margin-bottom: 10px;
            border-radius: 17px;
            background: var(--gi-panel-soft);
            border: 1px solid var(--gi-border);
        }

        .gi-compact-photo-placeholder,
        .gi-full-photo-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-weight: 850;
            background:
                linear-gradient(
                    145deg,
                    #123e66,
                    #0a1c31
                );
            border: 1px solid rgba(214, 179, 92, 0.32);
        }

        .gi-compact-photo-placeholder {
            width: 54px;
            height: 54px;
            border-radius: 14px;
            font-size: 0.92rem;
        }

        .gi-compact-rank {
            color: var(--gi-blue-light);
            font-weight: 850;
            text-align: center;
        }

        .gi-compact-main {
            min-width: 0;
        }

        .gi-compact-topline {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
        }

        .gi-compact-name {
            color: #ffffff;
            font-weight: 850;
        }

        .gi-compact-matchup {
            color: var(--gi-muted);
            font-size: 0.82rem;
            margin-top: 2px;
        }

        .gi-lineup-row {
            margin-top: 5px;
        }

        .gi-lineup-status {
            display: inline-block;
            font-size: 0.72rem;
            font-weight: 800;
            line-height: 1.2;
            padding: 3px 7px;
            border-radius: 999px;
        }

        .gi-lineup-confirmed {
            color: #bbf7d0;
            background: rgba(34, 197, 94, 0.12);
            border: 1px solid rgba(34, 197, 94, 0.26);
        }

        .gi-lineup-projected {
            color: #fde68a;
            background: rgba(245, 158, 11, 0.10);
            border: 1px solid rgba(245, 158, 11, 0.24);
        }

        .gi-lineup-unconfirmed {
            color: #d8d0bf;
            background: rgba(148, 163, 184, 0.08);
            border: 1px solid rgba(148, 163, 184, 0.18);
        }

        .gi-compact-reason {
            color: #d8d0bf;
            font-size: 0.88rem;
            line-height: 1.45;
            margin-top: 6px;
        }

        .gi-full-list-heading {
            color: #ffffff;
            font-size: 1rem;
            font-weight: 850;
            margin: 20px 0 10px;
        }

        .gi-full-row {
            display: grid;
            grid-template-columns: 48px 46px minmax(0, 1fr) 80px;
            align-items: center;
            gap: 12px;
            padding: 12px 14px;
            margin-bottom: 8px;
            border-radius: 14px;
            background: rgba(15, 23, 42, 0.66);
            border: 1px solid rgba(214, 179, 92, 0.17);
        }

        [class*="st-key-show_"][class*="_player_"] {
            background: rgba(15, 23, 42, 0.72);
            border: 1px solid rgba(214, 179, 92, 0.28) !important;
            border-radius: 16px;
            padding: 4px 10px 12px;
            margin-bottom: 12px;
        }

        [class*="st-key-show_"][class*="_player_"] .gi-full-row {
            background: transparent;
            border: 0;
            margin-bottom: 0;
        }

        [class*="st-key-show_"][class*="_player_"] .stButton > button {
            background: rgba(14, 116, 144, 0.12);
            border: 0;
            border-top: 1px solid rgba(214, 179, 92, 0.18);
            border-radius: 0 0 10px 10px;
            color: #bae6fd;
            justify-content: flex-start;
            text-align: left;
        }

        .gi-featured-photo,
        .gi-compact-photo,
        .gi-full-photo,
        .gi-native-photo {
            align-items: center;
            background: linear-gradient(145deg, #075985, #0f172a);
            border: 1px solid rgba(214, 179, 92, 0.55);
            display: flex;
            justify-content: center;
            overflow: hidden;
        }

        .gi-featured-photo {
            border-radius: 18px;
            height: 150px;
            width: 150px;
        }

        .gi-compact-photo {
            border-radius: 12px;
            height: 54px;
            width: 54px;
        }

        .gi-full-photo {
            border-radius: 12px;
            height: 50px;
            width: 50px;
        }

        .gi-native-photo {
            border-radius: 12px;
            height: 44px;
            width: 44px;
        }

        .gi-featured-photo img,
        .gi-compact-photo img,
        .gi-full-photo img,
        .gi-native-photo img {
            height: 100%;
            object-fit: contain;
            object-position: center;
            width: 100%;
        }

        .gi-native-initials {
            align-items: center;
            background: linear-gradient(145deg, #075985, #0f172a);
            border: 1px solid rgba(214, 179, 92, 0.55);
            border-radius: 12px;
            color: #e0f2fe;
            display: flex;
            font-size: 0.78rem;
            font-weight: 850;
            height: 44px;
            justify-content: center;
            width: 44px;
        }

        .gi-card-header {
            align-items: center;
            display: grid;
            gap: 12px;
            grid-template-columns: 48px 48px minmax(0, 1fr) 72px;
            padding: 10px 4px 6px;
        }

        .gi-card-rank,
        .gi-card-score {
            color: #bae6fd;
            text-align: center;
        }

        .gi-card-rank {
            font-size: 1rem;
            font-weight: 850;
        }

        .gi-card-rank small,
        .gi-card-score small {
            display: block;
            font-size: 0.58rem;
            margin-top: 2px;
        }

        .gi-card-score strong {
            color: #ffffff;
            display: block;
            font-size: 0.92rem;
        }

        .gi-card-player {
            display: grid;
            gap: 2px;
            min-width: 0;
        }

        .gi-card-player strong {
            color: #ffffff;
            font-size: 1rem;
        }

        .gi-card-player span {
            color: #d8d0bf;
            font-size: 0.79rem;
            line-height: 1.3;
        }

        .gi-card-reason {
            margin-top: 3px;
        }

        .gi-full-rank {
            color: var(--gi-blue-light);
            font-weight: 850;
            text-align: center;
        }

        .gi-full-photo-placeholder {
            width: 42px;
            height: 42px;
            border-radius: 12px;
            font-size: 0.72rem;
        }

        .gi-full-player {
            min-width: 0;
        }

        .gi-full-name {
            color: #ffffff;
            font-weight: 800;
        }

        .gi-full-matchup {
            color: var(--gi-muted);
            font-size: 0.78rem;
            margin-top: 2px;
        }

        .gi-full-score {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .gi-score-label {
            color: var(--gi-muted);
            font-size: 0.66rem;
            text-transform: uppercase;
        }

        .gi-score-number {
            color: #ffffff;
            font-weight: 850;
        }

        div[data-testid="stButton"] > button {
            min-height: 44px;
            border-radius: 13px;
            font-weight: 800;
        }

        div[data-testid="stVerticalBlockBorderWrapper"] {
            background: rgba(15, 23, 42, 0.66);
            border: 1px solid rgba(214, 179, 92, 0.18);
            border-radius: 18px;
        }

        hr {
            border-color: rgba(148, 163, 184, 0.16);
            margin: 30px 0;
        }

        .gi-team-logo {
            width: 17px;
            height: 17px;
            object-fit: contain;
            vertical-align: middle;
            margin: 0 3px 0 1px;
        }
        .gi-vs { opacity: .58; margin: 0 4px; }
        .gi-score-inline { color: var(--gi-yellow); font-weight: 800; margin-left: 7px; }
        .gi-card-matchup { display: flex !important; align-items: center; flex-wrap: wrap; gap: 1px; }

        .gi-compact-photo, .gi-full-photo, .gi-native-photo, .gi-featured-photo {
            object-fit: contain;
            object-position: center bottom;
            background: linear-gradient(145deg, #f7f1e3, #ddd3bc);
            border: 1px solid rgba(214, 179, 92, 0.38);
        }

        @media (max-width: 760px) {
            div[data-testid="stMetric"] {
                min-height: 78px;
                padding: 9px 10px;
                border-radius: 12px;
            }
            div[data-testid="stMetricLabel"] { font-size: 0.70rem; }
            div[data-testid="stMetricValue"] { font-size: 1.28rem; }
            div[data-testid="stMetricDelta"] { font-size: 0.66rem; }
            .gi-section-subtitle { display: none; }
            hr { margin: 18px 0; }
        }

        @media (min-width: 1100px) {
            .block-container {
                max-width: 1440px;
            }

            .gi-featured-player {
                grid-template-columns: 165px minmax(0, 1fr);
                padding: 25px;
            }

            .gi-featured-photo-placeholder {
                width: 145px;
                height: 170px;
            }
        }

        @media (max-width: 760px) {
            .block-container {
                padding-top: 0.8rem;
                padding-left: 0.85rem;
                padding-right: 0.85rem;
            }

            .gi-hero {
                padding: 25px 20px;
                border-radius: 20px;
            }

            .gi-hero-title {
                font-size: 2.25rem;
            }

            .gi-status-strip {
                display: block;
            }

            .gi-status-secondary {
                margin-top: 5px;
            }

            .gi-featured-player {
                grid-template-columns: 96px minmax(0, 1fr);
                gap: 14px;
                padding: 16px;
            }

            .gi-featured-photo-placeholder {
                width: 88px;
                height: 110px;
                border-radius: 15px;
                font-size: 1.6rem;
            }

            .gi-featured-name {
                font-size: 1.25rem;
            }

            .gi-featured-footer {
                display: block;
            }

            .gi-featured-footer span {
                display: block;
                margin-top: 4px;
            }

            .gi-compact-player {
                grid-template-columns: 48px 34px minmax(0, 1fr);
                gap: 9px;
                padding: 12px;
            }

            .gi-compact-photo-placeholder {
                width: 46px;
                height: 46px;
                border-radius: 12px;
                font-size: 0.78rem;
            }

            .gi-full-row {
                grid-template-columns: 36px 40px minmax(0, 1fr) 48px;
                gap: 8px;
            }

            .gi-full-score {
                display: flex;
                font-size: 0.74rem;
            }

            .gi-score-label {
                font-size: 0.58rem;
            }
        }

        @media (max-width: 460px) {
            .gi-featured-player {
                display: block;
            }

            .gi-featured-photo-wrap {
                align-items: flex-start;
                margin-bottom: 14px;
            }

            .gi-featured-photo-placeholder {
                width: 82px;
                height: 82px;
            }

            .gi-photo-note {
                display: none;
            }

            .gi-compact-reason {
                display: none;
            }

            .gi-full-row {
                grid-template-columns: 32px 36px minmax(0, 1fr) auto;
            }

            .gi-card-header {
                gap: 8px;
                grid-template-columns: 32px 40px minmax(0, 1fr) 54px;
                padding: 6px 0 3px;
            }

            .gi-featured-photo {
                height: 112px;
                width: 112px;
            }

            .gi-compact-photo {
                height: 46px;
                width: 46px;
            }

            .gi-full-photo {
                height: 36px;
                width: 36px;
            }

            .gi-native-photo {
                border-radius: 10px;
                height: 38px;
                width: 38px;
            }

            .gi-native-initials {
                border-radius: 10px;
                font-size: 0.68rem;
                height: 38px;
                width: 38px;
            }

            .gi-card-player strong {
                font-size: 0.9rem;
            }

            .gi-card-player span {
                font-size: 0.7rem;
            }

            .gi-card-reason {
                display: -webkit-box;
                overflow: hidden;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 2;
            }

        }
    </style>
    """,
    unsafe_allow_html=True,
)



ALL_RANKING_LISTS = (
    HOME_RUN_RANKINGS, HIT_RANKINGS, TOTAL_BASE_RANKINGS, RUN_RANKINGS,
    RBI_RANKINGS, WALK_RANKINGS, STOLEN_BASE_RANKINGS,
    HITS_RUNS_RBIS_RANKINGS,
)
PLAYER_INTELLIGENCE_LOOKUP: dict[int, dict] = {}
PLAYER_MARKET_CONTEXT: dict[int, list[dict]] = {}

for ranking_list in ALL_RANKING_LISTS:
    for ranked_player in ranking_list:
        player_id = int(ranked_player.get("player_id") or 0)
        if not player_id:
            continue

        PLAYER_MARKET_CONTEXT.setdefault(player_id, []).append(ranked_player)

        current = PLAYER_INTELLIGENCE_LOOKUP.get(player_id)
        current_gi = float((current or {}).get("gi_score", (current or {}).get("score", 0)) or 0)
        candidate_gi = float(
            ranked_player.get("gi_score", ranked_player.get("score", 0)) or 0
        )
        if current is None or candidate_gi > current_gi:
            PLAYER_INTELLIGENCE_LOOKUP[player_id] = ranked_player

def _short_team(value: str) -> str:
    """Compact MLB team names for live intelligence rows."""
    teams = {
        "Arizona Diamondbacks": "ARI",
        "Athletics": "ATH",
        "Atlanta Braves": "ATL",
        "Baltimore Orioles": "BAL",
        "Boston Red Sox": "BOS",
        "Chicago Cubs": "CHC",
        "Chicago White Sox": "CWS",
        "Cincinnati Reds": "CIN",
        "Cleveland Guardians": "CLE",
        "Colorado Rockies": "COL",
        "Detroit Tigers": "DET",
        "Houston Astros": "HOU",
        "Kansas City Royals": "KC",
        "Los Angeles Angels": "LAA",
        "Los Angeles Dodgers": "LAD",
        "Miami Marlins": "MIA",
        "Milwaukee Brewers": "MIL",
        "Minnesota Twins": "MIN",
        "New York Mets": "NYM",
        "New York Yankees": "NYY",
        "Philadelphia Phillies": "PHI",
        "Pittsburgh Pirates": "PIT",
        "San Diego Padres": "SD",
        "San Francisco Giants": "SF",
        "Seattle Mariners": "SEA",
        "St. Louis Cardinals": "STL",
        "Tampa Bay Rays": "TB",
        "Texas Rangers": "TEX",
        "Toronto Blue Jays": "TOR",
        "Washington Nationals": "WSH",
    }
    value = str(value or "").strip()
    return teams.get(value, value)


def _live_contact_text(signal: dict) -> str:
    barrels = int(signal.get("barrel_count") or 0)
    hard_hits = int(signal.get("hard_hit_count") or 0)
    ev = float(signal.get("best_exit_velocity") or 0.0)
    angle = signal.get("best_launch_angle")
    angle_text = (
        f" · {float(angle):.0f}°"
        if isinstance(angle, (int, float))
        else ""
    )

    if barrels:
        label = "Barrel" if barrels == 1 else "Barrels"
        return f"🔥 {barrels} {label} · Best {ev:.1f} mph{angle_text}"

    label = "Hard Hit" if hard_hits == 1 else "Hard Hits"
    return f"💥 {hard_hits} {label} · Best {ev:.1f} mph{angle_text}"


def render_hr_signal_legend() -> None:
    """Explain HR contact symbols and Statcast terms in plain language."""
    with st.expander("ⓘ What do the HR contact signals mean?", expanded=False):
        st.markdown(
            """
            **🔥 Barrel** — a batted ball with a strong combination of exit velocity
            and launch angle associated with extra-base damage and home-run potential.

            **💥 Hard Hit** — a batted ball hit at **95 mph or harder** that does not
            necessarily qualify as a barrel.

            **mph / Exit Velocity** — how fast the ball leaves the bat. Higher is
            generally stronger contact.

            **° / Launch Angle** — the vertical angle at which the ball leaves the bat.
            The angle helps distinguish a ground ball, line drive, or fly ball.

            **Important:** a barrel or hard hit is a contact-quality signal, **not a
            prediction or guarantee** that the player will hit a home run.
            """
        )


def render_live_hr_intelligence(rankings: list[dict]) -> None:
    """Show hard-contact signals for every hitter in live MLB games."""
    live_data = get_live_hr_contact_signals()
    signals = live_data.get("signals", [])

    rank_lookup = {
        int(player.get("player_id")): int(player.get("rank") or 0)
        for player in rankings
        if player.get("player_id") is not None
    }

    top_25 = []
    outside = []

    for signal in signals:
        try:
            player_id = int(signal.get("player_id"))
        except (TypeError, ValueError):
            player_id = None

        if player_id in rank_lookup:
            top_25.append(
                {
                    **signal,
                    "hr_rank": rank_lookup[player_id],
                }
            )
        else:
            outside.append(signal)

    st.markdown("**Live hard-contact signals**")
    st.caption(
        "Live hard-contact signals from all hitters in games currently in progress. "
        "Barrels and 95+ mph hard-hit balls are context signals, not guarantees."
    )

    render_hr_signal_legend()

    if not signals:
        if int(live_data.get("live_game_count") or 0) > 0:
            st.info("No qualifying live hard-contact signals yet.")
        else:
            st.info("No MLB games are currently live.")
        return

    def render_group(title: str, rows: list[dict], show_rank: bool) -> None:
        st.markdown(f"**{title}**")

        if not rows:
            st.caption("None right now.")
            return

        rows.sort(
            key=lambda item: (
                -int(item.get("barrel_count") or 0),
                -float(item.get("best_exit_velocity") or 0.0),
            )
        )

        html_rows = []

        for row in rows:
            away = _short_team(row.get("away_team_name"))
            home = _short_team(row.get("home_team_name"))
            game = f"{away} @ {home}"
            rank_text = (
                f" · HR #{int(row.get('hr_rank') or 0)}"
                if show_rank
                else ""
            )

            html_rows.append(
                f"""
                <div style="
                    padding: 6px 0;
                    border-bottom: 1px solid rgba(148,163,184,0.18);
                    font-size: 0.88rem;
                    line-height: 1.35;
                ">
                    <strong>{escape(str(row.get('player_name') or 'Player'))}</strong>
                    <span style="opacity:.72;"> · {escape(game)}{rank_text}</span>
                    <span> | {escape(_live_contact_text(row))}</span>
                </div>
                """
            )

        render_html("".join(html_rows))

    render_group("⭐ HR TOP 25", top_25[:3], True)
    if len(top_25) > 3:
        with st.expander(f"Show {len(top_25) - 3} more Top 25 signals"):
            render_group("More HR TOP 25", top_25[3:], True)
    st.markdown("")
    render_group("🆕 OUTSIDE HR TOP 25", outside[:3], False)
    if len(outside) > 3:
        with st.expander(f"Show {len(outside) - 3} more outside signals"):
            render_group("More outside HR TOP 25", outside[3:], False)

def render_yesterday_power_watch(
    rankings: list[dict],
) -> None:
    """Show yesterday's strong-contact, no-HR hitters as follow-up context."""
    watch = get_yesterday_hr_near_misses()
    signals = watch.get("signals", [])

    rank_lookup = {
        int(player.get("player_id")): int(
            player.get("rank") or 0
        )
        for player in rankings
        if player.get("player_id") is not None
    }

    today_top_25 = []
    outside_top_25 = []

    for signal in signals:
        try:
            player_id = int(signal.get("player_id"))
        except (TypeError, ValueError):
            player_id = None

        if player_id in rank_lookup:
            today_top_25.append(
                {
                    **signal,
                    "hr_rank": rank_lookup[player_id],
                }
            )
        else:
            outside_top_25.append(signal)

    st.markdown("### 👀 Yesterday's Power Watch")
    st.caption(
        "Yesterday's strongest HR-shaped contact that stayed in the park: "
        "barrels or 100+ mph contact in a 15°–40° launch window, "
        "with all players who homered excluded. Context only — not a 'due' signal."
    )


    if not signals:
        st.info(
            "No qualifying no-HR hard-contact signals were found from yesterday."
        )
        return

    def render_group(
        title: str,
        rows: list[dict],
        show_rank: bool,
    ) -> None:
        st.markdown(f"**{title}**")

        if not rows:
            st.caption("None.")
            return

        rows.sort(
            key=lambda item: (
                -int(item.get("barrel_count") or 0),
                -float(
                    item.get("best_exit_velocity") or 0.0
                ),
            )
        )

        html_rows = []

        for row in rows:
            away = _short_team(
                row.get("away_team_name")
            )
            home = _short_team(
                row.get("home_team_name")
            )
            yesterday_game = f"{away} @ {home}"
            rank_text = (
                f" · Today's HR #{int(row.get('hr_rank') or 0)}"
                if show_rank
                else ""
            )

            html_rows.append(
                f"""
                <div style="
                    padding: 6px 0;
                    border-bottom: 1px solid rgba(148,163,184,0.18);
                    font-size: 0.88rem;
                    line-height: 1.35;
                ">
                    <strong>{escape(str(row.get('player_name') or 'Player'))}</strong>
                    <span style="opacity:.72;">
                        · Yesterday {escape(yesterday_game)}{rank_text}
                    </span>
                    <span> | {escape(_live_contact_text(row))}</span>
                </div>
                """
            )

        render_html("".join(html_rows))

    render_group(
        "⭐ ALSO IN TODAY'S HR TOP 25",
        today_top_25[:3],
        True,
    )
    if len(today_top_25) > 3:
        with st.expander(f"Show {len(today_top_25) - 3} more Top 25 watch signals"):
            render_group("More in today's HR Top 25", today_top_25[3:], True)
    st.markdown("")
    outside_top_25.sort(
        key=lambda item: (
            -int(item.get("barrel_count") or 0),
            -float(item.get("best_exit_velocity") or 0.0),
        )
    )

    render_group(
        "👀 OUTSIDE TODAY'S HR TOP 25",
        outside_top_25[:3],
        False,
    )
    if len(outside_top_25) > 3:
        with st.expander(f"Show {min(len(outside_top_25), 10) - 3} more watch signals"):
            render_group("More outside today's HR Top 25", outside_top_25[3:10], False)



def weather_alert_summary(rankings: list[dict]) -> tuple[int, str]:
    """Return unique meaningful weather alerts represented in ranked games."""
    alerts: dict[object, str] = {}

    for player in rankings:
        weather = player.get("weather", {}) or {}
        if not weather.get("success"):
            continue

        temperature = float(weather.get("temperature_f", 70) or 70)
        wind = float(weather.get("wind_speed_mph", 0) or 0)
        precipitation = float(
            weather.get("precipitation_probability", 0)
            or weather.get("precipitation_probability_percent", 0)
            or 0
        )

        reasons = []
        if precipitation >= 40:
            reasons.append(f"{precipitation:.0f}% rain")
        if wind >= 15:
            reasons.append(f"{wind:.0f} mph wind")
        if temperature >= 90:
            reasons.append(f"{temperature:.0f}°F heat")
        elif temperature <= 45:
            reasons.append(f"{temperature:.0f}°F cold")

        if reasons:
            key = player.get("game_pk") or (player.get("team"), player.get("opponent"))
            alerts[key] = " · ".join(reasons)

    if not alerts:
        return 0, "No meaningful alerts"

    first = next(iter(alerts.values()))
    return len(alerts), first


# ============================================================
# MOBILE-FIRST VISUAL OVERRIDES - PLATFORM V2
# ============================================================

st.markdown(
    """
    <style>
    :root {
        --gi-bg: #000000 !important;
        --gi-panel: #101112 !important;
        --gi-panel-soft: #131415 !important;
        --gi-border: #303236 !important;
        --gi-blue: #19d978 !important;
        --gi-blue-light: #ffffff !important;
        --gi-text: #ffffff !important;
        --gi-muted: #a7abb2 !important;
        --gi-green: #19d978 !important;
        --gi-yellow: #ffcc33 !important;
        --gi-orange: #f0a547 !important;
    }

    .stApp {
        background: #000000 !important;
        color: #ffffff !important;
    }
    .block-container {
        max-width: 1320px;
        padding-top: .35rem !important;
        padding-bottom: 4rem;
    }
    h1, h2, h3, h4, p, li, label, .stMarkdown {
        color: #ffffff;
    }
    [data-testid="stCaptionContainer"], .stCaption, small {
        color: #a7abb2 !important;
    }

    .gi-hero {
        padding: 22px 22px !important;
        margin-bottom: 10px !important;
        border-radius: 18px !important;
        background:
            radial-gradient(circle at 88% 12%, rgba(25,217,120,.34), transparent 34%),
            radial-gradient(circle at 12% 88%, rgba(255,204,51,.26), transparent 38%),
            linear-gradient(135deg, #030403 0%, #111007 48%, #062215 100%) !important;
        border: 2px solid rgba(255,204,51,.86) !important;
        box-shadow: 0 0 0 1px rgba(25,217,120,.22), 0 14px 40px rgba(0,0,0,.52), inset 0 0 34px rgba(25,217,120,.08) !important;
    }
    .gi-eyebrow {
        color: #19d978 !important;
        font-size: .76rem !important;
        letter-spacing: .16em !important;
    }
    .gi-hero-title {
        color: #ffffff !important;
    }
    .gi-hero-subtitle {
        color: #ffffff !important;
        opacity: .92;
        line-height: 1.5 !important;
    }

    .gi-snapshot-heading {
        display:flex; align-items:end; justify-content:space-between; gap:8px; margin:10px 0 7px;
    }
    .gi-snapshot-heading strong { color:#ffffff; font-size:1.08rem; }
    .gi-snapshot-heading span { color:#19d978; font-size:.70rem; font-weight:750; }
    .gi-snapshot-grid {
        display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; margin-bottom:14px;
    }
    .gi-snapshot-card {
        min-width:0; aspect-ratio:1.25/1; padding:10px 8px; border-radius:12px;
        background:#101112; border:2px solid #3b3e43; display:flex; flex-direction:column; justify-content:center;
    }
    .gi-snapshot-card span { color:#a7abb2; font-size:.62rem; font-weight:850; letter-spacing:.08em; }
    .gi-snapshot-card strong { color:#ffffff; font-size:1.32rem; line-height:1.1; margin:4px 0; }
    .gi-snapshot-card small { color:#a7abb2 !important; font-size:.60rem; line-height:1.15; }
    .gi-snapshot-emerald { border-color:rgba(25,217,120,.92); box-shadow:inset 0 0 24px rgba(25,217,120,.09), 0 0 0 1px rgba(25,217,120,.10); }
    .gi-snapshot-emerald strong { color:#19d978; }
    .gi-snapshot-gold { border-color:rgba(255,204,51,.92); box-shadow:inset 0 0 24px rgba(255,204,51,.08), 0 0 0 1px rgba(255,204,51,.10); }
    .gi-snapshot-gold strong { color:#ffcc33; }

    .gi-section-title, .gi-full-list-heading, .gi-compact-name, .gi-card-player strong { color:#ffffff !important; }
    .gi-section-count { color:#000000 !important; background:#ffcc33 !important; border:2px solid #ffe06a !important; box-shadow:0 0 0 1px rgba(255,204,51,.16); }
    .gi-section-subtitle, .gi-compact-reason, .gi-compact-matchup, .gi-card-reason { color:#c4c7cc !important; }
    .gi-score-inline, .gi-card-score strong { color:#ffcc33 !important; }
    .gi-card-rank, .gi-compact-rank { color:#19d978 !important; }

    .gi-compact-player {
        background:#101112 !important;
        border:2px solid #3a3d42 !important;
        border-left:5px solid #19d978 !important;
        box-shadow:inset 0 0 24px rgba(25,217,120,.035);
    }
    .gi-compact-player:nth-of-type(odd) { border-left-color:#ffcc33 !important; box-shadow:inset 0 0 24px rgba(255,204,51,.035); }

    .gi-featured-photo, .gi-compact-photo, .gi-full-photo, .gi-native-photo {
        background:#050505 !important; border:2px solid rgba(255,204,51,.65) !important;
    }
    .gi-featured-photo img, .gi-compact-photo img, .gi-full-photo img, .gi-native-photo img {
        width:100% !important; height:100% !important; object-fit:cover !important; object-position:center 16% !important; transform:scale(1.12);
    }
    .gi-compact-photo-placeholder, .gi-full-photo-placeholder, .gi-native-initials {
        background:#0a0b0b !important; color:#ffffff !important; border-color:#19d978 !important;
    }

    [class*="st-key-show_"][class*="_player_"] {
        background:#101112 !important; border:2px solid #3a3d42 !important; border-left:5px solid #19d978 !important; border-radius:14px !important;
        box-shadow:inset 0 0 24px rgba(25,217,120,.035) !important;
    }
    [class*="st-key-show_"][class*="_player_"] .stButton > button {
        background:#0b0c0d !important; color:#ffffff !important; border:2px solid rgba(25,217,120,.72) !important;
        border-radius:9px !important; text-align:center !important; justify-content:center !important;
    }
    [class*="st-key-show_"][class*="_player_"] .stButton > button:hover {
        border-color:#ffcc33 !important; color:#ffcc33 !important;
    }

    .gi-lineup-confirmed { color:#ffffff !important; background:rgba(25,217,120,.16) !important; border-color:rgba(25,217,120,.55) !important; }
    .gi-result-live, .gi-result-win { color:#19d978 !important; }

    div[data-testid="stExpander"] { background:#080909 !important; border:2px solid #34373c !important; border-radius:12px !important; }
    div[data-testid="stExpander"] summary { color:#ffffff !important; }
    div[data-testid="stExpander"] summary:hover { color:#19d978 !important; }

    div[data-testid="stTabs"] button { color:#b8bbc0 !important; }
    div[data-testid="stTabs"] button[aria-selected="true"] { color:#ffffff !important; }
    div[data-testid="stTabs"] [data-baseweb="tab-highlight"] { background:#19d978 !important; }

    button[kind="secondary"], .stButton > button {
        background:#0c0d0e !important; color:#ffffff !important; border:2px solid #3a3d42 !important;
    }
    .stButton > button:hover { border-color:#19d978 !important; color:#ffffff !important; }

    /* MLB final visual-strength pass */
    div[data-testid="stMetric"] {
        border-width:2px !important;
        border-color:#3a3d42 !important;
    }
    .gi-before-ranking,
    .gi-status-strip,
    .gi-full-row,
    .gi-featured-player,
    .gi-rank-badge,
    .gi-full-list-heading {
        border-width:2px !important;
    }
    .gi-lineup-status {
        border-width:2px !important;
    }

    @media (max-width:700px) {
        .gi-hero { padding:16px 15px !important; border-radius:15px !important; border-width:2px !important; }
        .gi-hero-title { font-size:1.82rem !important; line-height:1.08 !important; }
        .gi-hero-subtitle { font-size:.92rem !important; margin-top:10px !important; }
        .gi-snapshot-grid { gap:6px; }
        .gi-snapshot-card { aspect-ratio:auto; min-height:88px; padding:10px 7px; border-width:2px !important; }
        .gi-snapshot-card span { font-size:.70rem !important; font-weight:900 !important; color:#ffffff !important; }
        .gi-snapshot-card strong { font-size:1.42rem !important; }
        .gi-snapshot-card small { font-size:.70rem !important; color:#ffffff !important; font-weight:650 !important; }
        .gi-snapshot-heading span { max-width:45%; text-align:right; }
        .gi-section-title { font-size:1.03rem !important; }
        .gi-section-subtitle { font-size:.88rem !important; line-height:1.42; color:#ffffff !important; }
        .gi-compact-player { padding:11px 9px !important; gap:9px !important; grid-template-columns:54px 34px minmax(0,1fr) !important; }
        .gi-compact-name { font-size:1.02rem !important; }
        .gi-compact-reason { font-size:.88rem !important; color:#ffffff !important; }
        .gi-card-header { grid-template-columns:34px 50px minmax(0,1fr) 48px !important; gap:7px !important; padding:8px 2px !important; }
        .gi-native-photo { height:50px !important; width:50px !important; }
        .gi-card-player strong { font-size:.96rem !important; }
        .gi-card-player span { font-size:.82rem !important; color:#ffffff !important; }
    }
    
        /* ============================================================
           MLB MOBILE CLOSEOUT PASS
           ============================================================ */
        @media (max-width: 700px) {
            .block-container {
                padding-top: .35rem !important;
                padding-left: .85rem !important;
                padding-right: .85rem !important;
                padding-bottom: 2rem !important;
            }

            /* Tighten major vertical rhythm without shrinking type. */
            [data-testid="stVerticalBlock"] { gap: .65rem !important; }
            h1, h2, h3 { margin-top: .45rem !important; margin-bottom: .35rem !important; }
            hr { margin: .55rem 0 !important; }

            .gi-hero {
                padding: 14px 14px !important;
                margin-top: 0 !important;
                margin-bottom: 10px !important;
                background:
                    linear-gradient(105deg,
                        rgba(255,204,51,.28) 0%,
                        rgba(4,5,4,.98) 44%,
                        rgba(25,217,120,.28) 100%) !important;
                border: 2px solid rgba(255,204,51,.88) !important;
                box-shadow:
                    inset 0 0 24px rgba(25,217,120,.08),
                    0 0 0 1px rgba(25,217,120,.18) !important;
            }
            .gi-hero-title { font-size: 1.85rem !important; }
            .gi-hero-subtitle { font-size: .95rem !important; line-height: 1.45 !important; margin-top: 9px !important; }

            /* All Streamlit expanders stay dark when open. */
            div[data-testid="stExpander"] {
                background:#080909 !important;
                border:2px solid #3a3d42 !important;
                border-radius:12px !important;
                overflow:hidden !important;
            }
            div[data-testid="stExpander"] details,
            div[data-testid="stExpander"] summary,
            div[data-testid="stExpander"] summary:hover,
            div[data-testid="stExpander"] summary:focus {
                background:#080909 !important;
                color:#ffffff !important;
            }
            div[data-testid="stExpander"] summary svg { color:#19d978 !important; }

            /* Remove old blue info/status surfaces. */
            div[data-testid="stAlert"] {
                background:#0c0d0e !important;
                color:#ffffff !important;
                border:2px solid rgba(25,217,120,.45) !important;
            }

            /* Ranking cards: one emerald system for Top 5 and 6-25. */
            div[class*="_top5_player_"] [data-testid="stVerticalBlockBorderWrapper"],
            div[class*="_player_"] [data-testid="stVerticalBlockBorderWrapper"] {
                background:
                    linear-gradient(100deg,
                        rgba(25,217,120,.12) 0%,
                        #101112 18%,
                        #101112 82%,
                        rgba(25,217,120,.035) 100%) !important;
                border:2px solid #3a3d42 !important;
                border-left:6px solid #19d978 !important;
                border-radius:16px !important;
                box-shadow:
                    inset 1px 0 0 rgba(25,217,120,.72),
                    inset 0 0 24px rgba(25,217,120,.035) !important;
            }

            .gi-card-header {
                padding: 8px 6px !important;
                gap: 8px !important;
            }
            .gi-native-photo, .gi-native-initials {
                width: 52px !important;
                height: 52px !important;
            }
            .gi-native-photo img {
                object-fit: cover !important;
                object-position: center 12% !important;
                transform: scale(1.02) !important;
            }

            /* Active tabs use emerald, never red. */
            div[data-testid="stTabs"] [data-baseweb="tab-highlight"] {
                background:#19d978 !important;
            }
            div[data-testid="stTabs"] button[aria-selected="true"] {
                color:#ffffff !important;
            }

            /* Strong, intentional action buttons. */
            .stButton > button {
                border-width:2px !important;
                border-color:#3a3d42 !important;
                background:#0b0c0d !important;
            }
            .stButton > button:hover {
                border-color:#19d978 !important;
                box-shadow:0 0 0 1px rgba(25,217,120,.18) !important;
            }

            /* Less dead space around ranking headings. */
            .gi-section-heading { margin: 8px 0 8px !important; }
            .gi-full-list-heading { margin: 10px 0 7px !important; }
        }


    /* ============================================================
       MLB PHONE CLOSEOUT — PASS 2
       ============================================================ */
    @media (max-width: 700px) {
        [data-testid="stAppViewContainer"] .block-container,
        .main .block-container {
            padding-top: 0 !important;
            margin-top: 0 !important;
        }

        .gi-hero {
            margin-top: -0.35rem !important;
            margin-bottom: 0.45rem !important;
            padding: 12px 13px !important;
        }

        div[data-testid="stAlert"] {
            border-radius: 14px !important;
            overflow: hidden !important;
            background: linear-gradient(
                105deg,
                rgba(25,217,120,.08),
                #0b0c0d 52%,
                rgba(255,204,51,.04)
            ) !important;
            border: 2px solid rgba(25,217,120,.48) !important;
        }

        [data-testid="stTabs"] [data-baseweb="tab-highlight"],
        [data-baseweb="tab-highlight"] {
            background-color: #19d978 !important;
        }

        [data-testid="stTabs"] button[role="tab"][aria-selected="true"],
        button[data-baseweb="tab"][aria-selected="true"] {
            color: #ffffff !important;
            box-shadow: inset 0 -3px 0 #19d978 !important;
            border-bottom-color: #19d978 !important;
        }

        [data-testid="stTabs"] button[aria-label*="scroll" i],
        [data-testid="stTabs"] button[title*="scroll" i],
        [data-baseweb="tab-list"] + button,
        [data-baseweb="tab-list"] ~ button {
            background: #080909 !important;
            color: #f6c84c !important;
            border: 1px solid #34373c !important;
            box-shadow: none !important;
        }

        [data-testid="stVerticalBlock"] {
            gap: .48rem !important;
        }

        h2, h3 {
            margin-top: .35rem !important;
            margin-bottom: .28rem !important;
        }

        hr {
            margin: .38rem 0 !important;
        }

        .stButton > button,
        div[data-testid="stExpander"] {
            border-width: 2px !important;
        }
    }


    /* ============================================================
       FINAL MLB MOBILE CLOSEOUT — authoritative overrides
       ============================================================ */
    .gi-card-pitcher {
        color:#f6c84c !important;
        font-size:.73rem !important;
        margin-top:1px !important;
    }
    .gi-card-pitcher b {
        color:#f6c84c !important;
        font-weight:850 !important;
    }

    .gi-rankings-banner {
        margin:.45rem 0 .55rem;
        padding:11px 14px;
        border:2px solid rgba(214,179,92,.68);
        border-radius:15px;
        background:
            linear-gradient(
                105deg,
                rgba(214,179,92,.20) 0%,
                #080909 48%,
                rgba(47,191,113,.18) 100%
            );
    }
    .gi-rankings-banner strong {
        display:block;
        color:#fff;
        font-size:1.35rem;
        font-weight:900;
    }
    .gi-rankings-banner span {
        display:block;
        color:#b8b09f;
        font-size:.70rem;
        margin-top:2px;
    }

    /* Player photos: one consistent circular treatment across every MLB ranking card. */
    .gi-featured-photo,
    .gi-native-photo,
    .gi-compact-photo,
    .gi-full-photo,
    .gi-featured-photo-placeholder,
    .gi-compact-photo-placeholder,
    .gi-full-photo-placeholder,
    .gi-native-initials {
        border-radius:50% !important;
        overflow:hidden !important;
        aspect-ratio:1 / 1 !important;
        background:#0b0d0e !important;
        border:2px solid rgba(214,179,92,.86) !important;
        box-shadow:0 0 0 1px rgba(25,217,120,.18) !important;
    }
    .gi-featured-photo img,
    .gi-native-photo img,
    .gi-compact-photo img,
    .gi-full-photo img {
        width:100% !important;
        height:100% !important;
        object-fit:cover !important;
        object-position:center 28% !important;
        transform:none !important;
        border-radius:50% !important;
    }

    /* Stronger finished expander/button language. */
    div[data-testid="stExpander"] {
        background:#080909 !important;
        border:2px solid #3a3d42 !important;
        border-radius:14px !important;
        overflow:hidden !important;
    }
    div[data-testid="stExpander"] summary,
    div[data-testid="stExpander"] details {
        background:#080909 !important;
        color:#fff !important;
    }

    /* Kill native navy/blue alert surfaces. */
    div[data-testid="stAlert"],
    div[data-testid="stAlert"] > div,
    div[role="alert"] {
        background:#090b0a !important;
        background-color:#090b0a !important;
        color:#fff !important;
        border-radius:14px !important;
    }

    /* No red active tabs anywhere on MLB. Batter/Pitcher = emerald;
       market tabs = gold for better palette balance. */
    [data-testid="stTabs"] [data-baseweb="tab-highlight"],
    [data-baseweb="tab-highlight"] {
        background:#d6b35c !important;
        background-color:#d6b35c !important;
    }
    [data-testid="stTabs"] button[role="tab"][aria-selected="true"],
    button[data-baseweb="tab"][aria-selected="true"] {
        color:#fff !important;
        border-bottom-color:#d6b35c !important;
        box-shadow:inset 0 -3px 0 #d6b35c !important;
    }

    @media (max-width:700px) {
        /* Remove the large black dead zone above the hero. */
        [data-testid="stAppViewBlockContainer"],
        [data-testid="stAppViewContainer"] .block-container,
        .main .block-container,
        .block-container {
            padding-top:0 !important;
            margin-top:0 !important;
        }
        .gi-hero {
            margin-top:.35rem !important;
            margin-bottom:.45rem !important;
            padding:14px 14px !important;
        }

        /* Compact player imagery and spacing. */
        .gi-native-photo {
            width:48px !important;
            height:48px !important;
        }
        .gi-card-header {
            grid-template-columns:44px 52px minmax(0,1fr) 58px !important;
            gap:8px !important;
            padding:7px 2px 4px !important;
        }

        /* Keep section rhythm tight. */
        h2, h3 {
            margin-top:.25rem !important;
            margin-bottom:.22rem !important;
        }
        hr {
            margin:.30rem 0 !important;
        }
    }

</style>
    """,
    unsafe_allow_html=True,
)

# ============================================================
# PAGE CONTENT
# ============================================================

toronto_now = get_toronto_now()
refreshed_time = toronto_now.strftime("%B %d, %Y at %I:%M %p ET")

# MLB-level refresh controls live above the hero as one right-aligned utility block.
st.markdown(
    """
    <style>
    /* Refresh and Updated are one right-aligned utility block above the hero. */
    div[class*="st-key-mlb_page_refresh"] {
      display:flex!important;
      justify-content:flex-end!important;
      align-items:center!important;
      width:100%!important;
      margin:2px 0 4px!important;
    }
    div[class*="st-key-mlb_page_refresh"] > div {
      width:auto!important;
    }
    div[class*="st-key-mlb_page_refresh"] button {
      width:auto!important;
      min-width:108px!important;
      height:40px!important;
      min-height:40px!important;
      padding:0 13px!important;
      margin:0!important;
      background:#090a0b!important;
      color:#d6b35c!important;
      border:1.5px solid #d6b35c!important;
      border-radius:9px!important;
      box-shadow:0 0 0 1px rgba(214,179,92,.10)!important;
      font-size:.74rem!important;
      font-weight:900!important;
      letter-spacing:.025em!important;
      line-height:1!important;
      white-space:nowrap!important;
    }
    div[class*="st-key-mlb_page_refresh"] button:hover,
    div[class*="st-key-mlb_page_refresh"] button:focus {
      background:#111312!important;
      color:#f6c84c!important;
      border-color:#f6c84c!important;
      box-shadow:0 0 0 2px rgba(214,179,92,.14)!important;
    }
    .mlb-page-refresh-time {
      width:100%;
      text-align:right;
      color:#c2c5ca;
      font-size:.82rem;
      font-weight:700;
      line-height:1.25;
      margin:0 0 10px 0;
      white-space:nowrap;
    }
    @media(max-width:700px){
      div[class*="st-key-mlb_page_refresh"] { margin-top:2px!important; }
      .mlb-page-refresh-time { font-size:.84rem; margin-bottom:10px; }
    }
    </style>
    """,
    unsafe_allow_html=True,
)

if st.button("⟳  REFRESH", key="mlb_page_refresh", help="Refresh MLB data"):
    load_today_schedule.clear()
    load_today_lineups.clear()
    st.rerun()

st.markdown(
    f'<div class="mlb-page-refresh-time">Updated {toronto_now.strftime("%A · %I:%M %p ET")}</div>',
    unsafe_allow_html=True,
)

render_html(
    """
    <section class="gi-hero">
        <h1 class="gi-hero-title">
            MLB Intelligence Center
        </h1>

        <p class="gi-hero-subtitle">
            Start with the strongest players in each market, review the reason
            behind every ranking, and open the full Top 25 only when you need
            more depth.
        </p>
    </section>
    """
)


def render_emerging_power_watch() -> None:
    """Surface low-HR / limited-sample hitters with evidence-backed upside."""
    raw_pool = load_emerging_power_pool()
    candidates = build_emerging_power_candidates(raw_pool, limit=10)

    st.markdown("**Emerging Power · low-HR & limited-sample hitters**")
    st.caption(
        "This view looks for players whose low season HR total may hide stronger underlying "
        "matchup/contact evidence. A player is never included simply because they are 'due'."
    )

    if not candidates:
        st.info("No evidence-backed emerging-power signals qualify right now.")
        return

    def render_rows(rows: list[dict]) -> None:
        html_rows = []
        for row in rows:
            name = escape(str(row.get("player_name") or "Player"))
            team = escape(str(row.get("team_abbreviation") or row.get("team_name") or ""))
            opponent = escape(str(row.get("opponent_abbreviation") or row.get("opponent_name") or ""))
            season_hr = int(row.get("season_home_runs") or 0)
            gi = float(row.get("gi_score") or 0)
            probability = float(row.get("home_run_probability") or 0)
            rookie_tag = (
                " · ROOKIE/LIMITED SAMPLE"
                if row.get("current_year_debut") or row.get("limited_sample")
                else ""
            )
            evidence = emerging_power_explanation(row)
            reason = escape(evidence[0] if evidence else "Underlying power indicators are being evaluated.")

            html_rows.append(
                f"""
                <div style="
                    padding:9px 0;
                    border-bottom:1px solid rgba(148,163,184,.18);
                    line-height:1.35;
                ">
                    <div>
                        <strong>{name}</strong>
                        <span style="opacity:.72;"> · {team} vs {opponent}{escape(rookie_tag)}</span>
                    </div>
                    <div style="margin-top:3px;color:#f6c84c;font-size:.82rem;">
                        {season_hr} season HR · GI {gi:.1f}
                        {f" · {probability:.0f}% HR" if probability else ""}
                    </div>
                    <div style="margin-top:3px;color:#b8bbc1;font-size:.78rem;">
                        {reason}
                    </div>
                </div>
                """
            )
        render_html("".join(html_rows))

    render_rows(candidates[:4])
    if len(candidates) > 4:
        with st.expander(f"Show {len(candidates) - 4} more emerging-power signals"):
            render_rows(candidates[4:])



st.markdown(
    """
    <style>
    /* The MLB Games entry IS the action — no second "open slate" button. */
    div[class*="st-key-mlb_games_entry"] button {
        width:100%!important;
        min-height:82px!important;
        padding:12px 15px!important;
        margin:4px 0 10px!important;
        text-align:left!important;
        justify-content:flex-start!important;
        border:1.5px solid rgba(214,179,92,.68)!important;
        border-left:5px solid #19d978!important;
        border-radius:13px!important;
        background:
            linear-gradient(
                112deg,
                rgba(246,200,76,.12) 0%,
                #0d0f10 36%,
                #0b0d0e 68%,
                rgba(25,217,120,.10) 100%
            )!important;
        color:#fff!important;
        font-weight:900!important;
        white-space:pre-line!important;
        line-height:1.28!important;
    }
    div[class*="st-key-mlb_games_entry"] button:hover {
        border-color:#f6c84c!important;
        border-left-color:#19d978!important;
        box-shadow:inset 0 0 0 1px rgba(25,217,120,.15)!important;
    }
    div[class*="st-key-mlb_games_entry"] button p {
        margin:0!important;
        font-size:.84rem!important;
        line-height:1.32!important;
    }
    @media(max-width:700px){
        div[class*="st-key-mlb_games_entry"] button{
            min-height:78px!important;
            padding:11px 13px!important;
        }
        div[class*="st-key-mlb_games_entry"] button p{
            font-size:.80rem!important;
        }
    }
    </style>
    """,
    unsafe_allow_html=True,
)

if st.button(
    "⚾ TODAY'S MLB GAMES  ›  Open today's slate, lineups & Game Intelligence",
    key="mlb_games_entry",
    use_container_width=True,
):
    st.session_state.pop("mlb_selected_game", None)
    st.session_state["mlb_ranked_player_lookup"] = PLAYER_INTELLIGENCE_LOOKUP
    st.session_state["mlb_player_market_context"] = PLAYER_MARKET_CONTEXT
    st.switch_page("pages/mlb_games.py")

# The snapshot still needs game + lineup totals, but the slate itself now lives
# on its own page and is not rendered inside the MLB Intelligence page.
live_schedule = load_today_schedule()
live_schedule["lineup_data"] = load_today_lineups()
live_summary = schedule_summary(live_schedule)

confirmed_teams = live_summary.get("lineups_confirmed", 0)
total_teams = live_summary.get("lineups_total", 0)
pending_teams = max(total_teams - confirmed_teams, 0)
weather_count, weather_note = weather_alert_summary(HOME_RUN_RANKINGS)
lineup_note = "Confirmed" if pending_teams == 0 and total_teams else f"{pending_teams} pending"
weather_short = "Clear" if weather_count == 0 else f"{weather_count} alert{'s' if weather_count != 1 else ''}"

render_html(
    f"""
    <div class="gi-snapshot-heading">
        <strong>Today's MLB Snapshot</strong>
        <span>Always confirm starting lineups</span>
    </div>
    <div class="gi-snapshot-grid">
        <div class="gi-snapshot-card gi-snapshot-emerald">
            <span>GAMES</span>
            <strong>{live_summary['games']}</strong>
            <small>{live_summary['live']} live · {live_summary['final']} final</small>
        </div>
        <div class="gi-snapshot-card">
            <span>LINEUPS</span>
            <strong>{confirmed_teams}/{total_teams}</strong>
            <small>{lineup_note}</small>
        </div>
        <div class="gi-snapshot-card gi-snapshot-gold">
            <span>WEATHER</span>
            <strong>{weather_count}</strong>
            <small>{weather_short}</small>
        </div>
    </div>
    """
)
st.markdown("### 🔥 HR Intelligence")
hr_intel_view = st.segmented_control(
    "HR Intelligence view",
    options=["Live HR", "Yesterday", "Emerging Power"],
    default="Live HR",
    key="mlb_hr_intelligence_view",
    selection_mode="single",
    label_visibility="collapsed",
) or "Live HR"

if hr_intel_view == "Live HR":
    render_live_hr_intelligence(HOME_RUN_RANKINGS)
elif hr_intel_view == "Yesterday":
    render_yesterday_power_watch(HOME_RUN_RANKINGS)
else:
    render_emerging_power_watch()

st.divider()

render_prediction_performance_tracker(
    {
        "home_runs": HOME_RUN_RANKINGS,
        "hits": HIT_RANKINGS,
        "total_bases": TOTAL_BASE_RANKINGS,
        "runs": RUN_RANKINGS,
        "rbis": RBI_RANKINGS,
        "walks": WALK_RANKINGS,
        "stolen_bases": STOLEN_BASE_RANKINGS,
        "hits_runs_rbis": HITS_RUNS_RBIS_RANKINGS,
    }
)

st.divider()

render_html(
    """
    <div class="gi-rankings-heading">
        <strong>Player Rankings</strong>
        <span>Market-specific intelligence · live matchup context</span>
    </div>
    """
)

batter_tab, pitcher_tab = st.tabs(
    [
        "🥎 Batter",
        "⚾ Pitcher",
    ]
)

with batter_tab:
    (
        home_run_tab, hits_tab, total_bases_tab, runs_tab,
        rbis_tab, walks_tab, stolen_bases_tab, hrr_tab,
    ) = st.tabs(
        [
            "🔥 Home Runs", "⚾ Hits", "💥 Total Bases",
            "🏃 Runs", "🎯 RBIs", "👁️ Walks", "💨 Stolen Bases",
            "📊 H+R+RBI",
        ]
    )

    with home_run_tab:
        render_ranking_category(
            title="Home Run",
            icon="🔥",
            rankings=HOME_RUN_RANKINGS,
            state_key="show_hr_25",
            button_key="toggle_hr_25",
            movement_summary=MOVEMENT_SUMMARIES.get("home_runs", []),
            category_key="home_runs",
        )

    with hits_tab:
        render_ranking_category(
            title="Hit",
            icon="⚾",
            rankings=HIT_RANKINGS,
            state_key="show_hits_25",
            button_key="toggle_hits_25",
            movement_summary=MOVEMENT_SUMMARIES.get("hits", []),
            category_key="hits",
        )

    with total_bases_tab:
        render_ranking_category(
            title="Total Base",
            icon="💥",
            rankings=TOTAL_BASE_RANKINGS,
            state_key="show_tb_25",
            button_key="toggle_tb_25",
            movement_summary=MOVEMENT_SUMMARIES.get("total_bases", []),
            category_key="total_bases",
        )

    with runs_tab:
        render_ranking_category(
            title="Run",
            icon="🏃",
            rankings=RUN_RANKINGS,
            state_key="show_runs_25",
            button_key="toggle_runs_25",
            movement_summary=[],
            category_key="runs",
        )

    with rbis_tab:
        render_ranking_category(
            title="RBI",
            icon="🎯",
            rankings=RBI_RANKINGS,
            state_key="show_rbis_25",
            button_key="toggle_rbis_25",
            movement_summary=[],
            category_key="rbis",
        )

    with walks_tab:
        render_ranking_category(
            title="Walk",
            icon="👁️",
            rankings=WALK_RANKINGS,
            state_key="show_walks_25",
            button_key="toggle_walks_25",
            movement_summary=[],
            category_key="walks",
        )

    with stolen_bases_tab:
        render_ranking_category(
            title="Stolen Base",
            icon="💨",
            rankings=STOLEN_BASE_RANKINGS,
            state_key="show_sb_25",
            button_key="toggle_sb_25",
            movement_summary=[],
            category_key="stolen_bases",
        )

    with hrr_tab:
        render_ranking_category(
            title="Hits + Runs + RBIs",
            icon="📊",
            rankings=HITS_RUNS_RBIS_RANKINGS,
            state_key="show_hrr_25",
            button_key="toggle_hrr_25",
            movement_summary=MOVEMENT_SUMMARIES.get("hits_runs_rbis", []),
            category_key="hits_runs_rbis",
        )

with pitcher_tab:
    render_pitcher_rankings()

st.divider()

st.caption(
    "Sach Sports Dashboard · MLB Intelligence"
)


st.markdown(
    """
    <style>
    /* MLB acceptance spacing and selection rules */
    .gi-rankings-heading{
        margin:.20rem 0 .45rem!important;padding:5px 2px!important;background:#080909!important;
        border:0!important;
    }
    .gi-rankings-heading strong{display:block!important;color:#fff!important;font-size:1.35rem!important;font-weight:900!important}
    .gi-rankings-heading span{display:block!important;color:#b8b09f!important;font-size:.70rem!important;margin-top:1px!important}

    /* 25 ranked badge must never touch first card. */
    .gi-section-heading{margin:5px 0 12px!important;align-items:flex-start!important}
    .gi-section-count{font-size:.66rem!important;padding:4px 7px!important;margin:0 0 6px!important}

    /* Confirmed/projected lineup pill must clear View Intelligence. */
    .gi-lineup-status{display:inline-block!important;margin:5px 0 9px!important}
    [class*="st-key-show_"][class*="_player_"] .stButton{margin-top:7px!important}
    [class*="st-key-show_"][class*="_player_"] .stButton>button{margin-top:0!important}

    .gi-card-rank small{color:#f6c84c!important;font-size:.60rem!important;font-weight:900!important;white-space:nowrap!important}

    [data-testid="stTabs"] [data-baseweb="tab-highlight"],[data-baseweb="tab-highlight"]{
        background:#d6b35c!important;background-color:#d6b35c!important;
    }
    [data-testid="stTabs"] button[role="tab"][aria-selected="true"],button[data-baseweb="tab"][aria-selected="true"]{
        box-shadow:inset 0 -3px 0 #d6b35c!important;border-bottom-color:#d6b35c!important;color:#fff!important;
    }
    @media(max-width:700px){
        .gi-rankings-heading{margin:.12rem 0 .25rem!important;padding:3px 2px!important}
        .gi-section-heading{margin:3px 0 11px!important}
        .gi-lineup-status{margin-bottom:9px!important}
    }
    </style>
    """,
    unsafe_allow_html=True,
)


st.markdown(
    """
    <style>
    /* MOBILE RANKING EXPLANATION FIX — keep desktop explanation visible on phone */
    @media (max-width: 760px) {
        .gi-section-subtitle {
            display: block !important;
            visibility: visible !important;
            color: #c4c7cc !important;
            font-size: 0.78rem !important;
            line-height: 1.35 !important;
            margin-top: 4px !important;
            max-width: 100% !important;
        }
    }
    </style>
    """,
    unsafe_allow_html=True,
)


st.markdown(
    """
    <style>
    /* LOCKED COMPACT TOP-25 CARD REDESIGN */
    [class*="st-key-show_"][class*="_player_"],
    [class*="st-key-show_"][class*="_top5_player_"]{
        padding:2px 8px 7px!important;
        margin-bottom:8px!important;
    }

    .gi-card-header{
        grid-template-columns:38px 54px minmax(0,1fr) 54px!important;
        gap:7px!important;
        align-items:start!important;
        padding:5px 1px 2px!important;
    }

    .gi-card-rank{
        padding-top:5px!important;
        font-size:.92rem!important;
        line-height:1!important;
    }

    .gi-card-rank small{
        margin-top:5px!important;
        font-size:.55rem!important;
        line-height:1!important;
    }

    .gi-native-photo,.gi-native-initials{
        width:52px!important;
        height:52px!important;
        min-width:52px!important;
        min-height:52px!important;
        border-radius:50%!important;
        border:2px solid rgba(214,179,92,.86)!important;
        overflow:hidden!important;
        background:#080909!important;
    }

    .gi-native-photo img{
        width:100%!important;
        height:100%!important;
        object-fit:contain!important;
        object-position:center center!important;
        border-radius:50%!important;
        background:#080909!important;
    }

    .gi-card-player{
        gap:1px!important;
        align-self:start!important;
    }
    .gi-card-player>strong{
        font-size:.92rem!important;
        line-height:1.08!important;
        margin-bottom:1px!important;
    }
    .gi-card-player>span{
        font-size:.69rem!important;
        line-height:1.18!important;
    }
    .gi-card-matchup{
        white-space:nowrap!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
    }
    .gi-card-reason{
        display:-webkit-box!important;
        -webkit-line-clamp:2!important;
        -webkit-box-orient:vertical!important;
        overflow:hidden!important;
        margin-top:2px!important;
        color:#e5e7eb!important;
    }

    .gi-card-score{
        align-self:start!important;
        padding-top:5px!important;
    }
    .gi-card-score small{font-size:.50rem!important}
    .gi-card-score strong{font-size:.88rem!important;margin-top:2px!important}

    .gi-lineup-status{
        display:inline-block!important;
        width:auto!important;
        margin:3px 0 2px!important;
        padding:3px 7px!important;
        border-radius:999px!important;
        font-size:.58rem!important;
        line-height:1.08!important;
        white-space:nowrap!important;
    }

    [class*="st-key-show_"][class*="_player_"] .stButton,
    [class*="st-key-show_"][class*="_top5_player_"] .stButton{
        margin-top:3px!important;
    }
    [class*="st-key-show_"][class*="_player_"] .stButton>button,
    [class*="st-key-show_"][class*="_top5_player_"] .stButton>button{
        min-height:34px!important;
        padding:.15rem .55rem!important;
        font-size:.72rem!important;
        border-radius:9px!important;
    }

    @media(max-width:700px){
        .gi-card-header{
            grid-template-columns:34px 50px minmax(0,1fr) 48px!important;
            gap:6px!important;
        }
        .gi-native-photo,.gi-native-initials{
            width:48px!important;height:48px!important;
            min-width:48px!important;min-height:48px!important;
        }
        .gi-card-player>strong{font-size:.88rem!important}
        .gi-card-player>span{font-size:.66rem!important}
    }
    </style>
    """,
    unsafe_allow_html=True,
)



st.markdown(
    """
    <style>
    /* MLB LOAD STABILITY: keep Top-25 cards anchored while Streamlit hydrates. */
    [data-testid="stMainBlockContainer"],
    .block-container,
    [data-testid="stVerticalBlock"],
    [data-testid="stElementContainer"]{
        box-sizing:border-box!important;
        max-width:100%!important;
        min-width:0!important;
    }
    [data-testid="stMainBlockContainer"],
    .block-container{
        width:100%!important;
        margin-left:auto!important;
        margin-right:auto!important;
        overflow-x:hidden!important;
    }
    [class*="st-key-show_"][class*="_player_"],
    [class*="st-key-show_"][class*="_top5_player_"],
    .gi-card-header{
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        transform:none!important;
        translate:none!important;
        transition:none!important;
        animation:none!important;
    }
    @media(max-width:700px){
        html,body,[data-testid="stAppViewContainer"],.stApp{
            overflow-x:hidden!important;
        }
    }
    </style>
    """,
    unsafe_allow_html=True,
)
