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
    "earned_runs":("● Earned Runs","ER"),
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

@st.cache_data(ttl=300, show_spinner=False)
def _cached_batter_history(_token_value: str, rankings_by_category: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    """Avoid re-reading/re-grading performance history on every UI click."""
    synced = sync_history(_token_value, rankings_by_category)
    return current_day_view(synced, rankings_by_category)


@st.cache_data(ttl=300, show_spinner=False)
def _cached_pitcher_rankings() -> dict[str, Any]:
    """Reuse pitcher rankings while the user interacts with the MLB page."""
    return get_pitcher_rankings(limit=25)


@st.cache_data(ttl=300, show_spinner=False)
def _cached_pitcher_history(_token_value: str, rankings: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    synced = sync_pitcher_history(_token_value, rankings)
    return current_pitcher_day_view(synced, rankings)


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
    .perf-summary-row.perf-batter-four{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:5px!important;}
    .perf-summary-item,.perf-kpi{
      min-width:0!important;min-height:86px!important;padding:8px!important;border-radius:11px!important;
      background:#101112!important;border:2px solid #34373c!important;display:flex!important;flex-direction:column!important;justify-content:center!important
    }
    .perf-summary-item:first-child,.perf-kpi:nth-child(1){border-color:rgba(25,217,120,.78)!important}
    .perf-summary-item:nth-child(3),.perf-kpi:nth-child(3){border-color:rgba(255,204,51,.72)!important}
    .perf-label,.perf-summary-item span,.perf-kpi span,.perf-kpi small{color:#a7abb2!important;font-size:.66rem!important;line-height:1.15!important}
    .perf-summary-item strong,.perf-kpi strong{color:#fff!important;font-size:1.04rem!important;line-height:1.05!important;margin:3px 0!important}
    @media(max-width:700px){
      .perf-summary-row,.perf-kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important}
      .perf-summary-row.perf-batter-four{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:4px!important}
      .perf-summary-item,.perf-kpi{min-height:74px!important;padding:7px 6px!important}
      .perf-summary-row.perf-batter-four .perf-summary-item{min-height:68px!important;padding:6px 4px!important}
      .perf-summary-row.perf-batter-four .perf-label{font-size:.56rem!important;line-height:1.08!important}
      .perf-summary-row.perf-batter-four .perf-summary-item strong{font-size:.84rem!important}
      .perf-summary-item strong,.perf-kpi strong{font-size:.96rem!important}
      div[class*="st-key-mlb_performance_period_control"] [data-testid="stHorizontalBlock"]{
        flex-wrap:nowrap!important;gap:0!important;overflow-x:auto!important;scrollbar-width:none!important
      }
      div[class*="st-key-mlb_performance_period_control"] [data-testid="stHorizontalBlock"]::-webkit-scrollbar{display:none!important}
      div[class*="st-key-mlb_performance_period_control"] [data-testid="stColumn"]{
        flex:1 1 20%!important;min-width:0!important;max-width:20%!important
      }
      div[class*="st-key-mlb_performance_period_control"] button{
        width:100%!important;min-width:0!important;padding-left:3px!important;padding-right:3px!important;
        font-size:.61rem!important;min-height:34px!important;white-space:nowrap!important
      }
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
        f"<div class='perf-summary-row perf-batter-four'>"
        f"<div class='perf-summary-item'><span class='perf-label'>Hits / Predictions</span><strong>{summary['wins']} / {total}</strong></div>"
        f"<div class='perf-summary-item'><span class='perf-label'>Pending</span><strong>{summary['pending']}</strong></div>"
        f"<div class='perf-summary-item'><span class='perf-label'>Settled</span><strong>{summary['graded']}</strong></div>"
        f"<div class='perf-summary-item'><span class='perf-label'>Hit Rate</span><strong>{summary['hit_rate']:.1f}%</strong></div>"
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
    """
    Compact five-choice period selector.

    "7 Days" is a true rolling seven-day window, not "week to date".
    """
    options = ["Today", "Yesterday", "7 Days", "Month", "Season"]
    current = st.session_state.get(key, "Today")
    if current not in options:
        current = "Today"

    selected = st.segmented_control(
        "Performance Period",
        options=options,
        default=current,
        key=f"{key}_control",
        selection_mode="single",
    )
    selected = selected or current
    st.session_state[key] = selected
    return selected


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
            batter_history = _cached_batter_history(token, rankings_by_category)
        except Exception:
            st.caption("Performance history is temporarily unavailable.")
    else:
        st.caption("Performance history is temporarily unavailable.")

    batter_tab, pitcher_tab = st.tabs(["🥎 Batter", "⚾ Pitcher"])

    with batter_tab:
        st.markdown("#### 🌐 Overall MLB Batter Performance")
        period = _period_control("mlb_batter_performance_period")
        tabs = st.tabs([BATTER_CATEGORY_CONFIG[k][0] for k in BATTER_CATEGORY_CONFIG])
        for tab, category in zip(tabs, BATTER_CATEGORY_CONFIG):
            with tab:
                _render_batter_market(batter_history, category, period)

    with pitcher_tab:
        st.markdown("#### 🌐 Overall MLB Pitcher Performance")
        period = _period_control("mlb_pitcher_performance_period")

        if not token:
            st.caption("Pitcher performance history is temporarily unavailable.")
            return

        try:
            result = _cached_pitcher_rankings()
            rankings = result.get("rankings",{})
            history = _cached_pitcher_history(token, rankings)
            tabs = st.tabs([PITCHER_CATEGORY_CONFIG[k][0] for k in PITCHER_CATEGORY_CONFIG])
            for tab, category in zip(tabs, PITCHER_CATEGORY_CONFIG):
                with tab:
                    _render_pitcher_market(history, category, period)
        except Exception:
            st.caption("Pitcher performance history is temporarily unavailable.")

    st.markdown(
        """
        <style>
        /* Compact period selector: one clean row, not a 3+2 button block. */
        div[data-testid="stSegmentedControl"]{
            margin:.10rem 0 .38rem!important;
        }
        div[data-testid="stSegmentedControl"] > div{
            width:100%!important;
            display:flex!important;
            flex-wrap:nowrap!important;
            gap:3px!important;
        }
        div[data-testid="stSegmentedControl"] button{
            flex:1 1 0!important;
            min-width:0!important;
            width:auto!important;
            min-height:30px!important;
            padding:.14rem .08rem!important;
            background:#080909!important;
            color:#fff!important;
            border:1px solid #34373c!important;
            border-radius:7px!important;
            font-size:.62rem!important;
            font-weight:800!important;
            white-space:nowrap!important;
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
            div[data-testid="stSegmentedControl"],
            div[data-testid="stSegmentedControl"] > div,
            div[data-testid="stSegmentedControl"] [role="radiogroup"]{
                width:100%!important;
                max-width:100%!important;
                display:flex!important;
                flex-direction:row!important;
                flex-wrap:nowrap!important;
                gap:0!important;
                overflow:visible!important;
            }
            div[data-testid="stSegmentedControl"] > div > *,
            div[data-testid="stSegmentedControl"] [role="radiogroup"] > *{
                flex:1 1 20%!important;
                width:20%!important;
                min-width:0!important;
                max-width:20%!important;
            }
            div[data-testid="stSegmentedControl"] button{
                flex:1 1 20%!important;
                width:100%!important;
                min-width:0!important;
                max-width:none!important;
                min-height:29px!important;
                font-size:.52rem!important;
                padding:.12rem .01rem!important;
                white-space:nowrap!important;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )



# MLB PERFORMANCE CLOSEOUT:
# Keep Today / Yesterday / 7 Days / Month / Season on one mobile row.
st.markdown(
    """
    <style>
    @media(max-width:700px){
        div[data-testid="stSegmentedControl"]{
            width:100%!important;
            max-width:100%!important;
            overflow:hidden!important;
        }

        div[data-testid="stSegmentedControl"] > div,
        div[data-testid="stSegmentedControl"] [role="radiogroup"]{
            display:flex!important;
            flex-direction:row!important;
            flex-wrap:nowrap!important;
            width:100%!important;
            max-width:100%!important;
            gap:0!important;
        }

        div[data-testid="stSegmentedControl"] button{
            flex:1 1 20%!important;
            width:20%!important;
            min-width:0!important;
            max-width:20%!important;
            min-height:34px!important;
            padding:.15rem .08rem!important;
            font-size:.56rem!important;
            line-height:1!important;
            white-space:nowrap!important;
            overflow:hidden!important;
            text-overflow:clip!important;
        }

        div[data-testid="stSegmentedControl"] button p{
            font-size:.56rem!important;
            line-height:1!important;
            white-space:nowrap!important;
        }
    }
    </style>
    """,
    unsafe_allow_html=True,
)
