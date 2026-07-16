import streamlit as st
from datetime import datetime
from zoneinfo import ZoneInfo


def get_greeting() -> str:
    """Return a time-based greeting using Toronto time."""
    hour = datetime.now(ZoneInfo("America/Toronto")).hour

    if hour < 12:
        return "Good morning"
    if hour < 18:
        return "Good afternoon"
    return "Good evening"


def render_sport_card(
    icon: str,
    sport: str,
    status: str,
    description: str,
    page_path: str,
) -> None:
    """Render one clickable sport card."""
    with st.container(border=True):
        st.markdown(f"### {icon} {sport}")
        st.caption(status)
        st.write(description)
        st.page_link(
            page_path,
            label=f"Open {sport}",
            icon="➡️",
            use_container_width=True,
        )


# --------------------------------------------------
# HOME PAGE THEME
# --------------------------------------------------

st.markdown(
    """
    <style>
        .stApp {
            background:
                radial-gradient(
                    circle at 50% -10%,
                    rgba(56, 189, 248, 0.18),
                    transparent 34%
                ),
                linear-gradient(
                    180deg,
                    #06111f 0%,
                    #0b1e35 45%,
                    #102b46 100%
                );
            color: #f8fafc;
        }

        [data-testid="stSidebar"] {
            background: #030b16;
            border-right: 1px solid rgba(56, 189, 248, 0.20);
        }

        [data-testid="stSidebarNav"] span,
        [data-testid="stSidebarNav"] a {
            color: #e2e8f0;
        }

        h1, h2, h3 {
            color: #f8fafc;
            letter-spacing: -0.025em;
        }

        p, span, div {
            color: #cbd5e1;
        }

        .gi-hero {
            padding: 38px 34px;
            border-radius: 24px;
            background:
                radial-gradient(
                    circle at 80% 20%,
                    rgba(56, 189, 248, 0.22),
                    transparent 28%
                ),
                linear-gradient(
                    135deg,
                    rgba(7, 26, 47, 0.98),
                    rgba(11, 42, 74, 0.96)
                );
            border: 1px solid rgba(56, 189, 248, 0.36);
            box-shadow: 0 20px 55px rgba(2, 8, 23, 0.36);
            margin-bottom: 24px;
        }

        .gi-brain {
            font-size: 66px;
            line-height: 1;
            margin-bottom: 14px;
        }

        .gi-eyebrow {
            color: #38bdf8;
            font-size: 0.82rem;
            font-weight: 800;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            margin-bottom: 8px;
        }

        .gi-title {
            color: #ffffff;
            font-size: clamp(2.2rem, 5vw, 4.4rem);
            font-weight: 900;
            line-height: 0.98;
            margin: 0;
        }

        .gi-subtitle {
            color: #bae6fd;
            max-width: 780px;
            font-size: 1.08rem;
            line-height: 1.65;
            margin-top: 18px;
            margin-bottom: 0;
        }

        .gi-strip {
            padding: 16px 20px;
            border-radius: 16px;
            background: rgba(15, 23, 42, 0.70);
            border: 1px solid rgba(148, 163, 184, 0.18);
            margin: 10px 0 26px 0;
        }

        .gi-strip strong {
            color: #ffffff;
        }

        div[data-testid="stMetric"] {
            background: rgba(15, 23, 42, 0.78);
            border: 1px solid rgba(56, 189, 248, 0.22);
            border-radius: 18px;
            padding: 18px;
            box-shadow: 0 12px 30px rgba(2, 8, 23, 0.20);
        }

        div[data-testid="stMetricLabel"] {
            color: #94a3b8;
        }

        div[data-testid="stMetricValue"] {
            color: #38bdf8;
            font-weight: 850;
        }

        div[data-testid="stVerticalBlockBorderWrapper"] {
            background: rgba(15, 23, 42, 0.72);
            border: 1px solid rgba(56, 189, 248, 0.20);
            border-radius: 18px;
        }

        [data-testid="stPageLink"] a {
            border-radius: 12px;
            border: 1px solid rgba(56, 189, 248, 0.32);
        }

        hr {
            border-color: rgba(148, 163, 184, 0.16);
            margin: 30px 0;
        }
    </style>
    """,
    unsafe_allow_html=True,
)


# --------------------------------------------------
# HERO SECTION
# --------------------------------------------------

toronto_now = datetime.now(ZoneInfo("America/Toronto"))
updated_time = toronto_now.strftime("%B %d, %Y at %I:%M %p ET")

st.markdown(
    f"""
    <section class="gi-hero">
        <div class="gi-brain">🧠</div>
        <div class="gi-eyebrow">Game Intelligence</div>
        <h1 class="gi-title">{get_greeting()}, Sach.</h1>
        <p class="gi-subtitle">
            We don't just show the data. We explain why it matters.
            Every recommendation is earned through evidence, explained with
            intelligence, and designed to help users make better decisions.
        </p>
    </section>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    f"""
    <div class="gi-strip">
        <strong>Today's command center is ready.</strong>
        &nbsp; Updated {updated_time}
    </div>
    """,
    unsafe_allow_html=True,
)


# --------------------------------------------------
# TODAY'S SNAPSHOT
# --------------------------------------------------

st.subheader("Today's Snapshot")

snapshot_1, snapshot_2, snapshot_3, snapshot_4 = st.columns(4)

with snapshot_1:
    st.metric("Active Sports", "2", "MLB + Soccer")

with snapshot_2:
    st.metric("Top Opportunities", "4", "Across today's slate")

with snapshot_3:
    st.metric("Active Alerts", "2", "Lineup + weather")

with snapshot_4:
    st.metric("Decision Status", "Ready", "Evidence refreshed")

st.divider()


# --------------------------------------------------
# TODAY'S STORY + BEAT THE BOOKS
# --------------------------------------------------

left_column, right_column = st.columns([1.35, 1])

with left_column:
    st.subheader("Today's Story")

    with st.container(border=True):
        st.markdown(
            """
            - MLB returns with a limited slate before Friday's full schedule.
            - Weather and confirmed lineups remain the most important pregame checks.
            - Game Intelligence promotes only opportunities that clear the evidence threshold.
            """
        )
        st.caption(
            "This section will become dynamic when the Intelligence Engine is connected."
        )

with right_column:
    st.subheader("Beat the Books")

    with st.container(border=True):
        st.markdown("### What creates the strongest opportunity?")
        st.write(
            "A strong player profile is not enough by itself. The matchup, "
            "environment, recent form, evidence quality, and available value "
            "must support the same conclusion."
        )

        with st.expander("See the answer"):
            st.success(
                "The strongest opportunity is the one where multiple "
                "independent pieces of evidence agree and the market has "
                "not removed the value."
            )

st.divider()

  
 #  -00-------------------------------------------------
# SPORT NAVIGATION
# --------------------------------------------------

st.subheader("Choose a Sport")
st.caption(
    "Open a sport hub to see today's opportunities, evidence, and alerts."
)

sport_1, sport_2, sport_3 = st.columns(3)

with sport_1:
    render_sport_card(
        "⚾",
        "MLB",
        "Active today",
        "Player props, matchups, weather, momentum, and live intelligence.",
        "pages/mlb.py",
    )

with sport_2:
    render_sport_card(
        "🏈",
        "NFL",
        "Season center",
        "Game, player, matchup, injury, and market intelligence.",
        "pages/nfl.py",
    )

with sport_3:
    render_sport_card(
        "🏀",
        "NBA",
        "Season center",
        "Points, rebounds, assists, combinations, and matchup intelligence.",
        "pages/nba.py",
    )

sport_4, sport_5 = st.columns(2)

with sport_4:
    render_sport_card(
        "🏒",
        "NHL",
        "Season center",
        "Shots, goals, points, goalie, and matchup intelligence.",
        "pages/nhl.py",
    )

with sport_5:
    render_sport_card(
        "⚽",
        "Soccer",
        "Active competitions",
        "Matches, player markets, team form, and competition intelligence.",
        "pages/soccer.py",
    )

st.divider()


# --------------------------------------------------
# INTELLIGENCE ALERTS
# --------------------------------------------------

st.subheader("Intelligence Alerts")

alert_1, alert_2 = st.columns(2)

with alert_1:
    st.info(
        "⚾ MLB: Monitor confirmed lineups before locking player opportunities."
    )

with alert_2:
    st.warning(
        "🌦️ Weather: Conditions may change the strength of late-game recommendations."
    )

st.caption(
    "Version 1 uses placeholders while the Evidence Library "
    "and Intelligence Engine are connected."
)


