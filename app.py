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

    /* Hide Streamlit chrome; keep only our custom Sport Hub button. */
    header[data-testid="stHeader"],
    [data-testid="stHeader"],
    [data-testid="stToolbar"],
    [data-testid="stToolbarActions"],
    [data-testid="stHeaderActionElements"],
    [data-testid="stMainMenu"],
    [data-testid="stAppDeployButton"],
    [data-testid="stAppDeployButtonContainer"],
    [data-testid="stStatusWidget"],
    [data-testid="stDecoration"],
    .stAppDeployButton,
    #MainMenu,
    footer {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
    }

    /* Prevent hidden Streamlit chrome from reserving vertical space. */
    [data-testid="stAppViewContainer"] > .main,
    [data-testid="stMain"] {
        padding-top: 0 !important;
        margin-top: 0 !important;
    }

    [data-testid="stSidebar"],
    [data-testid="collapsedControl"] {
        display: none !important;
    }

    .block-container {
        padding-top: .55rem !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        overflow-x: hidden !important;
    }

    [data-testid="stMainBlockContainer"] {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
        overflow-x: hidden !important;
    }

    [data-testid="stPopover"],
    [data-testid="stMainBlockContainer"] > div {
        transition: none !important;
        animation: none !important;
    }

    /* Community Cloud can keep a host-level owner strip visible.
       On phones, reserve only enough room for our custom Sport Hub row
       so it cannot be covered by that host chrome. */
    @media (max-width: 700px) {
        .block-container {
            padding-top: 3.15rem !important;
        }
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

    div[data-testid="stPopover"] {
        position: relative !important;
        z-index: 10000 !important;
        visibility: visible !important;
        opacity: 1 !important;
    }

    div[data-testid="stPopover"] > button,
    div[data-testid="stPopover"] button {
        background: #090a0b !important;
        color: #ffffff !important;
        border: 1px solid rgba(25, 217, 120, .72) !important;
        border-radius: 11px !important;
        min-height: 38px !important;
        width: 42px !important;
        min-width: 42px !important;
        padding: 0 !important;
        font-size: 1.18rem !important;
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
        div[data-testid="stPopover"] {
            margin-top: 2px !important;
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
    "Sports": [
        st.Page("pages/home.py", title="HOME", icon="🏠", default=True),
        st.Page("pages/mlb.py", title="MLB", icon="⚾"),
        # Internal MLB drill-down pages. They are registered so st.switch_page
        # works, but the custom Sport Hub does not expose them as top-level sports.
        st.Page("pages/mlb_games.py", title="MLB GAMES", icon="⚾"),
        st.Page("pages/mlb_game.py", title="MLB GAME", icon="⚾"),
        st.Page("pages/mlb_player.py", title="MLB PLAYER", icon="⚾"),
        st.Page("pages/wnba.py", title="WNBA", icon="🏀"),
        st.Page("pages/soccer.py", title="SOCCER", icon="⚽"),
        st.Page("pages/nfl.py", title="NFL", icon="🏈"),
        st.Page("pages/cfb.py", title="CFB", icon="🏈"),
        st.Page("pages/nba.py", title="NBA", icon="🏀"),
        st.Page("pages/nhl.py", title="NHL", icon="🏒"),
    ]
}

# Register all pages before rendering custom page links.
navigation = st.navigation(pages, position="hidden")

# Compact square-grid Sport Hub in the upper-left.
# Render directly instead of inside temporary columns so it does not shift
# or disappear while the page is hydrating.
with st.popover("▦", use_container_width=False):
    st.markdown("**SPORT HUB**")
    left, right = st.columns(2)
    with left:
        st.page_link("pages/home.py", label="HOME", icon="🏠")
        st.page_link("pages/mlb.py", label="MLB", icon="⚾")
        st.page_link("pages/wnba.py", label="WNBA", icon="🏀")
        st.page_link("pages/soccer.py", label="SOCCER", icon="⚽")
    with right:
        st.page_link("pages/nfl.py", label="NFL", icon="🏈")
        st.page_link("pages/cfb.py", label="CFB", icon="🏈")
        st.page_link("pages/nba.py", label="NBA", icon="🏀")
        st.page_link("pages/nhl.py", label="NHL", icon="🏒")

navigation.run()

st.markdown(
    """
<style>
@media (max-width:700px){
  html, body, .stApp, [data-testid="stAppViewContainer"] { font-size: 17px !important; }
  p, li, label, [data-testid="stMarkdownContainer"] p { font-size: .94rem; line-height: 1.42; }
  [data-testid="stCaptionContainer"], small { font-size: .78rem !important; }
}
</style>
    """,
    unsafe_allow_html=True,
)
