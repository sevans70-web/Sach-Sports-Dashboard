import streamlit as st

from engines.player_intelligence import get_player_profile

st.set_page_config(
    page_title="Player Intelligence",
    page_icon="⚾",
    layout="wide",
)

st.title("⚾ Player Intelligence")

player = get_player_profile(660271)
st.write(player)
