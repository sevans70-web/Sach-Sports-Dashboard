import streamlit as st

st.set_page_config(
    page_title="Game Intelligence",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Platform shell: true-black canvas, custom sport hub, no Streamlit chrome.
st.markdown(
    """
    <style>
    :root {
        --ssd-black: #000000;
        --ssd-panel: #101112;
        --ssd-panel-2: #151617;
        --ssd-white: #ffffff;
        --ssd-muted: #a7abb2;
        --ssd-emerald: #19d978;
        --ssd-emerald-deep: #0ea85b;
        --ssd-gold: #f6c84c;
        --ssd-line: #2a2d31;
    }

    html, body, [data-testid="stAppViewContainer"], .stApp {
        background: var(--ssd-black) !important;
        color: var(--ssd-white) !important;
    }

    [data-testid="stHeader"],
    [data-testid="stToolbar"],
    #MainMenu,
    footer,
    [data-testid="stDecoration"],
    [data-testid="stStatusWidget"] {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
    }

    [data-testid="stSidebar"],
    [data-testid="collapsedControl"] {
        display: none !important;
    }

    .block-container {
        padding-top: .55rem !important;
    }

    .ssd-shell {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 38px;
        margin: 0 0 8px;
    }
    .ssd-shell-brand {
        color: #ffffff;
        font-size: .78rem;
        font-weight: 900;
        letter-spacing: .14em;
        text-transform: uppercase;
    }

    div[data-testid="stPopover"] > button,
    div[data-testid="stPopover"] button {
        background: #090a0b !important;
        color: #ffffff !important;
        border: 1px solid rgba(25, 217, 120, .72) !important;
        border-radius: 11px !important;
        min-height: 38px !important;
        font-weight: 900 !important;
        box-shadow: 0 0 0 1px rgba(246, 200, 76, .10), 0 0 18px rgba(25, 217, 120, .08);
    }

    div[data-testid="stPopoverBody"] {
        background: #070809 !important;
        border: 1px solid #2c3034 !important;
    }

    div[data-testid="stPageLink"] a {
        background: #101112 !important;
        border: 1px solid #2a2d31 !important;
        border-radius: 12px !important;
        color: #ffffff !important;
        min-height: 56px;
        font-weight: 800;
    }
    div[data-testid="stPageLink"] a:hover {
        border-color: #19d978 !important;
        box-shadow: inset 0 0 0 1px rgba(25, 217, 120, .25);
    }

    @media (max-width: 700px) {
        .block-container {
            padding-left: .78rem !important;
            padding-right: .78rem !important;
            padding-top: .35rem !important;
        }
        .ssd-shell {
            min-height: 36px;
            margin-bottom: 5px;
        }
        .ssd-shell-brand {
            font-size: .68rem;
        }
    }
    </style>
    """,
    unsafe_allow_html=True,
)

pages = {
    "Game Intelligence": [
        st.Page("pages/home.py", title="Home", icon="🏠", default=True),
        st.Page("pages/mlb.py", title="MLB", icon="⚾"),
        st.Page("pages/nfl.py", title="NFL", icon="🏈"),
        st.Page("pages/cfb.py", title="College Football", icon="🏈"),
        st.Page("pages/nba.py", title="NBA", icon="🏀"),
        st.Page("pages/wnba.py", title="WNBA", icon="🏀"),
        st.Page("pages/nhl.py", title="NHL", icon="🏒"),
        st.Page("pages/soccer.py", title="Soccer", icon="⚽"),
    ]
}

# Custom square-grid Sport Hub replaces the old >> / sidebar control.
nav_col, brand_col = st.columns([1, 8], vertical_alignment="center")
with nav_col:
    with st.popover("▦", use_container_width=True):
        st.markdown("**SPORT HUB**")
        left, right = st.columns(2)
        with left:
            st.page_link("pages/home.py", label="Home", icon="🏠")
            st.page_link("pages/mlb.py", label="MLB", icon="⚾")
            st.page_link("pages/cfb.py", label="CFB", icon="🏈")
            st.page_link("pages/wnba.py", label="WNBA", icon="🏀")
        with right:
            st.page_link("pages/nfl.py", label="NFL", icon="🏈")
            st.page_link("pages/nba.py", label="NBA", icon="🏀")
            st.page_link("pages/nhl.py", label="NHL", icon="🏒")
            st.page_link("pages/soccer.py", label="Soccer", icon="⚽")
with brand_col:
    st.markdown('<div class="ssd-shell"><div class="ssd-shell-brand">Game Intelligence</div></div>', unsafe_allow_html=True)

navigation = st.navigation(pages, position="hidden")
navigation.run()
