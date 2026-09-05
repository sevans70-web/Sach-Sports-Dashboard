"""Compact, market-specific NFL prediction performance."""
from __future__ import annotations

from html import escape

import streamlit as st

from data.nfl_prediction_performance import load_history, records_for_period, summarize

MARKETS = {
    "Passing Yards": "🏈", "Passing TDs": "🎯", "Pass + Rush Yards": "⚡", "Interceptions": "🚫",
    "Anytime TD": "🔥", "First TD": "1️⃣", "Receiving Yards": "🙌", "Receptions": "🧤",
    "Rushing Yards": "🏃", "Rush + Receiving Yards": "🔀", "Sacks": "💥",
    "Tackles": "🛡️", "Tackles + Assists": "🤝",
}


def _period() -> str:
    options = ["Week", "Month", "Season"]
    current = st.session_state.get("nfl_performance_period", "Week")
    if current not in options:
        current = "Week"
    return st.segmented_control(
        "Performance period", options, default=current,
        key="nfl_performance_period", label_visibility="collapsed",
    ) or current


def _render_market(history: dict, market: str, period: str) -> None:
    rows = records_for_period(history, market, period)
    result = summarize(rows)
    rate = f"{result['hit_rate']:.1f}%" if result["settled"] else "—"
    st.markdown(
        '<div class="nfl-performance-grid">'
        f'<div class="nfl-performance-metric"><span>RECORD</span><strong>{result["wins"]}-{result["losses"]}</strong></div>'
        f'<div class="nfl-performance-metric"><span>SETTLED</span><strong>{result["settled"]}</strong></div>'
        f'<div class="nfl-performance-metric"><span>HIT RATE</span><strong>{rate}</strong></div>'
        f'<div class="nfl-performance-metric"><span>PENDING</span><strong>{result["pending"]}</strong></div>'
        '</div>', unsafe_allow_html=True,
    )
    if result["settled"]:
        tiers = result["tiers"]
        st.caption(
            f"Top 5: {tiers['top_5']['rate']:.1f}% · #6–10: {tiers['six_to_ten']['rate']:.1f}% · "
            f"#11–25: {tiers['eleven_to_25']['rate']:.1f}%"
        )
        with st.expander(f"Graded {market} results", expanded=False):
            for row in reversed(rows):
                correct = row.get("correct")
                if not isinstance(correct, bool):
                    continue
                mark = "✅" if correct else "❌"
                name = escape(str(row.get("player_name") or row.get("player") or "Player"))
                st.markdown(f"{mark} {row.get('date') or ''} · #{int(row.get('rank') or 0)} {name}")
    else:
        st.caption(f"{market} results will appear here after completed games are graded.")


def render_nfl_prediction_performance() -> None:
    st.markdown(
        """
        <style>
        .nfl-performance-title{margin:19px 0 4px;color:#fff;font-size:1.10rem;font-weight:950}
        .nfl-performance-copy{color:#a7abb2;font-size:.74rem;line-height:1.38;margin-bottom:7px}
        .nfl-performance-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:4px 0 3px}
        .nfl-performance-metric{min-width:0;background:#0d0f10;border:1px solid #30343a;border-bottom:2px solid #d6b35c;border-radius:9px;padding:7px 5px}
        .nfl-performance-metric span{display:block;color:#969ba2;font-size:.50rem;white-space:nowrap}.nfl-performance-metric strong{display:block;color:#fff;font-size:.82rem;margin-top:3px}
        div[class*="st-key-nfl_performance_markets"]{border:1.5px solid #34373c!important;border-left:4px solid #19d978!important;border-radius:12px!important;background:#101112!important;padding:8px!important}
        div[class*="st-key-nfl_performance_period"] [role="radiogroup"]{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;width:100%!important;gap:0!important}
        div[class*="st-key-nfl_performance_period"] button{width:100%!important;min-width:0!important}
        div[class*="st-key-nfl_performance_period"] button[aria-pressed="true"],div[class*="st-key-nfl_performance_period"] button[aria-pressed="true"] p{color:#19d978!important;border-color:#19d978!important;background:#0b1711!important}
        @media(max-width:700px){.nfl-performance-title{margin-top:16px}.nfl-performance-copy{font-size:.70rem}.nfl-performance-metric strong{font-size:.78rem}}
        </style>
        <div class="nfl-performance-title">📈 Prediction Performance</div>
        <div class="nfl-performance-copy">Each market is tracked separately, with results added after completed games are graded.</div>
        """, unsafe_allow_html=True,
    )
    history = load_history()
    period = _period()
    with st.container(border=True, key="nfl_performance_markets"):
        tabs = st.tabs([f"{icon} {market}" for market, icon in MARKETS.items()])
        for tab, market in zip(tabs, MARKETS):
            with tab:
                _render_market(history, market, period)
