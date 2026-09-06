"""MLB last-10 market chart matching the NFL player-profile experience."""

from __future__ import annotations

import altair as alt
import pandas as pd
import streamlit as st


MARKET_FIELDS = {
    "Home Runs": ("home_runs", "HR", 0.5),
    "Hits": ("hits", "Hits", 0.5),
    "Total Bases": ("total_bases", "Total Bases", 1.5),
    "Runs": ("runs", "Runs", 0.5),
    "RBIs": ("rbi", "RBIs", 0.5),
    "Walks": ("walks", "Walks", 0.5),
    "Stolen Bases": ("stolen_bases", "Stolen Bases", 0.5),
    "Hits + Runs + RBIs": ("hits_runs_rbis", "H+R+RBI", 1.5),
}


def _market_value(row: dict, field: str) -> float:
    if field == "hits_runs_rbis":
        return float(row.get("hits") or 0) + float(row.get("runs") or 0) + float(row.get("rbi") or 0)
    return float(row.get(field) or 0)


def render_mlb_player_trend(game_log: list[dict], category: str) -> bool:
    field, label, threshold = MARKET_FIELDS.get(
        str(category or "Home Runs"), MARKET_FIELDS["Home Runs"]
    )
    rows = list(game_log or [])[-10:]
    st.markdown(
        f'<div class="mlb-trend-title">Last 10 Games · {label}</div>',
        unsafe_allow_html=True,
    )
    if not rows:
        st.caption("Regular-season game history is unavailable for this player.")
        return False

    data = []
    for row in rows:
        value = _market_value(row, field)
        opponent = str(row.get("opponent") or "Opponent")
        data.append(
            {
                "game_date": row.get("date"),
                "chart_label": opponent,
                "opponent": opponent,
                "value": value,
                "value_label": f"{value:.0f}",
                "result": "Cleared line" if value > threshold else "Below line",
            }
        )

    source = pd.DataFrame(data)
    color_scale = alt.Scale(
        domain=["Cleared line", "Below line"],
        range=["#19d978", "#ff6675"],
    )
    bars = alt.Chart(source).mark_bar(
        cornerRadiusTopLeft=5, cornerRadiusTopRight=5
    ).encode(
        x=alt.X("chart_label:N", sort=None, title=None, axis=alt.Axis(labelAngle=0, labelLimit=70, labelPadding=8)),
        y=alt.Y("value:Q", title=None, scale=alt.Scale(zero=True)),
        color=alt.Color("result:N", legend=None, scale=color_scale),
        tooltip=[
            alt.Tooltip("game_date:T", title="Date", format="%B %-d, %Y"),
            alt.Tooltip("opponent:N", title="Opponent"),
            alt.Tooltip("value:Q", title=label, format=".0f"),
        ],
    )
    labels = alt.Chart(source).mark_text(
        dy=-9, fontWeight="bold", color="#ffffff", fontSize=12
    ).encode(x=alt.X("chart_label:N", sort=None), y="value:Q", text="value_label:N")
    rule = alt.Chart(pd.DataFrame({"line": [threshold]})).mark_rule(
        stroke="#c7cbd0", strokeDash=[6, 5], size=2
    ).encode(y="line:Q")

    with st.container(key="mlb_player_trend_chart"):
        st.altair_chart(
            (bars + labels + rule).properties(height=280).configure_view(strokeOpacity=0).configure_axis(
                grid=False, domain=False, labelColor="#bfc3c8"
            ),
            use_container_width=True,
        )

    values = source["value"]
    hits = int((values > threshold).sum())
    st.markdown(
        '<div class="mlb-trend-summary">'
        f'<div><span>10-GAME TOTAL</span><strong>{values.sum():.0f}</strong></div>'
        f'<div><span>L5 AVG</span><strong>{values.tail(5).mean():.1f}</strong></div>'
        f'<div><span>L10 AVG</span><strong>{values.mean():.1f}</strong></div>'
        f'<div><span>L10 HIT</span><strong>{hits}/{len(values)}</strong></div>'
        '</div>',
        unsafe_allow_html=True,
    )
    return True
