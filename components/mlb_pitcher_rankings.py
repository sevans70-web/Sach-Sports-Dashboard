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
    clean = " ".join(line.strip() for line in html.splitlines() if line.strip())
    st.markdown(clean, unsafe_allow_html=True)


def _matchup(row: dict) -> str:
    team = str(row.get("team_name") or "TBD")
    opponent = str(row.get("opponent_name") or "TBD")
    return f"{opponent} vs. {team}" if row.get("is_home") is True else f"{team} vs. {opponent}"


def _projection_text(category: str, row: dict) -> str:
    return f"{float(row.get('projection') or 0):.1f} {CATEGORY_CONFIG[category][1]}"


def _movement_label(row: dict) -> str:
    movement = row.get("movement", {}) or {}
    status = str(movement.get("status") or "").lower()
    old = movement.get("previous")
    new = movement.get("current")
    if status == "new":
        return "NEW"
    if status == "up" and old and new:
        return f"↑ {old}→{new}"
    if status == "down" and old and new:
        return f"↓ {old}→{new}"
    return "—"


def _persistent_pitcher_movement(rankings_by_category: dict[str,list[dict]]) -> dict[str,list[dict]]:
    normalized = {
        category: [
            {
                **row,
                "player_id": row.get("pitcher_id"),
                "player": row.get("pitcher_name"),
                "team": row.get("team_name"),
                "opponent": row.get("opponent_name"),
                "score": row.get("gi_score"),
            }
            for row in rows
        ]
        for category, rows in rankings_by_category.items()
    }

    token = os.getenv("SACH_GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN")
    try:
        config = GitHubSnapshotConfig(
            repository="sevans70-web/Sach-Sports-Dashboard",
            token=token,
            branch="main",
            path="data/intraday_pitcher_rankings.json",
        )
        result = load_compare_and_save(
            config=config,
            category_rankings=normalized,
            captured_at=datetime.now(TORONTO_TIMEZONE),
        )
        if result.get("previous_snapshot") is not None:
            comparisons = result.get("comparisons", {})
            for category, rows in rankings_by_category.items():
                lookup = {
                    str(item.get("player_key")): item.get("movement", {})
                    for item in comparisons.get(category, {}).get("current", [])
                }
                for row in rows:
                    key = str(row.get("pitcher_id") or str(row.get("pitcher_name") or "").casefold())
                    row["movement"] = lookup.get(
                        key,
                        {"status":"unchanged","previous":row.get("rank"),"current":row.get("rank")}
                    )
            return rankings_by_category
    except (ValueError, KeyError, RankingSnapshotError):
        pass

    previous = st.session_state.get("mlb_pitcher_previous_rankings", {})
    for category, rows in rankings_by_category.items():
        old_positions = {
            int(r.get("pitcher_id") or 0): int(r.get("rank") or i+1)
            for i, r in enumerate(previous.get(category, []))
            if r.get("pitcher_id")
        }
        for i, row in enumerate(rows):
            pid = int(row.get("pitcher_id") or 0)
            new_rank = int(row.get("rank") or i+1)
            old_rank = old_positions.get(pid)

            if old_rank is None and previous:
                movement = {"status":"new","previous":None,"current":new_rank}
            elif old_rank and new_rank < old_rank:
                movement = {"status":"up","previous":old_rank,"current":new_rank}
            elif old_rank and new_rank > old_rank:
                movement = {"status":"down","previous":old_rank,"current":new_rank}
            else:
                movement = {"status":"unchanged","previous":old_rank or new_rank,"current":new_rank}
            row["movement"] = movement

    st.session_state["mlb_pitcher_previous_rankings"] = {
        category: [dict(row) for row in rows]
        for category, rows in rankings_by_category.items()
    }
    return rankings_by_category


def _photo_html(row: dict) -> str:
    url = str(row.get("headshot_url") or "").strip()
    name = str(row.get("pitcher_name") or "Pitcher")
    if url:
        return f'<img src="{escape(url)}" alt="{escape(name)} headshot" loading="lazy">'
    initials = "".join(part[0] for part in name.split()[:2]).upper() or "P"
    return f'<span class="pitcher-photo-fallback">{escape(initials)}</span>'


def _render_pitcher_intelligence(category: str, row: dict) -> None:
    season = row.get("season_stats", {}) or {}

    stats = [
        ("GI Score", f"{float(row.get('gi_score') or 0):.1f}"),
        ("Projection", _projection_text(category,row)),
        ("Benchmark", f"{float(row.get('benchmark_probability') or 0):.0f}%"),
    ]
    _render_html(
        "<div class='pitch-intel-summary'>"
        + "".join(f"<div><span>{escape(label)}</span><b>{escape(value)}</b></div>" for label,value in stats)
        + "</div>"
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
        st.write(f"• {row.get('why') or 'Pitcher profile is being evaluated.'}")
        if row.get("lineup_context_confirmed"):
            st.write("• Confirmed opponent lineup is included in the matchup weighting.")
        else:
            st.write("• Opponent lineup is not fully confirmed, so season rates carry more weight.")
        if row.get("venue"):
            st.write(f"• Venue: {row.get('venue')}.")


def _render_pitcher_card(category: str, row: dict) -> None:
    rank = int(row.get("rank") or 0)
    score = float(row.get("gi_score") or 0)
    state_key = f"pitcher_intelligence_{category}_{row.get('pitcher_id')}_{rank}"
    if state_key not in st.session_state:
        st.session_state[state_key] = False

    confirmed = bool(row.get("lineup_context_confirmed"))
    lineup_text = "✓ Confirmed opponent lineup" if confirmed else "○ Opponent lineup not fully confirmed"
    lineup_class = "pitch-lineup-confirmed" if confirmed else "pitch-lineup-projected"
    hand = str(row.get("pitcher_hand") or "")

    with st.container(border=True, key=f"pitcher_card_{category}_{row.get('pitcher_id')}_{rank}"):
        _render_html(
            f"""
            <div class="pitcher-card-main">
                <div class="pitcher-rank"><strong>#{rank}</strong><small>{escape(_movement_label(row))}</small></div>
                <div class="pitcher-photo">{_photo_html(row)}</div>
                <div class="pitcher-copy">
                    <strong>{escape(str(row.get('pitcher_name') or 'Pitcher'))}</strong>
                    <span>{escape(_matchup(row))}{escape(f' · {hand}HP' if hand else '')}</span>
                    <span class="pitcher-projection"><b>Projection:</b> {escape(_projection_text(category,row))}</span>
                    <span class="pitcher-reason">{escape(str(row.get('why') or ''))}</span>
                    <em class="{lineup_class}">{escape(lineup_text)}</em>
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
            st.rerun()

        if st.session_state[state_key]:
            _render_pitcher_intelligence(category,row)


def _render_category(category: str, rows: list[dict]) -> None:
    st.markdown(f"### {CATEGORY_CONFIG[category][0]}")
    st.caption("Ranked by pitcher GI score using workload, season rates, sample reliability, matchup and opponent handedness.")

    if not rows:
        st.caption("No probable pitchers with usable season data are available yet.")
        return

    for row in rows[:5]:
        _render_pitcher_card(category,row)

    state_key = f"show_pitcher_{category}_25"
    if state_key not in st.session_state:
        st.session_state[state_key] = False

    if st.button(
        "Show Top 5 Only" if st.session_state[state_key] else "View Full Top 25",
        key=f"toggle_pitcher_{category}_25",
        use_container_width=True,
    ):
        st.session_state[state_key] = not st.session_state[state_key]
        st.rerun()

    if st.session_state[state_key]:
        for row in rows[5:]:
            _render_pitcher_card(category,row)


def render_pitcher_rankings() -> None:
    st.markdown(
        """
        <style>
        div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlockBorderWrapper"]{
            background:#101112!important;border:2px solid #3a3d42!important;
            border-left:5px solid #d6b35c!important;border-radius:16px!important
        }
        div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlock"]{gap:.20rem!important}
        .pitcher-card-main{display:grid;grid-template-columns:38px 50px minmax(0,1fr) 52px;gap:7px;align-items:center;padding:4px 1px 5px}
        .pitcher-rank{text-align:center}.pitcher-rank strong{display:block;color:#f6c84c;font-size:.96rem;font-weight:900}
        .pitcher-rank small{display:block;color:#f6c84c;font-size:.56rem;font-weight:900;white-space:nowrap;margin-top:1px}
        .pitcher-photo{width:48px;height:48px;border-radius:12px;border:2px solid rgba(214,179,92,.62);background:#080909;display:grid;place-items:center;overflow:hidden}
        .pitcher-photo img{width:90%;height:90%;object-fit:contain;object-position:center bottom;transform:none}
        .pitcher-photo-fallback{color:#fff;font-weight:900}
        .pitcher-copy{min-width:0;display:grid;gap:1px}.pitcher-copy>strong{color:#fff;font-size:.90rem;font-weight:900;line-height:1.08}
        .pitcher-copy>span{color:#d0d2d5;font-size:.65rem;line-height:1.16}
        .pitcher-projection b{color:#f6c84c}
        .pitcher-reason{display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:1px}
        .pitcher-copy em{justify-self:start;display:inline-block;margin:3px 0 4px;padding:3px 7px;border-radius:999px;font-size:.57rem;font-style:normal;font-weight:850}
        .pitch-lineup-confirmed{color:#c8f7d9;border:1px solid rgba(47,191,113,.55);background:rgba(47,191,113,.10)}
        .pitch-lineup-projected{color:#fde68a;border:1px solid rgba(214,179,92,.55);background:rgba(214,179,92,.10)}
        .pitcher-score{text-align:right}.pitcher-score small{color:#a7abb2;font-size:.54rem;font-weight:850}
        .pitcher-score strong{display:block;color:#f6c84c;font-size:.96rem;margin-top:2px}

        .pitch-intel-summary,.pitch-evidence-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:1px 0 3px}
        .pitch-intel-summary>div,.pitch-evidence-grid>div{min-width:0;background:#101112;border:2px solid #3a3d42;border-radius:10px;padding:6px}
        .pitch-intel-summary span,.pitch-evidence-grid span{display:block;color:#a7abb2;font-size:.57rem;line-height:1.08}
        .pitch-intel-summary b,.pitch-evidence-grid b{display:block;color:#fff;font-size:.81rem;line-height:1.05;margin-top:2px}

        div[class*="st-key-pitcher_intelligence_"] button{
            background:#080909!important;color:#fff!important;border:2px solid #d6b35c!important;
            border-radius:10px!important;min-height:35px!important;margin-top:3px!important
        }

        div[data-testid="stExpander"]{margin:.18rem 0!important}
        div[data-testid="stExpander"] summary{min-height:33px!important;padding:.18rem .42rem!important}
        div[data-testid="stExpander"] [data-testid="stExpanderDetails"]{padding:.05rem .42rem .28rem!important}

        [data-testid="stTabs"] [data-baseweb="tab-highlight"],[data-baseweb="tab-highlight"]{background:#d6b35c!important}
        [data-testid="stTabs"] button[role="tab"][aria-selected="true"]{
            box-shadow:inset 0 -3px 0 #d6b35c!important;border-bottom-color:#d6b35c!important
        }

        @media(max-width:700px){
            h3{margin-top:.10rem!important;margin-bottom:.08rem!important}
            [data-testid="stTabs"] [role="tablist"]{margin-bottom:0!important}
        }
        </style>
        """, unsafe_allow_html=True
    )

    result = get_pitcher_rankings(limit=25)
    rankings = result.get("rankings",{}) or {}
    rankings = _persistent_pitcher_movement(rankings)

    tabs = st.tabs([CATEGORY_CONFIG[k][0] for k in CATEGORY_CONFIG])
    for tab, category in zip(tabs,CATEGORY_CONFIG):
        with tab:
            _render_category(category, rankings.get(category,[]))
