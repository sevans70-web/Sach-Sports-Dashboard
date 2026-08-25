"""MLB Prediction Performance Tracker UI."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import streamlit as st

from data.mlb_performance_tracker import (
    all_records_for_period,
    current_day_view,
    records_for_period,
    summarize,
    summarize_overall,
    sync_history,
)
from data.mlb_pitcher_performance_tracker import (
    current_day_view as current_pitcher_day_view,
    records_for_period as pitcher_records_for_period,
    summarize_projection_accuracy,
    sync_history as sync_pitcher_history,
)
from engines.mlb_pitcher_intelligence import get_pitcher_rankings

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")

BATTER_CATEGORY_CONFIG = {
    "home_runs": ("🔥 Home Runs", "HR"),
    "hits": ("⚾ Hits", "Hits"),
    "total_bases": ("💥 Total Bases", "TB"),
    "runs": ("🏃 Runs", "Runs"),
    "rbis": ("🎯 RBIs", "RBIs"),
    "walks": ("👁️ Walks", "Walks"),
    "stolen_bases": ("💨 Stolen Bases", "SB"),
    "hits_runs_rbis": ("📊 H+R+RBI", "H+R+RBI"),
}

PITCHER_CATEGORY_CONFIG = {
    "strikeouts": ("🎯 Strikeouts", "K"),
    "outs_recorded": ("⏱️ Outs Recorded", "Outs"),
    "hits_allowed": ("⚾ Hits Allowed", "Hits"),
    "walks_allowed": ("👁️ Walks Allowed", "BB"),
    "earned_runs": ("🔴 Earned Runs", "ER"),
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


def _all_records_for_selected_period(
    history: dict[str, Any],
    period: str,
) -> list[dict[str, Any]]:
    if period == "Yesterday":
        yesterday = datetime.now(TORONTO_TIMEZONE).date() - timedelta(days=1)
        return all_records_for_period(history, "Today", today=yesterday)
    return all_records_for_period(history, period)


def _render_overall_batter_performance(
    history: dict[str, Any],
    period: str,
) -> None:
    rows = _all_records_for_selected_period(history, period)
    summary = summarize_overall(rows)
    top_5 = summary["top_5_overall"]
    top_25 = summary["top_25_overall"]

    st.markdown("#### 🌐 Overall MLB Batter Performance")
    if not summary["graded"]:
        st.caption("Overall performance will populate as tracked predictions settle.")
        return

    col1, col2, col3 = st.columns(3)
    col1.metric("Overall Hit Rate", f"{summary['hit_rate']:.1f}%")
    col2.metric("Correct / Settled", f"{summary['wins']} / {summary['graded']}")
    col3.metric("Pending", str(summary["pending"]))

    left, right = st.columns(2)
    left.metric(
        "Top 5 Overall",
        f"{top_5['hit_rate']:.1f}%" if top_5["total"] else "—",
        f"{top_5['wins']}-{top_5['losses']}" if top_5["total"] else None,
    )
    right.metric(
        "Full Top 25 Overall",
        f"{top_25['hit_rate']:.1f}%" if top_25["total"] else "—",
        f"{top_25['wins']}-{top_25['losses']}" if top_25["total"] else None,
    )
    st.caption(
        "Combined across all tracked batter prop categories. Each settled prop "
        "prediction counts once; category percentages are not simply averaged."
    )


def _pitcher_records_for_selected_period(
    history: dict[str, Any],
    category: str,
    period: str,
) -> list[dict[str, Any]]:
    if period == "Yesterday":
        yesterday = (
            datetime.now(TORONTO_TIMEZONE).date()
            - timedelta(days=1)
        )
        return pitcher_records_for_period(
            history,
            category,
            "Today",
            today=yesterday,
        )

    return pitcher_records_for_period(history, category, period)


def _render_batter_market(
    history: dict[str, Any],
    category: str,
    period: str,
) -> None:
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
    elif period == "Yesterday":
        st.caption("No graded results are available for yesterday yet.")
    else:
        st.caption("Final results will populate as today's games finish.")


def _pitcher_tier_line(label: str, data: dict[str, Any]) -> str:
    if not data.get("graded"):
        return f"**{label}:** —"
    return (
        f"**{label}:** avg error {data['mean_absolute_error']:.2f} · "
        f"within 1: {data['within_one_rate']:.1f}%"
    )


def _render_pitcher_market(
    history: dict[str, Any],
    category: str,
    period: str,
) -> None:
    rows = _pitcher_records_for_selected_period(history, category, period)
    summary = summarize_projection_accuracy(rows)
    unit = PITCHER_CATEGORY_CONFIG[category][1]

    st.markdown(
        f"""
        <div class="perf-summary-row">
            <div class="perf-summary-item">
                <span class="perf-label">Average Projection Error</span>
                <strong>{summary['mean_absolute_error']:.2f}</strong>
                <span class="perf-subtext">{unit} from final result</span>
            </div>
            <div class="perf-summary-item">
                <span class="perf-label">Pending</span>
                <strong>{summary['pending']}</strong>
                <span class="perf-subtext">
                    {'Awaiting final pitcher results' if summary['pending'] else 'All results recorded'}
                </span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(
        " · ".join(
            [
                _pitcher_tier_line("Top 5", summary["top_5"]),
                _pitcher_tier_line("#6–10", summary["six_to_ten"]),
                _pitcher_tier_line("#11–25", summary["eleven_to_25"]),
            ]
        )
    )

    if summary["graded"]:
        st.caption(
            f"Projection accuracy — within 0.5: {summary['within_half_rate']:.1f}% · "
            f"within 1.0: {summary['within_one_rate']:.1f}% · "
            f"graded: {summary['graded']}."
        )
    elif period == "Yesterday":
        st.caption("No finalized pitcher projections are available for yesterday yet.")
    else:
        st.caption("Final pitcher results will populate as games finish.")


def _styles() -> None:
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


def render_prediction_performance_tracker(
    rankings_by_category: dict[str, list[dict[str, Any]]],
) -> None:
    """Render persistent MLB Batter and Pitcher prediction testing performance."""
    _styles()

    st.subheader("📊 Prediction Performance")
    st.caption(
        "Frozen pregame predictions are compared with actual results. "
        "Batter markets show hit rate; pitcher markets measure how close the "
        "dashboard projection was to the pitcher's final stat."
    )

    try:
        token = st.secrets["GITHUB_TOKEN"]
        batter_history = sync_history(token, rankings_by_category)
        batter_history = current_day_view(
            batter_history,
            rankings_by_category,
        )
    except Exception as exc:
        st.warning(
            "Batter performance history could not be synchronized right now. "
            f"Details: {exc}"
        )
        batter_history = {"days": {}}

    period = st.segmented_control(
        "Performance period",
        options=["Today", "Yesterday", "Week", "Month", "Season"],
        default="Today",
        key="mlb_performance_period",
    ) or "Today"

    batter_perf_tab, pitcher_perf_tab = st.tabs(
        ["🥎 Batter", "⚾ Pitcher"]
    )

    with batter_perf_tab:
        _render_overall_batter_performance(batter_history, period)
        st.divider()
        tabs = st.tabs(
            [BATTER_CATEGORY_CONFIG[key][0] for key in BATTER_CATEGORY_CONFIG]
        )
        for tab, category in zip(tabs, BATTER_CATEGORY_CONFIG):
            with tab:
                _render_batter_market(batter_history, category, period)

        captured_days = len(batter_history.get("days", {}))
        st.caption(
            f"Tracking history: {captured_days} slate"
            f"{'s' if captured_days != 1 else ''}."
        )

    with pitcher_perf_tab:
        try:
            pitcher_result = get_pitcher_rankings(limit=25)
            pitcher_rankings = pitcher_result.get("rankings", {})

            pitcher_history = sync_pitcher_history(
                token,
                pitcher_rankings,
            )
            pitcher_history = current_pitcher_day_view(
                pitcher_history,
                pitcher_rankings,
            )

            tabs = st.tabs(
                [
                    PITCHER_CATEGORY_CONFIG[key][0]
                    for key in PITCHER_CATEGORY_CONFIG
                ]
            )
            for tab, category in zip(tabs, PITCHER_CATEGORY_CONFIG):
                with tab:
                    _render_pitcher_market(
                        pitcher_history,
                        category,
                        period,
                    )

            captured_days = len(pitcher_history.get("days", {}))
            st.caption(
                f"Pitcher tracking history: {captured_days} slate"
                f"{'s' if captured_days != 1 else ''}."
            )
        except Exception as exc:
            st.warning(
                "Pitcher performance history could not be synchronized right now. "
                f"Details: {exc}"
            )
