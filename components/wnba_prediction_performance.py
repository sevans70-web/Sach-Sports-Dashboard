"""Mobile-first overall WNBA Prediction Performance UI."""
from __future__ import annotations

from html import escape

import streamlit as st

from data.wnba_prediction_performance import (
    load_history,
    normalized_result,
    records_for_period,
    summarize,
)

PERIODS = ["Today", "Yesterday", "7 Days", "Month", "Season"]
RESULT_MARK = {"HIT": "✅", "MISS": "❌", "PUSH": "➖", "PENDING": "⏳"}


def _period() -> str:
    current = st.session_state.get("wnba_performance_period", "Today")
    if current not in PERIODS:
        current = "Today"
    return st.segmented_control(
        "Performance Period",
        PERIODS,
        default=current,
        key="wnba_performance_period",
        width="stretch",
    ) or current


def _prediction_text(row: dict) -> str:
    player = escape(str(row.get("player_name") or row.get("player") or "Player"))
    market = escape(str(row.get("market") or row.get("prop") or "Prop"))
    direction = escape(str(row.get("direction") or row.get("pick") or "").strip())
    line = row.get("line")
    line_text = "" if line in (None, "") else f" {escape(str(line))}"
    pick = f"{direction}{line_text}".strip()
    if pick:
        return f"{player} · {market} · {pick}"
    return f"{player} · {market}"


def _actual_text(row: dict) -> str:
    actual = row.get("actual")
    if actual in (None, ""):
        actual = row.get("actual_value")
    return "" if actual in (None, "") else f" · Actual {escape(str(actual))}"


def render_wnba_prediction_performance() -> None:
    st.markdown(
        """
        <style>
        .wnba-performance-heading{margin:4px 0 2px;color:#fff;font-size:1.22rem;font-weight:950;line-height:1.15}
        .wnba-performance-copy{color:#a9adb2;font-size:.78rem;line-height:1.38;margin:0 0 8px}
        .wnba-performance-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:8px 0 6px}
        .wnba-performance-metric{min-width:0;min-height:72px;background:#101112;border:2px solid #34383d;border-radius:12px;padding:8px 6px;display:flex;flex-direction:column;justify-content:center}
        .wnba-performance-metric:first-child{border-color:rgba(25,217,120,.80)}
        .wnba-performance-metric:nth-child(3){border-color:rgba(214,179,92,.80)}
        .wnba-performance-metric span{display:block;color:#a7abb2;font-size:.57rem;line-height:1.18;white-space:normal}
        .wnba-performance-metric strong{display:block;color:#fff;font-size:.90rem;line-height:1.05;margin-top:4px;font-weight:900}
        .wnba-performance-record{margin:6px 0 0;color:#d9dcdf;font-size:.72rem}
        .wnba-result-row{background:#101112;border:1px solid #34383d;border-left:4px solid #19d978;border-radius:10px;padding:9px 10px;margin:6px 0;color:#fff;font-size:.76rem;line-height:1.35}
        .wnba-result-row small{display:block;color:#9ea3aa;font-size:.66rem;margin-top:3px}
        div[class*="st-key-wnba_performance_period"] [role="radiogroup"]{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;width:100%!important;gap:0!important}
        div[class*="st-key-wnba_performance_period"] button{width:100%!important;min-width:0!important;padding-left:.20rem!important;padding-right:.20rem!important}
        div[class*="st-key-wnba_performance_period"] button p{font-size:.74rem!important;white-space:nowrap!important}
        div[class*="st-key-wnba_performance_period"] button[aria-pressed="true"],
        div[class*="st-key-wnba_performance_period"] button[aria-pressed="true"] p{color:#19d978!important;border-color:#19d978!important;background:#0b1711!important}
        @media(max-width:700px){
          .wnba-performance-grid{gap:4px}.wnba-performance-metric{min-height:67px;padding:7px 4px}.wnba-performance-metric span{font-size:.52rem}.wnba-performance-metric strong{font-size:.80rem}
          div[class*="st-key-wnba_performance_period"] button p{font-size:.62rem!important}
        }
        </style>
        <div class="wnba-performance-heading">📈 Prediction Performance</div>
        <div class="wnba-performance-copy">Overall WNBA dashboard performance. Every saved player-prop prediction is graded like a bet: HIT, MISS or PUSH.</div>
        """,
        unsafe_allow_html=True,
    )

    period = _period()
    rows = records_for_period(load_history(), period)
    result = summarize(rows)
    rate = f"{result['hit_rate']:.1f}%" if (result["hits"] + result["misses"]) else "—"

    st.markdown(
        '<div class="wnba-performance-grid">'
        f'<div class="wnba-performance-metric"><span>Hits / Predictions</span><strong>{result["hits"]} / {result["predictions"]}</strong></div>'
        f'<div class="wnba-performance-metric"><span>Pending</span><strong>{result["pending"]}</strong></div>'
        f'<div class="wnba-performance-metric"><span>Graded</span><strong>{result["graded"]}</strong></div>'
        f'<div class="wnba-performance-metric"><span>Hit Rate</span><strong>{rate}</strong></div>'
        '</div>',
        unsafe_allow_html=True,
    )

    st.markdown(
        f'<div class="wnba-performance-record">Record: <strong>{result["hits"]}-{result["misses"]}</strong>'
        f' · Pushes: <strong>{result["pushes"]}</strong> · Period: <strong>{escape(period)}</strong></div>',
        unsafe_allow_html=True,
    )

    if not rows:
        st.info("No WNBA prop predictions have been recorded for this performance period yet.")
        return

    st.markdown("#### Prediction Results")
    for row in reversed(rows):
        status = normalized_result(row)
        date_text = escape(str(row.get("date") or ""))
        st.markdown(
            f'<div class="wnba-result-row">{RESULT_MARK[status]} <strong>{status}</strong> · {_prediction_text(row)}'
            f'<small>{date_text}{_actual_text(row)}</small></div>',
            unsafe_allow_html=True,
        )
