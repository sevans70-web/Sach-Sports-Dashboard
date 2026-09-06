"""Dedicated MLB slate page."""

import streamlit as st

from components.mlb_schedule import render_live_mlb_schedule


st.markdown(
    """
    <style>
    .mlb-slate-page-head{
        margin:4px 0 10px;
        padding:11px 12px;
        border-radius:13px;
        border:1.5px solid rgba(25,217,120,.58);
        background:linear-gradient(115deg,#101112,#111315 68%,rgba(246,200,76,.07));
    }
    .mlb-slate-page-head h2{
        margin:0;color:#fff;font-size:1.25rem;font-weight:950;
    }
    .mlb-slate-page-head p{
        margin:4px 0 0;color:#a7abb2;font-size:.74rem;line-height:1.3;
    }
    div[class*="st-key-back_to_mlb_from_slate"] button{
      background:#080909!important;color:#fff!important;border:1.5px solid #34373c!important;
      border-radius:10px!important;min-height:38px!important;font-weight:800!important;
    }
    div[class*="st-key-back_to_mlb_from_slate"]{
      position:absolute!important;top:14px!important;right:0!important;width:auto!important;
      margin:0!important;z-index:20!important;
    }
    div[class*="st-key-back_to_mlb_from_slate"] button:hover{
      border-color:#d6b35c!important;color:#f6c84c!important;
    }
    @media(max-width:700px){
      div[class*="st-key-back_to_mlb_from_slate"]{top:1.20rem!important;right:0!important;margin:0!important}
      .mlb-slate-page-head{margin-top:.2rem!important}
    }
    </style>
    """,
    unsafe_allow_html=True,
)

if st.button("← Back to MLB", key="back_to_mlb_from_slate"):
    st.switch_page("pages/mlb.py")

st.markdown(
    """
    <div class="mlb-slate-page-head">
        <h2>⚾ Today's MLB Games</h2>
        <p>Choose a matchup to open Game Intelligence, lineups and roster details.</p>
    </div>
    """,
    unsafe_allow_html=True,
)

player_lookup = st.session_state.get("mlb_ranked_player_lookup", {}) or {}
render_live_mlb_schedule(player_lookup=player_lookup)
