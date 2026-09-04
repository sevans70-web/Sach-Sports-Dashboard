"""Platform player search. NFL is the first connected sport."""
from __future__ import annotations

import streamlit as st

from data.nfl_roster import load_nfl_roster

st.markdown(
    """
    <style>
    .block-container{max-width:850px;padding-top:.2rem!important}.search-hero{padding:14px 16px;border:1.5px solid rgba(214,179,92,.62);border-left:4px solid #19d978;border-radius:13px;background:#0d0f10;margin:5px 0 12px}.search-hero h1{margin:0;color:#fff;font-size:1.4rem}.search-hero p{margin:5px 0 0;color:#a7abb2;font-size:.78rem}.search-result{padding:10px;border:1px solid #30343a;border-radius:10px;background:#101112;color:#fff;margin:7px 0}.search-result b{color:#f6c84c}
    </style>
    """,
    unsafe_allow_html=True,
)

if st.button("← Back"):
    st.switch_page("pages/nfl.py")

st.markdown('<div class="search-hero"><h1>🔎 Player Search</h1><p>Search by player name — no team knowledge required. NFL is connected first; the same search will expand across the platform as each sport is finalized.</p></div>', unsafe_allow_html=True)

query = st.text_input("", placeholder="Search player name…", key="platform_player_search")
if len(query.strip()) < 2:
    st.stop()

try:
    roster = load_nfl_roster(2026)
except Exception:
    st.error("NFL player search is temporarily unavailable.")
    st.stop()

mask = roster["player_name"].astype(str).str.contains(query.strip(), case=False, na=False)
results = roster[mask].head(20).copy()
if results.empty:
    st.info("No NFL player matched that search.")
    st.stop()

labels = [f"{row.player_name} · {row.team} · {row.position}" for row in results.itertuples()]
choice = st.selectbox("Matches", labels, key="platform_search_match")
row = results.iloc[labels.index(choice)].to_dict()
st.markdown(f'<div class="search-result"><b>{row.get("player_name","")}</b><br>{row.get("team","")} · {row.get("position","")}</div>', unsafe_allow_html=True)
if st.button("Open player card", use_container_width=True):
    st.session_state["nfl_selected_player"] = row
    st.switch_page("pages/nfl_player.py")
