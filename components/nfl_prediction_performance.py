"""NFL prediction-performance presentation foundation."""
from __future__ import annotations

import streamlit as st


def render_nfl_prediction_performance() -> None:
    st.markdown("""
    <style>
    .nfl-performance-title{margin:20px 0 4px;color:#fff;font-size:1.08rem;font-weight:950}
    .nfl-performance-copy{color:#a7abb2;font-size:.75rem;line-height:1.4;margin-bottom:8px}
    .nfl-performance-card{border:1.5px solid #34373c;border-left:4px solid #19d978;border-radius:12px;background:#101112;padding:10px}
    .nfl-performance-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
    .nfl-performance-metric{background:#0d0f10;border:1px solid #30343a;border-bottom:2px solid #d6b35c;border-radius:9px;padding:8px}
    .nfl-performance-metric span{display:block;color:#969ba2;font-size:.58rem}.nfl-performance-metric strong{display:block;color:#fff;font-size:.90rem;margin-top:3px}
    .nfl-performance-note{color:#c9cdd1;font-size:.70rem;line-height:1.4;margin-top:8px}
    </style>
    <div class="nfl-performance-title">📈 Prediction Performance</div>
    <div class="nfl-performance-copy">Predictions are graded after the pregame ranking is frozen and the game is final.</div>
    <div class="nfl-performance-card"><div class="nfl-performance-grid">
      <div class="nfl-performance-metric"><span>SETTLED</span><strong>0</strong></div>
      <div class="nfl-performance-metric"><span>HIT RATE</span><strong>—</strong></div>
      <div class="nfl-performance-metric"><span>MARKETS</span><strong>13</strong></div>
    </div><div class="nfl-performance-note">Week 1 will create the first frozen prediction set. Results will populate as games settle.</div></div>
    """, unsafe_allow_html=True)
