"""NFL Last-10 market performance chart."""
from __future__ import annotations

import altair as alt
import pandas as pd
import streamlit as st

from data.nfl_player_history import player_last_games


def render_nfl_player_trend(player_id: str, market: str, current_line: float | None = None) -> None:
    history = player_last_games(player_id, market, limit=10)
    st.markdown("### Recent Performance & Trends")
    if history.empty:
        st.caption("Game-by-game history is not available for this player yet.")
        return

    chart = alt.Chart(history).mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4).encode(
        x=alt.X("chart_label:N", sort=None, title=None, axis=alt.Axis(labelAngle=-45, labelLimit=90)),
        y=alt.Y("value:Q", title=market),
        tooltip=[alt.Tooltip("date_label:N", title="Date"), alt.Tooltip("opponent:N", title="Opponent"), alt.Tooltip("value:Q", title=market, format=".1f")],
    )
    if current_line is not None and not pd.isna(current_line):
        line_df = pd.DataFrame({"line":[float(current_line)]})
        rule = alt.Chart(line_df).mark_rule(strokeDash=[6,4], size=2).encode(y="line:Q")
        chart = chart + rule
    st.altair_chart(chart.properties(height=290), use_container_width=True)

    values = pd.to_numeric(history["value"], errors="coerce").dropna()
    l5 = values.tail(5).mean() if not values.empty else None
    l10 = values.tail(10).mean() if not values.empty else None
    cols = st.columns(3)
    cols[0].metric("Last 5 avg", "—" if l5 is None else f"{l5:.1f}")
    cols[1].metric("Last 10 avg", "—" if l10 is None else f"{l10:.1f}")
    if current_line is not None and not pd.isna(current_line):
        hits = int((values.tail(10) > float(current_line)).sum())
        cols[2].metric("L10 over line", f"{hits}/{min(10, len(values))}")
    else:
        cols[2].metric("Games shown", str(len(values)))
