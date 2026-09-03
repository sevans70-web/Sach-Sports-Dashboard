"""Compact mobile-first MLB Prediction Performance UI."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import streamlit as st

from data.mlb_performance_tracker import (
    all_records_for_period,
    records_for_period,
    summarize,
    summarize_overall,
    refresh_history_view,
)
from data.mlb_pitcher_performance_tracker import (
    records_for_period as pitcher_records_for_period,
    summarize_projection_accuracy,
    refresh_history_view as refresh_pitcher_history_view,
)
from database.mlb_dashboard_reads import load_performance_history_from_supabase

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")

BATTER_CATEGORY_CONFIG = {
    "home_runs": ("🔥 Home Runs", "HR"),
    "hits": ("⚾ Hits", "Hits"),
    "total_bases": ("💥 Total Bases", "TB"),
    "runs": ("🏃 Runs", "Runs"),
    "rbis": ("🎯 RBIs", "RBIs"),
    "walks": ("◉ Walks", "Walks"),
    "stolen_bases": ("💨 Stolen Bases", "SB"),
    "hits_runs_rbis": ("📊 H+R+RBI", "H+R+RBI"),
}

PITCHER_CATEGORY_CONFIG = {
    "strikeouts": ("🎯 Strikeouts", "K"),
    "outs_recorded": ("⏱️ Outs", "Outs"),
    "hits_allowed": ("⚾ Hits Allowed", "Hits"),
    "walks_allowed": ("◉ Walks Allowed", "BB"),
    "earned_runs": ("● Earned Runs", "ER"),
}


@st.cache_data(ttl=60, show_spinner=False)
def _cached_batter_history() -> dict[str, Any]:
    return refresh_history_view(
        load_performance_history_from_supabase("batter"),
        recent_days=8,
    )


@st.cache_data(ttl=60, show_spinner=False)
def _cached_pitcher_history() -> dict[str, Any]:
    return refresh_pitcher_history_view(
        load_performance_history_from_supabase("pitcher"),
        recent_days=8,
    )


def _records(history, category, period):
    if period == "Yesterday":
        yesterday = datetime.now(TORONTO_TIMEZONE).date() - timedelta(days=1)
        return records_for_period(history, category, "Today", today=yesterday)
    return records_for_period(history, category, period)


def _all_records(history, period):
    if period == "Yesterday":
        yesterday = datetime.now(TORONTO_TIMEZONE).date() - timedelta(days=1)
        return all_records_for_period(history, "Today", today=yesterday)
    return all_records_for_period(history, period)


def _pitcher_records(history, category, period):
    if period == "Yesterday":
        yesterday = datetime.now(TORONTO_TIMEZONE).date() - timedelta(days=1)
        return pitcher_records_for_period(history, category, "Today", today=yesterday)
    return pitcher_records_for_period(history, category, period)


def _styles() -> None:
    st.markdown(
        """
        <style>
        .perf-summary-row,.perf-kpi-grid{
            display:grid!important;
            grid-template-columns:repeat(3,minmax(0,1fr))!important;
            gap:7px!important;
            margin:7px 0 8px!important;
        }
        .perf-summary-row.perf-batter-four{
            grid-template-columns:repeat(4,minmax(0,1fr))!important;
            gap:5px!important;
        }
        .perf-summary-item,.perf-kpi{
            min-width:0!important;
            min-height:78px!important;
            padding:8px!important;
            border-radius:11px!important;
            background:#101112!important;
            border:2px solid #34373c!important;
            display:flex!important;
            flex-direction:column!important;
            justify-content:center!important;
        }
        .perf-summary-item:first-child,.perf-kpi:nth-child(1){
            border-color:rgba(25,217,120,.78)!important;
        }
        .perf-summary-item:nth-child(3),.perf-kpi:nth-child(3){
            border-color:rgba(255,204,51,.72)!important;
        }
        .perf-label,.perf-summary-item span,.perf-kpi span,.perf-kpi small{
            color:#a7abb2!important;
            font-size:.66rem!important;
            line-height:1.15!important;
        }
        .perf-summary-item strong,.perf-kpi strong{
            color:#fff!important;
            font-size:1rem!important;
            line-height:1.05!important;
            margin:3px 0!important;
        }

        /* Use the same native Streamlit segmented control as HR Intelligence.
           Only force one-row sizing; do not overwrite native selected-state
           colors, so the active period remains obvious. */
        div[class*="st-key-mlb_batter_performance_period"] [data-testid="stSegmentedControl"],
        div[class*="st-key-mlb_pitcher_performance_period"] [data-testid="stSegmentedControl"]{
            width:100%!important;
            max-width:100%!important;
        }
        div[class*="st-key-mlb_batter_performance_period"] [data-testid="stSegmentedControl"] > div,
        div[class*="st-key-mlb_pitcher_performance_period"] [data-testid="stSegmentedControl"] > div,
        div[class*="st-key-mlb_batter_performance_period"] [role="radiogroup"],
        div[class*="st-key-mlb_pitcher_performance_period"] [role="radiogroup"]{
            display:grid!important;
            grid-template-columns:repeat(5,minmax(0,1fr))!important;
            width:100%!important;
            gap:0!important;
            flex-wrap:nowrap!important;
        }
        div[class*="st-key-mlb_batter_performance_period"] button,
        div[class*="st-key-mlb_pitcher_performance_period"] button{
            min-width:0!important;
            width:100%!important;
            white-space:nowrap!important;
            padding-left:3px!important;
            padding-right:3px!important;
            font-size:.62rem!important;
        }

        @media(max-width:700px){
            .perf-summary-row,.perf-kpi-grid{
                grid-template-columns:repeat(3,minmax(0,1fr))!important;
                gap:6px!important;
            }
            .perf-summary-row.perf-batter-four{
                grid-template-columns:repeat(4,minmax(0,1fr))!important;
                gap:4px!important;
            }
            .perf-summary-item,.perf-kpi{
                min-height:68px!important;
                padding:6px 5px!important;
            }
            .perf-summary-row.perf-batter-four .perf-label{
                font-size:.55rem!important;
            }
            .perf-summary-row.perf-batter-four .perf-summary-item strong{
                font-size:.82rem!important;
            }
            div[class*="st-key-mlb_batter_performance_period"] button,
            div[class*="st-key-mlb_pitcher_performance_period"] button{
                font-size:.56rem!important;
                min-height:34px!important;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _period_control(key: str) -> str:
    """Exactly the same control type used by HR Intelligence."""
    options = ["Today", "Yesterday", "7 Days", "Month", "Season"]
    current = st.session_state.get(key, "Today")
    if current not in options:
        current = "Today"

    selected = st.segmented_control(
        "Performance Period",
        options=options,
        default=current,
        key=key,
        selection_mode="single",
        label_visibility="collapsed",
    )
    return selected or current


def _render_batter_market(history, category, period):
    summary = summarize(_records(history, category, period))
    total = summary["graded"] + summary["pending"]
    st.markdown(
        f"<div class='perf-summary-row perf-batter-four'>"
        f"<div class='perf-summary-item'><span class='perf-label'>Hits / Predictions</span><strong>{summary['wins']} / {total}</strong></div>"
        f"<div class='perf-summary-item'><span class='perf-label'>Pending</span><strong>{summary['pending']}</strong></div>"
        f"<div class='perf-summary-item'><span class='perf-label'>Settled</span><strong>{summary['graded']}</strong></div>"
        f"<div class='perf-summary-item'><span class='perf-label'>Hit Rate</span><strong>{summary['hit_rate']:.1f}%</strong></div>"
        f"</div>",
        unsafe_allow_html=True,
    )
    if summary["graded"]:
        def tier(label, data):
            return f"**{label}:** {data['hit_rate']:.1f}%" if data.get("total") else ""
        lines = [
            tier("Top 5", summary["top_5"]),
            tier("#6–10", summary["six_to_ten"]),
            tier("#11–25", summary["eleven_to_25"]),
        ]
        st.markdown(" · ".join(value for value in lines if value))
    else:
        st.caption("Results will appear after games are graded.")


def _render_overall(history, period):
    summary = summarize_overall(_all_records(history, period))
    if not summary["graded"]:
        st.caption("Overall performance will populate as tracked predictions settle.")
        return
    st.markdown(
        f"<div class='perf-kpi-grid'>"
        f"<div class='perf-kpi'><span>Hit Rate</span><strong>{summary['hit_rate']:.1f}%</strong></div>"
        f"<div class='perf-kpi'><span>Settled</span><strong>{summary['wins']} / {summary['graded']}</strong></div>"
        f"<div class='perf-kpi'><span>Pending</span><strong>{summary['pending']}</strong></div>"
        f"</div>",
        unsafe_allow_html=True,
    )


def _render_pitcher_market(history, category, period):
    summary = summarize_projection_accuracy(
        _pitcher_records(history, category, period)
    )
    unit = PITCHER_CATEGORY_CONFIG[category][1]
    st.markdown(
        f"<div class='perf-summary-row'>"
        f"<div class='perf-summary-item'><span>Avg Error</span><strong>{summary['mean_absolute_error']:.2f}</strong><span>{unit}</span></div>"
        f"<div class='perf-summary-item'><span>Pending</span><strong>{summary['pending']}</strong><span>results</span></div>"
        f"<div class='perf-summary-item'><span>Graded</span><strong>{summary['graded']}</strong><span>projections</span></div>"
        f"</div>",
        unsafe_allow_html=True,
    )
    if summary["graded"]:
        st.caption(
            f"Within 0.5: {summary['within_half_rate']:.1f}% · "
            f"Within 1.0: {summary['within_one_rate']:.1f}%"
        )
    else:
        st.caption("Results will appear after games are graded.")


def render_prediction_performance_tracker(
    rankings_by_category: dict[str, list[dict[str, Any]]]
) -> None:
    _styles()
    st.subheader("📊 Prediction Performance")

    with st.expander("ⓘ How performance is measured", expanded=False):
        st.caption(
            "Batter performance grades the one frozen Top 25 for each market/day. "
            "Pitcher performance compares each frozen projection with the final MLB line."
        )

    try:
        batter_history = _cached_batter_history()
    except Exception:
        batter_history = {"schema_version": 1, "days": {}}
        st.caption("Batter performance history is temporarily unavailable.")

    batter_tab, pitcher_tab = st.tabs(["🥎 Batter", "⚾ Pitcher"])

    with batter_tab:
        st.markdown("#### 🌐 Overall MLB Batter Performance")
        period = _period_control("mlb_batter_performance_period")
        _render_overall(batter_history, period)
        tabs = st.tabs(
            [BATTER_CATEGORY_CONFIG[key][0] for key in BATTER_CATEGORY_CONFIG]
        )
        for tab, category in zip(tabs, BATTER_CATEGORY_CONFIG):
            with tab:
                _render_batter_market(batter_history, category, period)

    with pitcher_tab:
        st.markdown("#### 🌐 Overall MLB Pitcher Performance")
        period = _period_control("mlb_pitcher_performance_period")
        try:
            pitcher_history = _cached_pitcher_history()
            tabs = st.tabs(
                [PITCHER_CATEGORY_CONFIG[key][0] for key in PITCHER_CATEGORY_CONFIG]
            )
            for tab, category in zip(tabs, PITCHER_CATEGORY_CONFIG):
                with tab:
                    _render_pitcher_market(pitcher_history, category, period)
        except Exception:
            st.caption("Pitcher performance history is temporarily unavailable.")
