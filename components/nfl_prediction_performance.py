"""NFL prediction-performance presentation foundation."""
from __future__ import annotations

import streamlit as st


def render_nfl_prediction_performance() -> None:
    st.markdown("### 📈 Prediction Performance")
    st.caption("NFL predictions are graded only after a pregame ranking has been frozen and the game is final.")
    with st.container(border=True):
        c1, c2, c3 = st.columns(3)
        c1.metric("Settled", "0")
        c2.metric("Hit rate", "—")
        c3.metric("Tracked markets", "11")
        st.info("Week 1 will create the first frozen NFL prediction set. Results will populate here as those games settle.")
