"""Sach NFL Last-10 market performance chart."""
from __future__ import annotations

import altair as alt
import pandas as pd
import streamlit as st

from data.nfl_player_history import player_last_games


def _fmt_value(value: float, market: str) -> str:
    if market in {"Passing TDs", "Interceptions", "Receptions", "Sacks", "Tackles", "Tackles + Assists", "Anytime TD", "First TD"}:
        return f"{value:.0f}" if float(value).is_integer() else f"{value:.1f}"
    return f"{value:.0f}"


def render_nfl_player_trend(
    player_id: str,
    market: str,
    current_line: float | None = None,
    player_name: str = "",
) -> bool:
    history = player_last_games(
        player_id,
        market,
        limit=22,
        player_name=player_name,
    )
    st.markdown(
        '<div class="nfl-trend-title">Last 10 Games · '
        f'{market}</div>',
        unsafe_allow_html=True,
    )

    if history.empty:
        st.markdown(
            """
            <div class="nfl-history-empty">
              <b>Game history unavailable.</b><br>
              Regular-season results could not be loaded for this player and market.
            </div>
            """,
            unsafe_allow_html=True,
        )
        return False

    full_history = history.copy()
    full_history["show_in_chart"] = False
    full_history.loc[full_history.tail(10).index, "show_in_chart"] = True
    plot = full_history[full_history["show_in_chart"]].copy()
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
    source = full_history.copy()
    source["value"] = pd.to_numeric(source["value"], errors="coerce")
    source["value_label"] = source["value"].map(lambda x: _fmt_value(float(x), market))
    source["result"] = "Game result"
    if has_line:
        source["result"] = source["value"].map(lambda x: "Cleared line" if x > line_value else "Below line")
    bars = alt.Chart(source).transform_filter(alt.datum.show_in_chart).mark_bar(cornerRadiusTopLeft=5, cornerRadiusTopRight=5).encode(
        x=alt.X("chart_label:N", sort=None, title=None, axis=alt.Axis(labelAngle=0, labelLimit=70, labelLineHeight=12, labelPadding=8)),
        y=alt.Y("value:Q", title=None, scale=alt.Scale(zero=True)),
        color=alt.Color("result:N", legend=None, scale=color_scale),
        tooltip=[
            alt.Tooltip("date_label:N", title="Date"),
            alt.Tooltip("opponent:N", title="Opponent"),
            alt.Tooltip("value:Q", title=market, format=".1f"),
        ],
    )
    labels = alt.Chart(source).transform_filter(alt.datum.show_in_chart).mark_text(dy=-9, fontWeight="bold", color="#ffffff", fontSize=12).encode(
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
    season_total = values.sum() if not values.empty else None
    l5_avg = values.tail(5).mean() if not values.empty else None
    l10_avg = values.tail(10).mean() if not values.empty else None
    fourth_label, fourth_value = "GAMES", str(len(values))
    if has_line:
        hits = int((values.tail(10) > line_value).sum())
        fourth_label, fourth_value = "L10 HIT", f"{hits}/{min(10, len(values))}"
    st.markdown(
        '<div class="nfl-trend-summary">'
        f'<div><span>10-GAME TOTAL</span><strong>{"—" if season_total is None else f"{season_total:.1f}"}</strong></div>'
        f'<div><span>L5</span><strong>{"—" if l5_avg is None else f"{l5_avg:.1f}"}</strong></div>'
        f'<div><span>L10</span><strong>{"—" if l10_avg is None else f"{l10_avg:.1f}"}</strong></div>'
        f'<div><span>{fourth_label}</span><strong>{fourth_value}</strong></div>'
        '</div>', unsafe_allow_html=True,
    )
    return True
