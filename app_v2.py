import streamlit as st

st.set_page_config(
    page_title="Game Intelligence",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="expanded",
)

pages = {
    "Game Intelligence": [
        st.Page("pages/home.py", title="Home", icon="🏠", default=True),
        st.Page("pages/mlb.py", title="MLB", icon="⚾"),
        st.Page("pages/nfl.py", title="NFL", icon="🏈"),
        st.Page("pages/nba.py", title="NBA", icon="🏀"),
        st.Page("pages/nhl.py", title="NHL", icon="🏒"),
        st.Page("pages/soccer.py", title="Soccer", icon="⚽"),
    ]
}

navigation = st.navigation(pages)
navigation.run()

