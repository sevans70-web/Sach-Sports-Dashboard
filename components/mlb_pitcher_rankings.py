"""Mobile-first MLB pitcher rankings with durable movement snapshots."""

from __future__ import annotations

from datetime import datetime
from html import escape
import os
from zoneinfo import ZoneInfo
import streamlit as st

from engines.mlb_pitcher_intelligence import get_pitcher_rankings
from Utils.intraday_rankings import (
    GitHubSnapshotConfig,
    RankingSnapshotError,
    load_compare_and_save,
)

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")

CATEGORY_CONFIG = {
    "strikeouts": ("🎯 Strikeouts", "K"),
    "outs_recorded": ("⏱️ Outs", "outs"),
    "hits_allowed": ("⚾ Hits Allowed", "hits"),
    "walks_allowed": ("◉ Walks Allowed", "BB"),
    "earned_runs": ("● Earned Runs", "ER"),
}


def _render_html(html: str) -> None:
    """Render compact HTML as one line so Streamlit never exposes raw tags."""
    clean = " ".join(line.strip() for line in html.splitlines() if line.strip())
    st.markdown(clean, unsafe_allow_html=True)


def _token() -> str | None:
    return os.getenv("SACH_GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN")


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
                "opponent": row.get("opponent_name") or "",
                "score": row.get("gi_score"),
            })
    return normalized


def _attach_persistent_movement(rankings: dict[str, list[dict]]) -> dict[str, list[dict]]:
    """Use GitHub-backed snapshots so movement survives refreshes/restarts."""
    token = _token()
    if not token:
        return _attach_session_fallback(rankings)

    try:
        result = load_compare_and_save(
            config=GitHubSnapshotConfig(
                repository="sevans70-web/Sach-Sports-Dashboard",
                token=token,
                branch="main",
                path="data/intraday_pitcher_rankings.json",
            ),
            category_rankings=_normalized_rankings(rankings),
            captured_at=datetime.now(TORONTO_TIMEZONE),
        )

        comparisons = result.get("comparisons", {})
        has_previous = result.get("previous_snapshot") is not None

        for category, rows in rankings.items():
            lookup = {
                str(item.get("player_key")): item.get("movement", {})
                for item in comparisons.get(category, {}).get("current", [])
            }
            for row in rows:
                key = str(row.get("pitcher_id") or str(row.get("pitcher_name") or "").casefold())
                row["movement"] = lookup.get(
                    key,
                    {
                        "status": "unchanged",
                        "previous": row.get("rank"),
                        "current": row.get("rank"),
                    },
                ) if has_previous else {
                    "status": "unchanged",
                    "previous": row.get("rank"),
                    "current": row.get("rank"),
                }
        return rankings
    except (ValueError, KeyError, RankingSnapshotError):
        return _attach_session_fallback(rankings)


def _attach_session_fallback(rankings: dict[str, list[dict]]) -> dict[str, list[dict]]:
    previous = st.session_state.get("mlb_pitcher_previous_rankings", {})
    for category, rows in rankings.items():
        old_positions = {
            int(r.get("pitcher_id") or 0): int(r.get("rank") or i + 1)
            for i, r in enumerate(previous.get(category, []))
            if r.get("pitcher_id")
        }
        for i, row in enumerate(rows):
            pid = int(row.get("pitcher_id") or 0)
            current = int(row.get("rank") or i + 1)
            old = old_positions.get(pid)
            if old is None and previous:
                movement = {"status":"new","previous":None,"current":current}
            elif old and current < old:
                movement = {"status":"up","previous":old,"current":current}
            elif old and current > old:
                movement = {"status":"down","previous":old,"current":current}
            else:
                movement = {"status":"unchanged","previous":old or current,"current":current}
            row["movement"] = movement

    st.session_state["mlb_pitcher_previous_rankings"] = {
        cat: [dict(row) for row in rows]
        for cat, rows in rankings.items()
    }
    return rankings


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
        url = (
            "https://img.mlbstatic.com/mlb-photos/image/upload/"
            f"w_180,q_100/v1/people/{pitcher_id}/headshot/67/current"
        )
        return (
            f'<img class="pitcher-headshot" src="{escape(url)}" '
            f'alt="{escape(name)} headshot" loading="lazy" '
            f'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\';">'
            f'<span class="pitcher-photo-fallback" style="display:none">{escape(initials)}</span>'
        )

    return f'<span class="pitcher-photo-fallback">{escape(initials)}</span>'


def _matchup(row: dict) -> str:
    team = str(row.get("team_name") or "TBD")
    opponent = str(row.get("opponent_name") or "TBD")
    if row.get("is_home") is True:
        return f"{opponent} vs. {team}"
    return f"{team} vs. {opponent}"


def _projection_text(category: str, row: dict) -> str:
    return f"{float(row.get('projection') or 0):.1f} {CATEGORY_CONFIG[category][1]}"


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
        if row.get("lineup_context_confirmed"):
            st.write("• Confirmed opponent lineup is included in the matchup weighting.")
        elif row.get("lineup_context_projected"):
            st.write("• Projected opponent lineup is included in the matchup weighting until the official order posts.")
        if row.get("venue"):
            st.write(f"• Venue: {row.get('venue')}.")


def _render_pitcher_card(category: str, row: dict) -> None:
    rank = int(row.get("rank") or 0)
    name = str(row.get("pitcher_name") or "Pitcher")
    score = float(row.get("gi_score") or 0)
    hand = str(row.get("pitcher_hand") or "")
    reason = str(row.get("why") or "")
    confirmed = bool(row.get("lineup_context_confirmed"))
    projected = bool(row.get("lineup_context_projected"))
    if confirmed:
        lineup = "✓ Confirmed opponent lineup"
        lineup_class = "pitch-lineup-confirmed"
    elif projected:
        lineup = "○ Projected opponent lineup"
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
                    <span>{escape(_matchup(row))}{escape(f' · {hand}HP' if hand else '')}</span>
                    <span class="pitcher-projection"><b>Projection:</b> {escape(_projection_text(category,row))}</span>
                    <span class="pitcher-reason">{escape(reason)}</span>
                    <em class="{lineup_class}">{escape(lineup)}</em>
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

    if st.button(
        "Show Top 5 Only" if st.session_state[state_key] else "View Full Top 25",
        key=f"toggle_pitcher_{category}_25",
        use_container_width=True,
    ):
        st.session_state[state_key] = not st.session_state[state_key]

    if st.session_state[state_key]:
        for row in rows[5:]:
            _render_pitcher_card(category, row)


def render_pitcher_rankings() -> None:
    st.markdown(
        """
        <style>
        /* Pitcher cards use the same compact visual language as batter cards. */
        div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlockBorderWrapper"]{
            background:#101112!important;
            border:2px solid #3a3d42!important;
            border-left:5px solid #d6b35c!important;
            border-radius:16px!important;
            overflow:hidden!important;
        }
        div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlock"]{gap:.22rem!important}
        .pitcher-card-main{
            display:grid!important;
            grid-template-columns:38px 52px minmax(0,1fr) 52px!important;
            gap:7px!important;
            align-items:center!important;
            min-width:0!important;
            padding:4px 1px 5px!important;
        }
        .pitcher-rank{text-align:center!important;min-width:0!important}
        .pitcher-rank strong{display:block!important;color:#19d978!important;font-size:.96rem!important;font-weight:900!important}
        .pitcher-rank small{display:block!important;color:#f6c84c!important;font-size:.56rem!important;font-weight:900!important;white-space:nowrap!important;margin-top:1px!important}
        .pitcher-photo{
            width:50px!important;height:50px!important;min-width:50px!important;min-height:50px!important;
            max-width:50px!important;max-height:50px!important;border-radius:50%!important;
            border:2.5px solid #d6b35c!important;background:#050505!important;
            overflow:hidden!important;display:grid!important;place-items:center!important;
        }
        .pitcher-headshot{
            display:block!important;width:100%!important;height:100%!important;
            object-fit:cover!important;object-position:center 18%!important;background:#050505!important;
            border-radius:50%!important;
        }
        .pitcher-photo-fallback{
            width:100%!important;height:100%!important;place-items:center!important;border-radius:50%!important;
            color:#fff!important;font-size:.82rem!important;font-weight:900!important;background:#050505!important;
        }
        .pitcher-copy{min-width:0!important;display:grid!important;gap:1px!important;overflow:hidden!important}
        .pitcher-copy>strong{color:#fff!important;font-size:.90rem!important;font-weight:900!important;line-height:1.08!important;overflow-wrap:anywhere!important}
        .pitcher-copy>span{color:#d0d2d5!important;font-size:.66rem!important;line-height:1.15!important;overflow-wrap:anywhere!important}
        .pitcher-projection b{color:#f6c84c!important}
        .pitcher-reason{display:-webkit-box!important;-webkit-line-clamp:3!important;-webkit-box-orient:vertical!important;overflow:hidden!important;margin-top:1px!important}
        .pitcher-copy em{
            justify-self:start!important;display:inline-block!important;margin:4px 0 6px!important;
            padding:3px 7px!important;border-radius:999px!important;font-size:.57rem!important;
            font-style:normal!important;font-weight:850!important;max-width:100%!important;
        }
        .pitch-lineup-confirmed{color:#c8f7d9!important;border:1px solid rgba(47,191,113,.55)!important;background:rgba(47,191,113,.10)!important}
        .pitch-lineup-projected{color:#fde68a!important;border:1px solid rgba(214,179,92,.55)!important;background:rgba(214,179,92,.10)!important}
        .pitch-lineup-unavailable{color:#a7abb2!important;border:1px solid #3a3d42!important;background:#101112!important}
        .pitcher-score{text-align:right!important;min-width:0!important}
        .pitcher-score small{color:#a7abb2!important;font-size:.54rem!important;font-weight:850!important}
        .pitcher-score strong{display:block!important;color:#f6c84c!important;font-size:.96rem!important;margin-top:2px!important}

        .pitch-intel-summary,.pitch-evidence-grid{
            display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;
            gap:6px!important;margin:2px 0 8px!important;
        }
        .pitch-intel-summary>div,.pitch-evidence-grid>div{
            min-width:0!important;background:#101112!important;border:2px solid #3a3d42!important;
            border-radius:10px!important;padding:6px!important;
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
        .pitch-intel-summary span,.pitch-evidence-grid span{display:block!important;color:#a7abb2!important;font-size:.57rem!important;line-height:1.08!important}
        .pitch-intel-summary b,.pitch-evidence-grid b{display:block!important;color:#fff!important;font-size:.81rem!important;line-height:1.05!important;margin-top:2px!important}

        div[class*="st-key-pitcher_intelligence_"] button{
            background:#080909!important;color:#fff!important;border:2px solid #d6b35c!important;
            border-radius:10px!important;min-height:35px!important;margin-top:4px!important;
        }
        div[data-testid="stExpander"]{margin:.18rem 0!important}
        div[data-testid="stExpander"] summary{min-height:33px!important;padding:.18rem .42rem!important}
        div[data-testid="stExpander"] [data-testid="stExpanderDetails"]{padding:.08rem .42rem .62rem!important}

        /* No red tab underline anywhere in pitcher categories. */
        [data-testid="stTabs"] [data-baseweb="tab-highlight"],[data-baseweb="tab-highlight"]{
            background:#d6b35c!important;background-color:#d6b35c!important;
        }
        [data-testid="stTabs"] button[role="tab"][aria-selected="true"],button[data-baseweb="tab"][aria-selected="true"]{
            box-shadow:inset 0 -3px 0 #d6b35c!important;border-bottom-color:#d6b35c!important;color:#fff!important;
        }
        @media(max-width:700px){
            h3{margin-top:.10rem!important;margin-bottom:.08rem!important}
            [data-testid="stTabs"] [role="tablist"]{margin-bottom:0!important}
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    result = get_pitcher_rankings(limit=25)
    if not result.get("success"):
        st.caption("Pitcher rankings are waiting for today's probable-pitcher data.")
        return

    rankings = _attach_persistent_movement(result.get("rankings") or {})
    tabs = st.tabs([CATEGORY_CONFIG[k][0] for k in CATEGORY_CONFIG])
    for tab, category in zip(tabs, CATEGORY_CONFIG):
        with tab:
            _render_category(category, rankings.get(category, []))
