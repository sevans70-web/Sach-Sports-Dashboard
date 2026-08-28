"""Compact mobile-first MLB Prediction Performance UI."""

from __future__ import annotations
import os
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo
import streamlit as st

from data.mlb_performance_tracker import (
    all_records_for_period, current_day_view, records_for_period,
    summarize, summarize_overall, sync_history,
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
    "home_runs":("🔥 Home Runs","HR"), "hits":("⚾ Hits","Hits"),
    "total_bases":("💥 Total Bases","TB"), "runs":("🏃 Runs","Runs"),
    "rbis":("🎯 RBIs","RBIs"), "walks":("◉ Walks","Walks"),
    "stolen_bases":("💨 Stolen Bases","SB"), "hits_runs_rbis":("📊 H+R+RBI","H+R+RBI"),
}
PITCHER_CATEGORY_CONFIG = {
    "strikeouts":("🎯 Strikeouts","K"), "outs_recorded":("⏱️ Outs","Outs"),
    "hits_allowed":("⚾ Hits Allowed","Hits"), "walks_allowed":("◉ Walks Allowed","BB"),
    "earned_runs":("🔴 Earned Runs","ER"),
}

def _token() -> str | None:
    # Codespaces uses SACH_GITHUB_TOKEN; Streamlit Cloud uses GITHUB_TOKEN.
    token = os.getenv("SACH_GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN")
    if token:
        return token
    try:
        return st.secrets["GITHUB_TOKEN"]
    except Exception:
        return None

def _records(history, category, period):
    if period == "Yesterday":
        y = datetime.now(TORONTO_TIMEZONE).date() - timedelta(days=1)
        return records_for_period(history, category, "Today", today=y)
    return records_for_period(history, category, period)

def _all_records(history, period):
    if period == "Yesterday":
        y = datetime.now(TORONTO_TIMEZONE).date() - timedelta(days=1)
        return all_records_for_period(history, "Today", today=y)
    return all_records_for_period(history, period)

def _pitcher_records(history, category, period):
    if period == "Yesterday":
        y = datetime.now(TORONTO_TIMEZONE).date() - timedelta(days=1)
        return pitcher_records_for_period(history, category, "Today", today=y)
    return pitcher_records_for_period(history, category, period)

def _styles():
    st.markdown("""
    <style>
    .perf-summary-row,.perf-kpi-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important;margin:7px 0 8px!important}
    .perf-summary-item,.perf-kpi{
      min-width:0!important;min-height:86px!important;padding:8px!important;border-radius:11px!important;
      background:#101112!important;border:2px solid #34373c!important;display:flex!important;flex-direction:column!important;justify-content:center!important
    }
    .perf-summary-item:first-child,.perf-kpi:nth-child(1){border-color:rgba(25,217,120,.78)!important}
    .perf-summary-item:nth-child(3),.perf-kpi:nth-child(3){border-color:rgba(255,204,51,.72)!important}
    .perf-label,.perf-summary-item span,.perf-kpi span,.perf-kpi small{color:#a7abb2!important;font-size:.66rem!important;line-height:1.15!important}
    .perf-summary-item strong,.perf-kpi strong{color:#fff!important;font-size:1.04rem!important;line-height:1.05!important;margin:3px 0!important}
    div[data-testid="stSegmentedControl"] button{
      background:#0b0c0d!important;color:#fff!important;border:2px solid #34373c!important;font-weight:800!important
    }
    div[data-testid="stSegmentedControl"] button[aria-pressed="true"]{
      background:linear-gradient(110deg,rgba(255,204,51,.16),#0b0c0d 48%,rgba(25,217,120,.17))!important;
      border-color:#19d978!important;color:#fff!important
    }
    div[data-testid="stTabs"] [data-baseweb="tab-highlight"]{background:#19d978!important}
    div[data-testid="stExpander"],div[data-testid="stExpander"] summary{
      background:#080909!important;color:#fff!important;border-color:#3a3d42!important
    }
    @media(max-width:700px){
      .perf-summary-row,.perf-kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important}
      .perf-summary-item,.perf-kpi{min-height:74px!important;padding:7px 6px!important}
      .perf-summary-item strong,.perf-kpi strong{font-size:.96rem!important}
    }
    
    [data-testid="stTabs"] [data-baseweb="tab-highlight"],
    [data-baseweb="tab-highlight"] {
        background:#19d978!important;
    }

    [data-testid="stTabs"] button[role="tab"][aria-selected="true"],
    button[data-baseweb="tab"][aria-selected="true"] {
        box-shadow:inset 0 -3px 0 #19d978!important;
        border-bottom-color:#19d978!important;
    }

    [data-testid="stTabs"] button[aria-label*="scroll" i],
    [data-testid="stTabs"] button[title*="scroll" i] {
        background:#080909!important;
        color:#f6c84c!important;
        border:1px solid #34373c!important;
    }
</style>
    """, unsafe_allow_html=True)

def _render_batter_market(history, category, period):
    summary = summarize(_records(history, category, period))
    total = summary["graded"] + summary["pending"]
    st.markdown(
        f"<div class='perf-summary-row'>"
        f"<div class='perf-summary-item'><span class='perf-label'>Hits / Predictions</span><strong>{summary['wins']} / {total}</strong><span>{summary['hit_rate']:.1f}% hit rate</span></div>"
        f"<div class='perf-summary-item'><span class='perf-label'>Pending</span><strong>{summary['pending']}</strong><span>{'Awaiting results' if summary['pending'] else 'All graded'}</span></div>"
        f"<div class='perf-summary-item'><span class='perf-label'>Settled</span><strong>{summary['graded']}</strong><span>predictions</span></div>"
        f"</div>", unsafe_allow_html=True
    )
    if summary["graded"]:
        def tier(label, data):
            return f"**{label}:** {data['hit_rate']:.1f}%" if data.get("total") else ""
        lines = [tier("Top 5",summary["top_5"]),tier("#6–10",summary["six_to_ten"]),tier("#11–25",summary["eleven_to_25"])]
        st.markdown(" · ".join(x for x in lines if x))
    else:
        st.caption("Results will appear after games are graded.")

def _render_overall(history, period):
    summary = summarize_overall(_all_records(history, period))
    st.markdown("#### 🌐 Overall MLB Batter Performance")
    if not summary["graded"]:
        st.caption("Overall performance will populate as tracked predictions settle.")
        return
    top5 = summary["top_5_overall"]; top25 = summary["top_25_overall"]
    st.markdown(
        f"<div class='perf-kpi-grid'>"
        f"<div class='perf-kpi'><span>Hit Rate</span><strong>{summary['hit_rate']:.1f}%</strong></div>"
        f"<div class='perf-kpi'><span>Settled</span><strong>{summary['wins']} / {summary['graded']}</strong></div>"
        f"<div class='perf-kpi'><span>Pending</span><strong>{summary['pending']}</strong></div>"
        f"</div>", unsafe_allow_html=True
    )

def _render_pitcher_market(history, category, period):
    summary = summarize_projection_accuracy(_pitcher_records(history,category,period))
    unit = PITCHER_CATEGORY_CONFIG[category][1]
    st.markdown(
        f"<div class='perf-summary-row'>"
        f"<div class='perf-summary-item'><span>Avg Error</span><strong>{summary['mean_absolute_error']:.2f}</strong><span>{unit}</span></div>"
        f"<div class='perf-summary-item'><span>Pending</span><strong>{summary['pending']}</strong><span>results</span></div>"
        f"<div class='perf-summary-item'><span>Graded</span><strong>{summary['graded']}</strong><span>projections</span></div>"
        f"</div>", unsafe_allow_html=True
    )
    if not summary["graded"]:
        st.caption("Results will appear after games are graded.")

def _period_control(key: str) -> str:
    """Visible one-tap period selector; never collapse to a dropdown."""
    options = ["Today", "Yesterday", "7 Days", "Month", "Season"]
    current = st.session_state.get(key, "Today")
    selected = st.segmented_control(
        "Performance Period",
        options=options,
        default=current,
        key=f"{key}_control",
        label_visibility="visible",
        selection_mode="single",
    )
    selected = selected or current
    st.session_state[key] = selected
    return "Week" if selected == "7 Days" else selected


def render_prediction_performance_tracker(rankings_by_category: dict[str,list[dict[str,Any]]]) -> None:
    _styles()
    st.subheader("📊 Prediction Performance")

    with st.expander("ⓘ How performance is measured", expanded=False):
        st.caption(
            "Frozen pregame predictions are compared with actual results. "
            "Batter markets show hit rate; pitcher markets measure projection accuracy."
        )

    token = _token()
    batter_history = {"days":{}}
    if token:
        try:
            batter_history = current_day_view(
                sync_history(token, rankings_by_category),
                rankings_by_category,
            )
        except Exception:
            st.caption("Performance history is temporarily unavailable.")
    else:
        st.caption("Performance history is temporarily unavailable.")

    batter_tab, pitcher_tab = st.tabs(["🥎 Batter", "⚾ Pitcher"])

    with batter_tab:
        st.markdown("#### 🌐 Overall MLB Batter Performance")
        period = _period_control("mlb_batter_performance_period")
        _render_overall(batter_history, period)

        tabs = st.tabs([BATTER_CATEGORY_CONFIG[k][0] for k in BATTER_CATEGORY_CONFIG])
        for tab, category in zip(tabs, BATTER_CATEGORY_CONFIG):
            with tab:
                _render_batter_market(batter_history, category, period)

        days = len(batter_history.get("days",{}))
        st.caption(f"Tracking history: {days} slate{'s' if days!=1 else ''}.")

    with pitcher_tab:
        st.markdown("#### 🌐 Overall MLB Pitcher Performance")
        period = _period_control("mlb_pitcher_performance_period")

        if not token:
            st.caption("Pitcher performance history is temporarily unavailable.")
            return

        try:
            result = get_pitcher_rankings(limit=25)
            rankings = result.get("rankings",{})
            history = current_pitcher_day_view(
                sync_pitcher_history(token, rankings),
                rankings,
            )
            tabs = st.tabs([PITCHER_CATEGORY_CONFIG[k][0] for k in PITCHER_CATEGORY_CONFIG])
            for tab, category in zip(tabs, PITCHER_CATEGORY_CONFIG):
                with tab:
                    _render_pitcher_market(history, category, period)
            days = len(history.get("days",{}))
            st.caption(f"Pitcher tracking history: {days} slate{'s' if days!=1 else ''}.")
        except Exception:
            st.caption("Pitcher performance history is temporarily unavailable.")

    st.markdown(
        """
        <style>
        /* Prediction Performance: visible controls, dark surfaces, no red. */
        div[data-testid="stSegmentedControl"]{
            margin:.12rem 0 .35rem!important;
        }
        div[data-testid="stSegmentedControl"] > div{
            width:100%!important;
            display:grid!important;
            grid-template-columns:repeat(5,minmax(0,1fr))!important;
            gap:4px!important;
        }
        div[data-testid="stSegmentedControl"] button{
            min-width:0!important;
            width:100%!important;
            min-height:34px!important;
            padding:.20rem .05rem!important;
            background:#080909!important;
            color:#fff!important;
            border:2px solid #34373c!important;
            border-radius:9px!important;
            font-size:.64rem!important;
            font-weight:850!important;
        }
        div[data-testid="stSegmentedControl"] button[aria-pressed="true"]{
            background:#11100c!important;
            color:#f6c84c!important;
            border-color:#d6b35c!important;
            box-shadow:inset 0 -2px 0 #d6b35c!important;
        }
        [data-testid="stTabs"] [data-baseweb="tab-highlight"],
        [data-baseweb="tab-highlight"]{
            background:#d6b35c!important;
            background-color:#d6b35c!important;
        }
        [data-testid="stTabs"] button[role="tab"][aria-selected="true"],
        button[data-baseweb="tab"][aria-selected="true"]{
            box-shadow:inset 0 -3px 0 #d6b35c!important;
            border-bottom-color:#d6b35c!important;
            color:#fff!important;
        }
        div[data-testid="stExpander"] summary{
            min-height:34px!important;
            padding:.20rem .45rem!important;
        }
        div[data-testid="stExpander"] [data-testid="stExpanderDetails"]{
            padding:.05rem .45rem .28rem!important;
        }
        @media(max-width:700px){
            div[data-testid="stSegmentedControl"] button{
                min-height:32px!important;
                font-size:.57rem!important;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
