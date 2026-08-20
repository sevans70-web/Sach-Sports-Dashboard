from __future__ import annotations

from html import escape
import streamlit as st

from engines.mlb_pitcher_intelligence import get_pitcher_rankings


CATEGORY_CONFIG = {
    "strikeouts": ("🎯 Strikeouts", "K"),
    "outs_recorded": ("⏱️ Outs Recorded", "outs"),
    "hits_allowed": ("⚾ Hits Allowed", "hits"),
    "walks_allowed": ("👁️ Walks Allowed", "BB"),
    "earned_runs": ("🔴 Earned Runs", "ER"),
}


def _matchup(row: dict) -> str:
    team = str(row.get("team_name") or "TBD")
    opponent = str(row.get("opponent_name") or "TBD")
    if row.get("is_home") is True:
        return f"{opponent} vs. {team}"
    if row.get("is_home") is False:
        return f"{team} vs. {opponent}"
    return f"{team} vs. {opponent}"


def _projection_text(category: str, row: dict) -> str:
    projection = float(row.get("projection") or 0.0)
    if category == "outs_recorded":
        return f"{projection:.1f} outs · ~{projection / 3.0:.1f} IP"
    return f"{projection:.1f} {CATEGORY_CONFIG[category][1]}"


def _render_pitcher_card(category: str, row: dict) -> None:
    name = escape(str(row.get("pitcher_name") or "Pitcher"))
    matchup = escape(_matchup(row))
    reason = escape(str(row.get("why") or ""))
    rank = int(row.get("rank") or 0)
    score = float(row.get("gi_score") or 0.0)
    probability = float(row.get("benchmark_probability") or 0.0)
    projection = escape(_projection_text(category, row))
    headshot = escape(str(row.get("headshot_url") or ""))
    pitcher_hand = escape(str(row.get("pitcher_hand") or ""))

    lineup_badge = (
        "✓ Confirmed opponent lineup"
        if row.get("lineup_context_confirmed")
        else "○ Opponent lineup not fully confirmed"
    )

    photo_html = (
        f'<img src="{headshot}" alt="{name} headshot" '
        'style="width:48px;height:48px;object-fit:contain;'
        'border-radius:12px;border:1px solid rgba(56,189,248,.45);">'
        if headshot
        else ""
    )

    st.markdown(
        f'''
        <div style="
            border:1px solid rgba(56,189,248,.26);
            border-radius:16px;
            padding:12px 14px;
            margin-bottom:10px;
            background:rgba(15,23,42,.68);
        ">
          <div style="
              display:grid;
              grid-template-columns:40px 52px minmax(0,1fr) 70px;
              gap:10px;
              align-items:center;
          ">
            <div style="color:#bae6fd;font-weight:850;text-align:center;">#{rank}</div>
            <div>{photo_html}</div>
            <div>
              <div style="font-weight:850;color:white;">{name}</div>
              <div style="font-size:.79rem;opacity:.72;">{matchup} · {pitcher_hand}HP</div>
              <div style="font-size:.84rem;color:#cbd5e1;margin-top:4px;">{reason}</div>
              <div style="
                  display:inline-block;margin-top:6px;padding:3px 7px;
                  border-radius:999px;font-size:.70rem;font-weight:800;
                  color:#bbf7d0;background:rgba(34,197,94,.12);
                  border:1px solid rgba(34,197,94,.24);
              ">{escape(lineup_badge)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:.68rem;color:#7dd3fc;font-weight:800;">GI SCORE</div>
              <div style="font-size:1.05rem;color:white;font-weight:900;">{score:.1f}</div>
              <div style="font-size:.72rem;color:#cbd5e1;margin-top:4px;">{projection}</div>
              <div style="font-size:.66rem;opacity:.66;">benchmark {probability:.0f}%</div>
            </div>
          </div>
        </div>
        ''',
        unsafe_allow_html=True,
    )


def _render_category(category: str, rows: list[dict]) -> None:
    st.markdown(f"### {CATEGORY_CONFIG[category][0]}")
    st.caption(
        "Ranked by pitcher GI score using workload, season rates, sample reliability, "
        "and confirmed opponent handedness when available. Benchmark percentage is "
        "model context, not a sportsbook line."
    )

    if not rows:
        st.info("No probable pitchers with usable season data are available yet.")
        return

    for row in rows[:5]:
        _render_pitcher_card(category, row)

    state_key = f"show_pitcher_{category}_25"
    if state_key not in st.session_state:
        st.session_state[state_key] = False

    button_text = "Hide Full Top 25" if st.session_state[state_key] else "View Full Top 25"

    if st.button(
        button_text,
        key=f"toggle_pitcher_{category}_25",
        use_container_width=True,
    ):
        st.session_state[state_key] = not st.session_state[state_key]

    if st.session_state[state_key]:
        st.markdown("**Full Ranking**")
        for row in rows:
            _render_pitcher_card(category, row)


def render_pitcher_rankings() -> None:
    result = get_pitcher_rankings(limit=25)

    if not result.get("success"):
        st.warning("Pitcher rankings are waiting for today's probable-pitcher data.")
        errors = result.get("errors") or []
        if errors:
            with st.expander("Pitcher data details", expanded=False):
                for error in errors:
                    st.write(error)
        return

    st.caption(
        f"{int(result.get('pitcher_count') or 0)} probable pitchers loaded for today's slate."
    )

    rankings = result.get("rankings") or {}

    strikeouts_tab, outs_tab, hits_tab, walks_tab, earned_runs_tab = st.tabs(
        [
            "🎯 Strikeouts",
            "⏱️ Outs",
            "⚾ Hits Allowed",
            "👁️ Walks Allowed",
            "🔴 Earned Runs",
        ]
    )

    with strikeouts_tab:
        _render_category("strikeouts", rankings.get("strikeouts", []))

    with outs_tab:
        _render_category("outs_recorded", rankings.get("outs_recorded", []))

    with hits_tab:
        _render_category("hits_allowed", rankings.get("hits_allowed", []))

    with walks_tab:
        _render_category("walks_allowed", rankings.get("walks_allowed", []))

    with earned_runs_tab:
        _render_category("earned_runs", rankings.get("earned_runs", []))
