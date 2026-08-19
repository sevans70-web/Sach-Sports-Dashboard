"""MLB Prediction Performance Tracker UI."""

from __future__ import annotations

from datetime import datetime, timedelta
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
    "runs": ("🏃 Runs", "Runs"),
    "rbis": ("🎯 RBIs", "RBIs"),
    "walks": ("👁️ Walks", "Walks"),
    "stolen_bases": ("💨 Stolen Bases", "SB"),
}


def _tier_line(label: str, data: dict[str, Any]) -> str:
    if not data.get("total"):
        return f"**{label}:** —"
    return (
        f"**{label}:** {data['wins']}-{data['losses']} · "
        f"{data['hit_rate']:.1f}%"
    )


def _records_for_selected_period(
    history: dict[str, Any],
    category: str,
    period: str,
) -> list[dict[str, Any]]:
    if period == "Yesterday":
        yesterday = (
            datetime.now(TORONTO_TIMEZONE).date()
            - timedelta(days=1)
        )
        return records_for_period(
            history,
            category,
            "Today",
            today=yesterday,
        )

    return records_for_period(history, category, period)


def _render_market(history: dict[str, Any], category: str, period: str) -> None:
    rows = _records_for_selected_period(history, category, period)
    summary = summarize(rows)

    total_predictions = summary["graded"] + summary["pending"]

    st.markdown(
        f"""
        <div class="perf-summary-row">
            <div class="perf-summary-item">
                <span class="perf-label">Hits / Predictions</span>
                <strong>{summary['wins']} / {total_predictions}</strong>
                <span class="perf-subtext">{summary['hit_rate']:.1f}% hit rate</span>
            </div>
            <div class="perf-summary-item">
                <span class="perf-label">Pending</span>
                <strong>{summary['pending']}</strong>
                <span class="perf-subtext">
                    {'Awaiting results' if summary['pending'] else 'All results graded'}
                </span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

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
        if period == "Yesterday":
            st.caption("No graded results are available for yesterday yet.")
        else:
            st.caption("Final results will populate as today's games finish.")


def render_prediction_performance_tracker(
    rankings_by_category: dict[str, list[dict[str, Any]]],
) -> None:
    """Render persistent MLB prediction testing performance."""
    st.markdown(
        """
        <style>
        .perf-summary-row {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin: 10px 0 14px 0;
        }

        .perf-summary-item {
            background: rgba(15, 23, 42, 0.72);
            border: 1px solid rgba(56, 189, 248, 0.28);
            border-radius: 14px;
            padding: 12px 14px;
            min-width: 0;
        }

        .perf-summary-item .perf-label {
            display: block;
            font-size: 0.78rem;
            opacity: 0.72;
            margin-bottom: 4px;
        }

        .perf-summary-item strong {
            display: block;
            font-size: 1.55rem;
            line-height: 1.1;
            white-space: nowrap;
        }

        .perf-summary-item .perf-subtext {
            display: block;
            margin-top: 5px;
            font-size: 0.74rem;
            opacity: 0.68;
        }

        @media (max-width: 700px) {
            .perf-summary-row {
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 6px;
            }

            .perf-summary-item {
                border-radius: 10px;
                padding: 9px 8px;
            }

            .perf-summary-item .perf-label {
                font-size: 0.68rem;
            }

            .perf-summary-item strong {
                font-size: 1.15rem;
            }

            .perf-summary-item .perf-subtext {
                font-size: 0.64rem;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

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
        options=["Today", "Yesterday", "Week", "Month", "Season"],
        default="Today",
        key="mlb_performance_period",
    ) or "Today"

    tabs = st.tabs([CATEGORY_CONFIG[key][0] for key in CATEGORY_CONFIG])
    for tab, category in zip(tabs, CATEGORY_CONFIG):
        with tab:
            _render_market(history, category, period)

    captured_days = len(history.get("days", {}))
    st.caption(
        f"Tracking history: {captured_days} slate"
        f"{'s' if captured_days != 1 else ''}."
    )
