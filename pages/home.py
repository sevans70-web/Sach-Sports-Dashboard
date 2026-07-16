"""
Game Intelligence - Home Page
--------------------------------
File location: pages/home.py

This page is intentionally self-contained. It uses placeholder data so the
design works now and can be connected to live engines later without changing
the overall page structure.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

import streamlit as st


# ============================================================
# PAGE HELPERS
# ============================================================

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")


def get_toronto_now() -> datetime:
    """Return the current date and time in Toronto."""
    return datetime.now(TORONTO_TIMEZONE)


def get_greeting(current_time: datetime) -> str:
    """Return a greeting based on the current Toronto hour."""
    if current_time.hour < 12:
        return "Good morning"
    if current_time.hour < 18:
        return "Good afternoon"
    return "Good evening"


def confidence_class(confidence: str) -> str:
    """Return the CSS class used for a confidence badge."""
    normalized = confidence.strip().lower()

    if normalized == "high":
        return "confidence-high"
    if normalized == "medium":
        return "confidence-medium"
    return "confidence-low"


def render_opportunity_card(
    rank: int,
    player: str,
    team: str,
    opponent: str,
    market: str,
    confidence: str,
    reason: str,
    trend: str,
) -> None:
    """Render one ranked opportunity card."""
    badge_class = confidence_class(confidence)

    st.markdown(
        f"""
        <div class="gi-opportunity-card">
            <div class="gi-rank">#{rank}</div>
            <div class="gi-opportunity-main">
                <div class="gi-card-topline">
                    <span class="gi-player">{player}</span>
                    <span class="gi-confidence {badge_class}">
                        {confidence} confidence
                    </span>
                </div>
                <div class="gi-matchup">{team} vs. {opponent}</div>
                <div class="gi-market">{market}</div>
                <div class="gi-reason">{reason}</div>
                <div class="gi-trend">↗ {trend}</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_sport_link(
    icon: str,
    sport: str,
    status: str,
    description: str,
    page_path: str,
) -> None:
    """Render a sport navigation card."""
    with st.container(border=True):
        st.page_link(page_path, label=f"{icon} {sport}", use_container_width=True)
        st.caption(status)
        st.write(description)


# ============================================================
# PLACEHOLDER DATA
# Replace these lists with engine output when the data pipeline
# is connected.
# ============================================================

TOP_HR_OPPORTUNITIES = [
    {
        "player": "Sample Player A",
        "team": "NYY",
        "opponent": "BOS",
        "market": "Home Run",
        "confidence": "High",
        "reason": (
            "Strong recent power profile, favourable handedness split, "
            "and supportive park conditions."
        ),
        "trend": "Three independent power signals agree",
    },
    {
        "player": "Sample Player B",
        "team": "LAD",
        "opponent": "SF",
        "market": "Home Run",
        "confidence": "High",
        "reason": (
            "Elite barrel quality meets a pitcher allowing damaging contact "
            "in the player's strongest zone."
        ),
        "trend": "Matchup and contact quality are aligned",
    },
    {
        "player": "Sample Player C",
        "team": "ATL",
        "opponent": "NYM",
        "market": "Home Run",
        "confidence": "Medium",
        "reason": (
            "Positive recent form and platoon advantage, with lineup position "
            "still awaiting confirmation."
        ),
        "trend": "Upgrade possible after lineup confirmation",
    },
    {
        "player": "Sample Player D",
        "team": "HOU",
        "opponent": "SEA",
        "market": "Home Run",
        "confidence": "Medium",
        "reason": (
            "Hard-contact indicators are improving, but the opposing bullpen "
            "reduces the full-game edge."
        ),
        "trend": "Best value may be early in the game",
    },
    {
        "player": "Sample Player E",
        "team": "PHI",
        "opponent": "MIA",
        "market": "Home Run",
        "confidence": "Low",
        "reason": (
            "Power upside is present, although weather and recent swing decisions "
            "create additional uncertainty."
        ),
        "trend": "Monitor weather before promoting",
    },
]


# ============================================================
# HOME PAGE THEME
# ============================================================

st.markdown(
    """
    <style>
        :root {
            --gi-background: #06111f;
            --gi-surface: rgba(15, 23, 42, 0.82);
            --gi-surface-soft: rgba(15, 23, 42, 0.62);
            --gi-border: rgba(56, 189, 248, 0.24);
            --gi-blue: #38bdf8;
            --gi-blue-soft: #bae6fd;
            --gi-text: #f8fafc;
            --gi-muted: #94a3b8;
            --gi-green: #34d399;
            --gi-yellow: #fbbf24;
            --gi-orange: #fb923c;
        }

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
                    #0b1e35 50%,
                    #102b46 100%
                );
            color: var(--gi-text);
        }

        [data-testid="stSidebar"] {
            background: #030b16;
            border-right: 1px solid rgba(56, 189, 248, 0.20);
        }

        [data-testid="stSidebarNav"] a,
        [data-testid="stSidebarNav"] span {
            color: #e2e8f0;
        }

        .block-container {
            max-width: 1320px;
            padding-top: 1.6rem;
            padding-bottom: 3rem;
        }

        h1, h2, h3 {
            color: var(--gi-text);
            letter-spacing: -0.025em;
        }

        p {
            color: #cbd5e1;
        }

        .gi-hero {
            position: relative;
            overflow: hidden;
            padding: 38px 34px;
            border-radius: 24px;
            background:
                radial-gradient(
                    circle at 84% 18%,
                    rgba(56, 189, 248, 0.25),
                    transparent 29%
                ),
                linear-gradient(
                    135deg,
                    rgba(7, 26, 47, 0.99),
                    rgba(11, 42, 74, 0.96)
                );
            border: 1px solid rgba(56, 189, 248, 0.36);
            box-shadow: 0 20px 55px rgba(2, 8, 23, 0.35);
            margin-bottom: 18px;
        }

        .gi-eyebrow {
            color: var(--gi-blue);
            font-size: 0.78rem;
            font-weight: 800;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            margin-bottom: 10px;
        }

        .gi-title {
            color: #ffffff;
            font-size: clamp(2.15rem, 5vw, 4.35rem);
            font-weight: 900;
            line-height: 1.02;
            margin: 0;
        }

        .gi-subtitle {
            color: var(--gi-blue-soft);
            max-width: 800px;
            font-size: 1.06rem;
            line-height: 1.65;
            margin: 18px 0 0;
        }

        .gi-status-strip {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 10px;
            padding: 14px 18px;
            margin-bottom: 24px;
            border-radius: 15px;
            background: rgba(15, 23, 42, 0.72);
            border: 1px solid rgba(148, 163, 184, 0.18);
        }

        .gi-status-title {
            color: #ffffff;
            font-weight: 750;
        }

        .gi-status-time {
            color: var(--gi-muted);
        }

        div[data-testid="stMetric"] {
            min-height: 132px;
            padding: 18px;
            border-radius: 18px;
            background: var(--gi-surface);
            border: 1px solid var(--gi-border);
            box-shadow: 0 12px 30px rgba(2, 8, 23, 0.20);
        }

        div[data-testid="stMetricLabel"] {
            color: var(--gi-muted);
        }

        div[data-testid="stMetricValue"] {
            color: var(--gi-blue);
            font-weight: 850;
        }

        .gi-best-card {
            padding: 24px;
            border-radius: 20px;
            background:
                linear-gradient(
                    135deg,
                    rgba(14, 116, 144, 0.20),
                    rgba(15, 23, 42, 0.88)
                );
            border: 1px solid rgba(52, 211, 153, 0.35);
            min-height: 260px;
        }

        .gi-best-label {
            color: var(--gi-green);
            font-size: 0.78rem;
            font-weight: 850;
            letter-spacing: 0.13em;
            text-transform: uppercase;
        }

        .gi-best-player {
            color: #ffffff;
            font-size: 1.85rem;
            font-weight: 850;
            margin: 8px 0 2px;
        }

        .gi-best-market {
            color: var(--gi-blue-soft);
            font-size: 1.08rem;
            font-weight: 700;
            margin-bottom: 16px;
        }

        .gi-best-reason {
            color: #cbd5e1;
            line-height: 1.62;
        }

        .gi-evidence-row {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 18px;
        }

        .gi-evidence-pill {
            padding: 6px 10px;
            border-radius: 999px;
            background: rgba(56, 189, 248, 0.10);
            border: 1px solid rgba(56, 189, 248, 0.25);
            color: #d8f3ff;
            font-size: 0.79rem;
            font-weight: 700;
        }

        .gi-watch-card {
            padding: 22px;
            border-radius: 20px;
            background: var(--gi-surface);
            border: 1px solid var(--gi-border);
            min-height: 260px;
        }

        .gi-watch-item {
            padding: 12px 0;
            border-bottom: 1px solid rgba(148, 163, 184, 0.14);
        }

        .gi-watch-item:last-child {
            border-bottom: none;
        }

        .gi-watch-title {
            color: #ffffff;
            font-weight: 750;
        }

        .gi-watch-detail {
            color: var(--gi-muted);
            font-size: 0.88rem;
            margin-top: 3px;
        }

        .gi-opportunity-card {
            display: flex;
            gap: 16px;
            padding: 18px;
            margin-bottom: 12px;
            border-radius: 18px;
            background: var(--gi-surface);
            border: 1px solid var(--gi-border);
            box-shadow: 0 10px 26px rgba(2, 8, 23, 0.16);
        }

        .gi-rank {
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 48px;
            height: 48px;
            border-radius: 14px;
            color: #ffffff;
            background: rgba(56, 189, 248, 0.14);
            border: 1px solid rgba(56, 189, 248, 0.28);
            font-weight: 850;
        }

        .gi-opportunity-main {
            flex: 1;
            min-width: 0;
        }

        .gi-card-topline {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
        }

        .gi-player {
            color: #ffffff;
            font-size: 1.08rem;
            font-weight: 850;
        }

        .gi-confidence {
            padding: 5px 9px;
            border-radius: 999px;
            font-size: 0.72rem;
            font-weight: 850;
            text-transform: uppercase;
        }

        .confidence-high {
            color: #bbf7d0;
            background: rgba(34, 197, 94, 0.15);
            border: 1px solid rgba(34, 197, 94, 0.30);
        }

        .confidence-medium {
            color: #fef08a;
            background: rgba(234, 179, 8, 0.15);
            border: 1px solid rgba(234, 179, 8, 0.30);
        }

        .confidence-low {
            color: #fed7aa;
            background: rgba(249, 115, 22, 0.15);
            border: 1px solid rgba(249, 115, 22, 0.30);
        }

        .gi-matchup {
            color: var(--gi-muted);
            font-size: 0.84rem;
            margin-top: 3px;
        }

        .gi-market {
            color: var(--gi-blue-soft);
            font-weight: 800;
            margin-top: 9px;
        }

        .gi-reason {
            color: #cbd5e1;
            line-height: 1.55;
            margin-top: 6px;
        }

        .gi-trend {
            color: var(--gi-green);
            font-size: 0.82rem;
            font-weight: 700;
            margin-top: 8px;
        }

        div[data-testid="stVerticalBlockBorderWrapper"] {
            background: rgba(15, 23, 42, 0.68);
            border: 1px solid rgba(56, 189, 248, 0.18);
            border-radius: 18px;
        }

        [data-testid="stPageLink"] a {
            border-radius: 12px;
            border: 1px solid rgba(56, 189, 248, 0.30);
        }

        hr {
            border-color: rgba(148, 163, 184, 0.16);
            margin: 30px 0;
        }

        @media (max-width: 700px) {
            .block-container {
                padding-top: 0.8rem;
                padding-left: 1rem;
                padding-right: 1rem;
            }

            .gi-hero {
                padding: 26px 20px;
                border-radius: 20px;
            }

            .gi-title {
                font-size: 2.35rem;
            }

            .gi-subtitle {
                font-size: 0.96rem;
            }

            .gi-status-strip {
                display: block;
            }

            .gi-status-time {
                margin-top: 5px;
            }

            .gi-opportunity-card {
                gap: 12px;
                padding: 15px;
            }

            .gi-rank {
                flex-basis: 42px;
                height: 42px;
            }
        }
    </style>
    """,
    unsafe_allow_html=True,
)


# ============================================================
# HERO
# ============================================================

toronto_now = get_toronto_now()
updated_time = toronto_now.strftime("%B %d, %Y at %I:%M %p ET")

st.markdown(
    f"""
    <section class="gi-hero">
        <div class="gi-eyebrow">🧠 Game Intelligence</div>
        <h1 class="gi-title">{get_greeting(toronto_now)}, Sach.</h1>
        <p class="gi-subtitle">
            Your sports research command center. See the strongest opportunities,
            understand the evidence behind them, and know what still needs to be
            confirmed before making a decision.
        </p>
    </section>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    f"""
    <div class="gi-status-strip">
        <div class="gi-status-title">Today's command center is ready.</div>
        <div class="gi-status-time">Last refreshed: {updated_time}</div>
    </div>
    """,
    unsafe_allow_html=True,
)


# ============================================================
# TODAY'S SNAPSHOT
# ============================================================

st.subheader("Today's Snapshot")

metric_1, metric_2, metric_3, metric_4 = st.columns(4)

with metric_1:
    st.metric("MLB Games", "—", "Connect schedule feed")

with metric_2:
    st.metric("Qualified Plays", "5", "Placeholder rankings")

with metric_3:
    st.metric("Confirmed Lineups", "—", "Awaiting live data")

with metric_4:
    st.metric("System Status", "Ready", "Home page online")

st.divider()


# ============================================================
# BEST OVERALL PLAY + WHAT CHANGED
# ============================================================

best_column, watch_column = st.columns([1.35, 1])

with best_column:
    st.subheader("Best Overall Play")

    st.markdown(
        """
        <div class="gi-best-card">
            <div class="gi-best-label">Top-ranked opportunity</div>
            <div class="gi-best-player">Sample Player A</div>
            <div class="gi-best-market">Home Run vs. BOS</div>
            <div class="gi-best-reason">
                The strongest placeholder profile on today's board combines recent
                power, a favourable handedness split, supportive park conditions,
                and agreement across multiple independent indicators.
            </div>
            <div class="gi-evidence-row">
                <span class="gi-evidence-pill">Power form</span>
                <span class="gi-evidence-pill">Pitcher matchup</span>
                <span class="gi-evidence-pill">Park factor</span>
                <span class="gi-evidence-pill">High confidence</span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.caption(
        "Placeholder only. This card will be populated by the ranking and "
        "confidence engines."
    )

with watch_column:
    st.subheader("What Changed?")

    st.markdown(
        """
        <div class="gi-watch-card">
            <div class="gi-watch-item">
                <div class="gi-watch-title">Lineup confirmation pending</div>
                <div class="gi-watch-detail">
                    Upgrade or downgrade opportunities when batting orders are posted.
                </div>
            </div>
            <div class="gi-watch-item">
                <div class="gi-watch-title">Weather requires monitoring</div>
                <div class="gi-watch-detail">
                    Wind and rain can materially change power projections.
                </div>
            </div>
            <div class="gi-watch-item">
                <div class="gi-watch-title">Market value not connected</div>
                <div class="gi-watch-detail">
                    Rankings currently measure the player profile, not sportsbook price.
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if st.button("Refresh What Changed?", use_container_width=True):
        st.info(
            "The live change tracker will appear here after the data refresh "
            "pipeline is connected."
        )

st.divider()


# ============================================================
# TOP 5 DAILY HOME RUN PLAYS
# ============================================================

st.subheader("Top 5 Daily Home Run Plays")
st.caption(
    "Ranked by the future Confidence Engine. Current names and results are placeholders."
)

for position, opportunity in enumerate(TOP_HR_OPPORTUNITIES, start=1):
    render_opportunity_card(rank=position, **opportunity)

st.page_link(
    "pages/mlb.py",
    label="Open the full MLB dashboard →",
    use_container_width=True,
)

st.divider()


# ============================================================
# WHY ENGINE + CONFIDENCE ENGINE PREVIEW
# ============================================================

why_column, confidence_column = st.columns(2)

with why_column:
    st.subheader("Why Engine")

    with st.container(border=True):
        st.markdown("#### Why is a play ranked highly?")
        st.write(
            "The Why Engine will translate the raw statistics into plain-language "
            "reasons. It will identify which evidence supports the play, which "
            "factors weaken it, and what could still change the recommendation."
        )

        st.markdown(
            """
            - Recent form and quality of contact
            - Pitcher and handedness matchup
            - Ballpark and weather environment
            - Batting-order opportunity
            - Evidence agreement and data quality
            """
        )

with confidence_column:
    st.subheader("Confidence Engine")

    with st.container(border=True):
        st.markdown("#### How strong is the evidence?")
        st.write(
            "Confidence is not a promise that an outcome will happen. It measures "
            "how strongly the available evidence supports the recommendation."
        )

        st.success("High — several strong, independent signals agree.")
        st.warning("Medium — the profile is promising but still has uncertainty.")
        st.error("Low — upside exists, but key evidence is weak or incomplete.")

st.divider()


# ============================================================
# SPORT NAVIGATION
# ============================================================

st.subheader("Choose a Sport")
st.caption("Open a sport hub to view its research, opportunities, and alerts.")

sport_1, sport_2, sport_3 = st.columns(3)

with sport_1:
    render_sport_link(
        "⚾",
        "MLB",
        "Active build",
        "Home runs, hits, total bases, matchups, lineups, weather, and player pages.",
        "pages/mlb.py",
    )

with sport_2:
    render_sport_link(
        "🏈",
        "NFL",
        "Future phase",
        "Game, player, matchup, injury, and market intelligence.",
        "pages/nfl.py",
    )

with sport_3:
    render_sport_link(
        "🏀",
        "NBA",
        "Future phase",
        "Points, rebounds, assists, combinations, and matchup intelligence.",
        "pages/nba.py",
    )

sport_4, sport_5 = st.columns(2)

with sport_4:
    render_sport_link(
        "🏒",
        "NHL",
        "Future phase",
        "Shots, goals, points, goalie, and matchup intelligence.",
        "pages/nhl.py",
    )

with sport_5:
    render_sport_link(
        "⚽",
        "Soccer",
        "Future phase",
        "Matches, team form, player markets, and competition intelligence.",
        "pages/soccer.py",
    )

st.divider()


# ============================================================
# INTELLIGENCE ALERTS
# ============================================================

st.subheader("Intelligence Alerts")

alert_1, alert_2 = st.columns(2)

with alert_1:
    st.info(
        "⚾ Lineup alert: Confirm batting order and player status before "
        "promoting any MLB opportunity."
    )

with alert_2:
    st.warning(
        "🌦️ Weather alert: Recheck wind, temperature, and postponement risk "
        "close to game time."
    )

st.caption(
    "Home Page v1 — layout and placeholder logic are complete. Live schedule, "
    "player, lineup, weather, ranking, and market feeds will be connected later."
)
