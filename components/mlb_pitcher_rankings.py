from __future__ import annotations

from html import escape
import streamlit as st

from engines.mlb_pitcher_intelligence import get_pitcher_rankings


CATEGORY_CONFIG = {
    "strikeouts": ("🎯 Strikeouts", "K"),
    "outs_recorded": ("⏱️ Outs", "outs"),
    "hits_allowed": ("⚾ Hits Allowed", "hits"),
    "walks_allowed": ("◉ Walks Allowed", "BB"),
    "earned_runs": ("🔴 Earned Runs", "ER"),
}


def _matchup(row: dict) -> str:
    team = str(row.get("team_name") or "TBD")
    opponent = str(row.get("opponent_name") or "TBD")

    if row.get("is_home") is True:
        return f"{opponent} vs. {team}"

    return f"{team} vs. {opponent}"


def _projection_text(
    category: str,
    row: dict,
) -> str:
    projection = float(row.get("projection") or 0)

    if category == "outs_recorded":
        return f"{projection:.1f} outs"

    return (
        f"{projection:.1f} "
        f"{CATEGORY_CONFIG[category][1]}"
    )


def _attach_session_movement(
    category: str,
    rows: list[dict],
) -> list[dict]:
    snapshot_key = f"pitcher_rank_snapshot_{category}"
    labels_key = f"pitcher_rank_movement_{category}"

    current = {
        int(row.get("pitcher_id") or 0):
        int(row.get("rank") or 0)
        for row in rows
        if row.get("pitcher_id")
    }

    previous = st.session_state.get(snapshot_key)
    labels = st.session_state.get(labels_key, {})

    if previous is None:
        st.session_state[snapshot_key] = current
        st.session_state[labels_key] = {}
        labels = {}

    elif current != previous:
        labels = {}

        for pitcher_id, current_rank in current.items():
            old_rank = previous.get(pitcher_id)

            if old_rank is None:
                labels[pitcher_id] = "NEW"
            elif current_rank < old_rank:
                labels[pitcher_id] = (
                    f"↑ {old_rank}→{current_rank}"
                )
            elif current_rank > old_rank:
                labels[pitcher_id] = (
                    f"↓ {old_rank}→{current_rank}"
                )

        st.session_state[snapshot_key] = current
        st.session_state[labels_key] = labels

    for row in rows:
        pitcher_id = int(row.get("pitcher_id") or 0)
        row["movement_label"] = labels.get(
            pitcher_id,
            "—",
        )

    return rows


def _render_pitcher_intelligence(
    category: str,
    row: dict,
) -> None:
    season = row.get("season_stats", {}) or {}

    stats = [
        (
            "GI Score",
            f"{float(row.get('gi_score') or 0):.1f}",
        ),
        (
            "Projection",
            _projection_text(category, row),
        ),
        (
            "Benchmark",
            f"{float(row.get('benchmark_probability') or 0):.0f}%",
        ),
    ]

    st.markdown(
        "<div class='pitch-intel-summary'>"
        + "".join(
            "<div>"
            f"<span>{escape(label)}</span>"
            f"<b>{escape(value)}</b>"
            "</div>"
            for label, value in stats
        )
        + "</div>",
        unsafe_allow_html=True,
    )

    with st.expander(
        "Performance Evidence",
        expanded=False,
    ):
        st.markdown(
            "<div class='pitch-evidence-grid'>"
            f"<div><span>K/9</span>"
            f"<b>{float(row.get('k9') or 0):.1f}</b></div>"
            f"<div><span>H/9</span>"
            f"<b>{float(row.get('h9') or 0):.1f}</b></div>"
            f"<div><span>BB/9</span>"
            f"<b>{float(row.get('bb9') or 0):.1f}</b></div>"
            f"<div><span>Matchup ERA</span>"
            f"<b>{float(row.get('era_matchup') or 0):.2f}</b></div>"
            f"<div><span>Reliability</span>"
            f"<b>{float(row.get('reliability') or 0) * 100:.0f}%</b></div>"
            f"<div><span>Starts</span>"
            f"<b>{int(season.get('games_started') or 0)}</b></div>"
            "</div>",
            unsafe_allow_html=True,
        )

    with st.expander(
        "Why This Pitcher Ranks Here",
        expanded=False,
    ):
        st.write(
            f"• {row.get('why') or 'Pitcher profile is being evaluated.'}"
        )

        st.write(
            "• Opponent lineup context: "
            + (
                "confirmed and included in the matchup weighting."
                if row.get("lineup_context_confirmed")
                else
                "not fully confirmed, so season rates carry more weight."
            )
        )

        if row.get("venue"):
            st.write(f"• Venue: {row.get('venue')}.")


def _render_pitcher_card(
    category: str,
    row: dict,
) -> None:
    rank = int(row.get("rank") or 0)
    score = float(row.get("gi_score") or 0)

    name = escape(
        str(row.get("pitcher_name") or "Pitcher")
    )
    matchup = escape(_matchup(row))
    reason = escape(str(row.get("why") or ""))
    headshot = escape(
        str(row.get("headshot_url") or "")
    )
    hand = escape(
        str(row.get("pitcher_hand") or "")
    )
    movement = escape(
        str(row.get("movement_label") or "—")
    )

    lineup = (
        "✓ Confirmed opponent lineup"
        if row.get("lineup_context_confirmed")
        else
        "○ Opponent lineup not fully confirmed"
    )

    photo = (
        f'<img src="{headshot}" '
        f'alt="{name} headshot">'
        if headshot
        else
        "<div class='pitcher-photo-fallback'>P</div>"
    )

    state_key = (
        f"pitcher_intelligence_"
        f"{category}_"
        f"{row.get('pitcher_id')}_"
        f"{rank}"
    )

    if state_key not in st.session_state:
        st.session_state[state_key] = False

    with st.container(
        border=True,
        key=(
            f"pitcher_card_"
            f"{category}_"
            f"{row.get('pitcher_id')}_"
            f"{rank}"
        ),
    ):
        st.markdown(
            f"""
            <div class="pitcher-card-main">
                <div class="pitcher-rank">
                    <strong>#{rank}</strong>
                    <small>{movement}</small>
                </div>

                <div class="pitcher-photo">
                    {photo}
                </div>

                <div class="pitcher-copy">
                    <strong>{name}</strong>
                    <span>
                        {matchup} · {hand}HP
                    </span>
                    <span class="pitcher-reason">
                        {reason}
                    </span>
                    <em>{escape(lineup)}</em>
                </div>

                <div class="pitcher-score">
                    <small>GI<br>SCORE</small>
                    <strong>{score:.1f}</strong>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        if st.button(
            "ⓘ Hide Intelligence"
            if st.session_state[state_key]
            else
            "ⓘ View Intelligence",
            key=f"{state_key}_button",
            use_container_width=True,
        ):
            st.session_state[state_key] = (
                not st.session_state[state_key]
            )

        if st.session_state[state_key]:
            _render_pitcher_intelligence(
                category,
                row,
            )


def _render_category(
    category: str,
    rows: list[dict],
) -> None:
    rows = _attach_session_movement(
        category,
        rows,
    )

    st.markdown(
        f"### {CATEGORY_CONFIG[category][0]}"
    )

    st.caption(
        "Ranked by pitcher GI score using workload, "
        "season rates, sample reliability, "
        "and opponent handedness."
    )

    if not rows:
        st.caption(
            "No probable pitchers with usable "
            "season data are available yet."
        )
        return

    for row in rows[:5]:
        _render_pitcher_card(
            category,
            row,
        )

    state_key = (
        f"show_pitcher_{category}_25"
    )

    if state_key not in st.session_state:
        st.session_state[state_key] = False

    if st.button(
        "Show Top 5 Only"
        if st.session_state[state_key]
        else
        "View Full Top 25",
        key=f"toggle_pitcher_{category}_25",
        use_container_width=True,
    ):
        st.session_state[state_key] = (
            not st.session_state[state_key]
        )

    if st.session_state[state_key]:
        for row in rows[5:]:
            _render_pitcher_card(
                category,
                row,
            )


def render_pitcher_rankings() -> None:
    st.markdown(
        """
        <style>
        div[class*="st-key-pitcher_card_"]
        [data-testid="stVerticalBlockBorderWrapper"] {
            background:
                linear-gradient(
                    100deg,
                    rgba(25,217,120,.13) 0%,
                    #101112 18%,
                    #101112 82%,
                    rgba(25,217,120,.035) 100%
                )!important;
            border:2px solid #3a3d42!important;
            border-left:6px solid #19d978!important;
            border-radius:16px!important;
            box-shadow:
                inset 1px 0 0
                rgba(25,217,120,.70)!important;
        }

        div[class*="st-key-pitcher_card_"]
        [data-testid="stVerticalBlock"] {
            gap:.42rem!important;
        }

        .pitcher-card-main {
            display:grid;
            grid-template-columns:
                42px 58px minmax(0,1fr) 60px;
            gap:8px;
            align-items:center;
            padding:4px 2px;
        }

        .pitcher-rank {
            text-align:center;
        }

        .pitcher-rank strong {
            display:block;
            color:#19d978;
            font-size:1rem;
            font-weight:900;
        }

        .pitcher-rank small {
            display:block;
            color:#a7abb2;
            font-size:.65rem;
            margin-top:2px;
        }

        .pitcher-photo {
            width:54px;
            height:54px;
            border-radius:12px;
            border:2px solid rgba(255,204,51,.58);
            background:#050505;
            overflow:hidden;
        }

        .pitcher-photo img {
            width:100%;
            height:100%;
            object-fit:cover;
            object-position:center 12%;
            transform:scale(1.02);
        }

        .pitcher-photo-fallback {
            width:100%;
            height:100%;
            display:grid;
            place-items:center;
            color:#fff;
            font-weight:900;
        }

        .pitcher-copy > strong {
            display:block;
            color:#fff;
            font-size:1rem;
            font-weight:850;
            line-height:1.14;
        }

        .pitcher-copy > span {
            display:block;
            color:#d0d2d5;
            font-size:.75rem;
            line-height:1.25;
            margin-top:2px;
        }

        .pitcher-reason {
            display:-webkit-box!important;
            -webkit-line-clamp:2;
            -webkit-box-orient:vertical;
            overflow:hidden;
        }

        .pitcher-copy em {
            display:inline-block;
            margin-top:5px;
            padding:3px 7px;
            border-radius:999px;
            border:2px solid rgba(25,217,120,.45);
            background:rgba(25,217,120,.09);
            color:#d7ffe9;
            font-size:.65rem;
            font-style:normal;
            font-weight:800;
        }

        .pitcher-score {
            text-align:right;
        }

        .pitcher-score small {
            color:#a7abb2;
            font-size:.62rem;
            font-weight:800;
            line-height:1.0;
        }

        .pitcher-score strong {
            display:block;
            color:#ffcc33;
            font-size:1.02rem;
            margin-top:4px;
        }

        .pitch-intel-summary {
            display:grid;
            grid-template-columns:
                repeat(3,minmax(0,1fr));
            gap:6px;
            margin:4px 0 8px;
        }

        .pitch-intel-summary > div,
        .pitch-evidence-grid > div {
            background:#101112;
            border:2px solid #3a3d42;
            border-radius:10px;
            padding:7px;
            min-width:0;
        }

        .pitch-intel-summary span,
        .pitch-evidence-grid span {
            display:block;
            color:#a7abb2;
            font-size:.62rem;
        }

        .pitch-intel-summary b,
        .pitch-evidence-grid b {
            display:block;
            color:#fff;
            font-size:.88rem;
            margin-top:2px;
        }

        .pitch-evidence-grid {
            display:grid;
            grid-template-columns:
                repeat(3,minmax(0,1fr));
            gap:6px;
        }

        div[class*="st-key-pitcher_intelligence_"]
        button {
            background:#080909!important;
            color:#fff!important;
            border:2px solid
                rgba(25,217,120,.65)!important;
            border-radius:10px!important;
        }

        [data-testid="stTabs"]
        [data-baseweb="tab-highlight"],
        [data-baseweb="tab-highlight"] {
            background:#19d978!important;
        }

        [data-testid="stTabs"]
        button[role="tab"][aria-selected="true"] {
            box-shadow:
                inset 0 -3px 0
                #19d978!important;
        }

        @media(max-width:700px) {
            .pitcher-card-main {
                grid-template-columns:
                    38px 54px minmax(0,1fr) 56px;
                gap:7px;
            }

            .pitcher-photo {
                width:52px;
                height:52px;
            }

            .pitcher-copy > strong {
                font-size:.96rem;
            }

            .pitcher-copy > span {
                font-size:.71rem;
            }

            .pitch-intel-summary,
            .pitch-evidence-grid {
                grid-template-columns:
                    repeat(3,minmax(0,1fr));
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    result = get_pitcher_rankings(
        limit=25
    )

    if not result.get("success"):
        st.caption(
            "Pitcher rankings are waiting for "
            "today's probable-pitcher data."
        )
        return

    st.caption(
        f"{int(result.get('pitcher_count') or 0)} "
        "probable pitchers loaded for today's slate."
    )

    rankings = result.get("rankings") or {}

    tabs = st.tabs(
        [
            "🎯 Strikeouts",
            "⏱️ Outs",
            "⚾ Hits Allowed",
            "◉ Walks Allowed",
            "🔴 Earned Runs",
        ]
    )

    for tab, category in zip(
        tabs,
        CATEGORY_CONFIG,
    ):
        with tab:
            _render_category(
                category,
                rankings.get(category, []),
            )
