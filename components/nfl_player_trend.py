"""Sach NFL selectable recent-game market performance chart."""
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
    history_profile: str = "standard",
) -> bool:
    history = player_last_games(
        player_id,
        market,
        limit=22,
        player_name=player_name,
    )
    safe_key = "".join(char if char.isalnum() else "_" for char in f"{player_id}_{market}")
    range_label = st.segmented_control(
        "Game-history range",
        ["Last 5", "Last 10", "Last 20"],
        default="Last 10",
        key=f"nfl_history_range_{safe_key}",
        label_visibility="collapsed",
    ) or "Last 10"
    game_limit = {"Last 5": 5, "Last 10": 10, "Last 20": 20}[range_label]
    st.markdown(
        f'<div class="nfl-trend-title">{range_label} Games · {market}</div>',
        unsafe_allow_html=True,
    )

    if history.empty:
        if history_profile == "rookie":
            heading = "Rookie profile."
            detail = (
                f"This player does not yet have NFL regular-season {market.lower()} history. "
                "The chart will populate as NFL games are played."
            )
        elif history_profile == "no_prior_history":
            heading = "No prior NFL history."
            detail = (
                f"No prior NFL regular-season {market.lower()} results are available for this player. "
                "The chart will populate as qualifying games are played."
            )
        else:
            heading = "Game history unavailable."
            detail = (
                f"Verified NFL regular-season {market.lower()} results are not currently available "
                "for this player."
            )
        st.markdown(
            f"""
            <div class="nfl-history-empty">
              <b>{heading}</b><br>
              {detail}
            </div>
            """,
            unsafe_allow_html=True,
        )
        return False

    full_history = history.copy()
    full_history["show_in_chart"] = False
    full_history.loc[full_history.tail(game_limit).index, "show_in_chart"] = True
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
        x=alt.X("chart_label:N", sort=None, title=None, axis=alt.Axis(labelAngle=0, labelLimit=74, labelLineHeight=12, labelPadding=8, labelExpr="split(datum.label, '|')")),
        y=alt.Y("value:Q", title=None, scale=alt.Scale(zero=True)),
        color=alt.Color("result:N", legend=None, scale=color_scale),
        tooltip=[
            alt.Tooltip("game_date:T", title="Date", format="%B %-d, %Y"),
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

    with st.container(key="nfl_player_trend_chart"):
        st.altair_chart(
            chart.properties(height=280).configure_view(strokeOpacity=0).configure_axis(grid=False, domain=False, labelColor="#bfc3c8"),
            width="stretch",
        )

    if len(plot) < game_limit:
        st.caption(
            f"{len(plot)} qualifying game{'s' if len(plot) != 1 else ''} available "
            f"for this player and market."
        )

    values = plot["value"].dropna()
    selected_total = values.sum() if not values.empty else None
    all_values = pd.to_numeric(full_history["value"], errors="coerce").dropna()
    l5_avg = all_values.tail(5).mean() if not all_values.empty else None
    l10_avg = all_values.tail(10).mean() if not all_values.empty else None
    fourth_label, fourth_value = "GAMES", str(len(values))
    if has_line:
        hits = int((values > line_value).sum())
        fourth_label, fourth_value = f"L{game_limit} HIT", f"{hits}/{len(values)}"
    st.markdown(
        '<div class="nfl-trend-summary">'
        f'<div><span>{game_limit}-GAME TOTAL</span><strong>{"—" if selected_total is None else f"{selected_total:.1f}"}</strong></div>'
        f'<div><span>L5</span><strong>{"—" if l5_avg is None else f"{l5_avg:.1f}"}</strong></div>'
        f'<div><span>L10</span><strong>{"—" if l10_avg is None else f"{l10_avg:.1f}"}</strong></div>'
        f'<div><span>{fourth_label}</span><strong>{fourth_value}</strong></div>'
        '</div>', unsafe_allow_html=True,
    )
    return True
