"""Interactive MLB recent-game market chart for dedicated player profiles."""

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


@st.fragment
def render_mlb_player_trend(
    game_log: list[dict],
    category: str,
    *,
    player_id: int | str = 0,
) -> bool:
    field, label, threshold = MARKET_FIELDS.get(
        str(category or "Home Runs"), MARKET_FIELDS["Home Runs"]
    )
    range_label = st.segmented_control(
        "Recent-game range",
        options=["Last 5", "Last 10", "Last 20"],
        default="Last 10",
        key=f"mlb_player_trend_range_{player_id}",
        selection_mode="single",
        label_visibility="collapsed",
    ) or "Last 10"
    game_limit = {"Last 5": 5, "Last 10": 10, "Last 20": 20}[range_label]
    rows = list(game_log or [])[-game_limit:]
    st.markdown(
        f'<div class="mlb-trend-title">{range_label} Games · {label}</div>',
        unsafe_allow_html=True,
    )
    if not rows:
        st.caption("Regular-season game history is unavailable for this player.")
        return False

    data = []
    for game_index, row in enumerate(rows, start=1):
        value = _market_value(row, field)
        opponent = str(row.get("opponent") or "Opponent")
        game_date = str(row.get("date") or "")
        short_date = game_date[5:].replace("-", "/") if len(game_date) >= 10 else game_date
        data.append(
            {
                "game_index": game_index,
                # A date suffix keeps repeat opponents as separate games instead
                # of letting Vega collapse them into one categorical bar.
                "chart_label": f"{opponent[:8]} · {short_date}",
                "game_date": game_date,
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
        x=alt.X(
            "chart_label:N",
            sort=alt.SortField(field="game_index", order="ascending"),
            title=None,
            axis=alt.Axis(
                labelAngle=-35 if game_limit > 10 else 0,
                labelLimit=72,
                labelPadding=8,
            ),
        ),
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
    ).encode(
        x=alt.X(
            "chart_label:N",
            sort=alt.SortField(field="game_index", order="ascending"),
        ),
        y="value:Q",
        text="value_label:N",
    )
    rule = alt.Chart(pd.DataFrame({"line": [threshold]})).mark_rule(
        stroke="#c7cbd0", strokeDash=[6, 5], size=2
    ).encode(y="line:Q")

    with st.container(key="mlb_player_trend_chart"):
        st.altair_chart(
            (bars + labels + rule).properties(height=290).configure_view(strokeOpacity=0).configure_axis(
                grid=False, domain=False, labelColor="#bfc3c8"
            ),
            use_container_width=True,
        )

    values = source["value"]
    hits = int((values > threshold).sum())
    st.markdown(
        '<div class="mlb-trend-summary">'
        f'<div><span>{game_limit}-GAME TOTAL</span><strong>{values.sum():.0f}</strong></div>'
        f'<div><span>L5 AVG</span><strong>{values.tail(5).mean():.1f}</strong></div>'
        f'<div><span>L{game_limit} AVG</span><strong>{values.mean():.1f}</strong></div>'
        f'<div><span>L{game_limit} HIT</span><strong>{hits}/{len(values)}</strong></div>'
        '</div>',
        unsafe_allow_html=True,
    )
    return True
