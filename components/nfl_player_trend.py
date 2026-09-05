"""Sach NFL Last-10 market performance chart."""
from __future__ import annotations

import altair as alt
import pandas as pd
import streamlit as st

from data.nfl_player_history import player_last_games


def _fmt_value(value: float, market: str) -> str:
    if market in {"Passing TDs", "Receptions", "Sacks", "Tackles + Assists", "Anytime TD", "First TD"}:
        return f"{value:.0f}" if float(value).is_integer() else f"{value:.1f}"
    return f"{value:.0f}"


def render_nfl_player_trend(player_id: str, market: str, current_line: float | None = None) -> bool:
    history = player_last_games(player_id, market, limit=10)
    st.markdown("### Last 10 · Game-by-Game")

    if history.empty:
        st.markdown(
            """
            <div style="padding:14px;border:1px solid #30343a;border-left:4px solid #d6b35c;border-radius:12px;background:#101112;color:#d7dade;line-height:1.45">
              <b style="color:#f6c84c">NFL history starts here.</b><br>
              This player does not yet have NFL regular-season game history to plot. The chart will begin filling with real game results once those games are played.
            </div>
            """,
            unsafe_allow_html=True,
        )
        return False

    plot = history.copy()
    plot["value"] = pd.to_numeric(plot["value"], errors="coerce")
    plot = plot.dropna(subset=["value"]).reset_index(drop=True)
    plot["value_label"] = plot["value"].map(lambda x: _fmt_value(float(x), market))

    has_line = current_line is not None and not pd.isna(current_line)
    line_value = float(current_line) if has_line else None
    plot["result"] = "Game result"
    if has_line:
        plot["result"] = plot["value"].map(lambda x: "Cleared line" if x > line_value else "Below line")

    color_scale = alt.Scale(
        domain=["Cleared line", "Below line", "Game result"],
        range=["#19d978", "#ff6675", "#d6b35c"],
    )
    bars = alt.Chart(plot).mark_bar(cornerRadiusTopLeft=5, cornerRadiusTopRight=5).encode(
        x=alt.X("chart_label:N", sort=None, title=None, axis=alt.Axis(labelAngle=0, labelLimit=70, labelLineHeight=12, labelPadding=8)),
        y=alt.Y("value:Q", title=None, scale=alt.Scale(zero=True)),
        color=alt.Color("result:N", legend=None, scale=color_scale),
        tooltip=[
            alt.Tooltip("date_label:N", title="Date"),
            alt.Tooltip("opponent:N", title="Opponent"),
            alt.Tooltip("value:Q", title=market, format=".1f"),
        ],
    )
    labels = alt.Chart(plot).mark_text(dy=-9, fontWeight="bold", color="#ffffff", fontSize=12).encode(
        x=alt.X("chart_label:N", sort=None), y="value:Q", text="value_label:N"
    )
    chart = bars + labels
    if has_line:
        rule = alt.Chart(pd.DataFrame({"line": [line_value]})).mark_rule(stroke="#c7cbd0", strokeDash=[6, 5], size=2).encode(y="line:Q")
        chart = chart + rule

    st.altair_chart(
        chart.properties(height=280).configure_view(strokeOpacity=0).configure_axis(grid=False, domain=False, labelColor="#bfc3c8"),
        use_container_width=True,
    )

    values = plot["value"].dropna()
    c1, c2, c3, c4 = st.columns(4)
    season_avg = values.mean() if not values.empty else None
    l5_avg = values.tail(5).mean() if not values.empty else None
    l10_avg = values.tail(10).mean() if not values.empty else None
    with c1: st.metric("SEASON", "—" if season_avg is None else f"{season_avg:.1f}")
    with c2: st.metric("L5", "—" if l5_avg is None else f"{l5_avg:.1f}")
    with c3: st.metric("L10", "—" if l10_avg is None else f"{l10_avg:.1f}")
    with c4:
        if has_line:
            hits = int((values.tail(10) > line_value).sum())
            st.metric("L10 HIT", f"{hits}/{min(10, len(values))}")
        else:
            st.metric("GAMES", str(len(values)))
    return True
