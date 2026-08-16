"""MLB Prediction Performance Tracker UI."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import streamlit as st

from data.mlb_performance_tracker import (
    current_day_view,
    records_for_period,
    summarize,
    sync_history,
)

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")

CATEGORY_CONFIG = {
    "home_runs": ("🔥 Home Runs", "HR"),
    "hits": ("⚾ Hits", "Hits"),
    "total_bases": ("💥 Total Bases", "TB"),
}


def _tier_line(label: str, data: dict[str, Any]) -> str:
    if not data.get("total"):
        return f"**{label}:** —"
    return (
        f"**{label}:** {data['wins']}-{data['losses']} · "
        f"{data['hit_rate']:.1f}%"
    )


def _render_market(history: dict[str, Any], category: str, period: str) -> None:
    rows = records_for_period(history, category, period)
    summary = summarize(rows)

    m1, m2, m3, m4 = st.columns(4)
    with m1:
        st.metric("Record", f"{summary['wins']}-{summary['losses']}")
    with m2:
        st.metric("Hit Rate", f"{summary['hit_rate']:.1f}%")
    with m3:
        st.metric("Graded", summary["graded"])
    with m4:
        st.metric("Pending", summary["pending"])

    st.markdown(
        " · ".join(
            [
                _tier_line("Top 5", summary["top_5"]),
                _tier_line("#6–10", summary["six_to_ten"]),
                _tier_line("#11–25", summary["eleven_to_25"]),
            ]
        )
    )

    if summary["graded"]:
        st.caption(
            f"Average GI — winners {summary['avg_gi_wins']:.1f} · "
            f"misses {summary['avg_gi_misses']:.1f}"
        )
    else:
        st.caption("Final results will populate as today's games finish.")


def render_prediction_performance_tracker(
    rankings_by_category: dict[str, list[dict[str, Any]]],
) -> None:
    """Render persistent HR / Hits / TB testing performance."""
    st.subheader("📊 Prediction Performance")
    st.caption(
        "Frozen Top 25 predictions are graded against actual results. "
        "This testing record is not recalculated when the model changes."
    )

    try:
        token = st.secrets["GITHUB_TOKEN"]
        history = sync_history(token, rankings_by_category)
        history = current_day_view(history, rankings_by_category)
    except Exception as exc:
        st.warning(
            "Performance history could not be synchronized right now. "
            f"Details: {exc}"
        )
        return

    period = st.segmented_control(
        "Performance period",
        options=["Week", "Month", "Season"],
        default="Week",
        key="mlb_performance_period",
    ) or "Week"

    tabs = st.tabs([CATEGORY_CONFIG[key][0] for key in CATEGORY_CONFIG])
    for tab, category in zip(tabs, CATEGORY_CONFIG):
        with tab:
            _render_market(history, category, period)

    captured_days = len(history.get("days", {}))
    st.caption(
        f"Tracking history: {captured_days} slate"
        f"{'s' if captured_days != 1 else ''}."
    )
