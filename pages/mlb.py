"""
Game Intelligence - MLB Page v1
--------------------------------
File location: pages/mlb.py

Purpose:
- Show a clean MLB command centre.
- Display Top 5 previews for Home Runs, Hits, and Total Bases.
- Let the user expand each category to view a full Top 25.
- Reserve a photo area on every player card.
- Use placeholder information until live MLB data is connected.

Important:
The rankings and player identities below are placeholders for layout testing.
They are not current recommendations.
"""

from datetime import datetime
from html import escape
from urllib.parse import quote
from zoneinfo import ZoneInfo

import streamlit as st


# ============================================================
# TIME AND BASIC HELPERS
# ============================================================

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")


def get_toronto_now() -> datetime:
    """Return the current date and time in Toronto."""
    return datetime.now(TORONTO_TIMEZONE)


def confidence_class(confidence: str) -> str:
    """Return the CSS class for a confidence badge."""
    value = confidence.strip().lower()

    if value == "high":
        return "gi-confidence-high"
    if value == "medium":
        return "gi-confidence-medium"
    return "gi-confidence-low"


def player_image_url(player_name: str) -> str:
    """
    Return a temporary avatar URL.

    This creates a visual player-photo space now. Later, replace this helper
    with a real MLB headshot URL built from the player's MLB player ID.
    """
    safe_name = quote(player_name)
    return (
        "https://ui-avatars.com/api/"
        f"?name={safe_name}"
        "&size=256"
        "&background=102b46"
        "&color=ffffff"
        "&bold=true"
        "&format=png"
    )


def build_placeholder_rankings(category: str) -> list[dict]:
    """Create 25 placeholder ranking records for one category."""
    team_pairs = [
        ("NYY", "BOS"),
        ("LAD", "SF"),
        ("ATL", "NYM"),
        ("HOU", "SEA"),
        ("PHI", "MIA"),
        ("TOR", "TB"),
        ("CHC", "MIL"),
        ("BAL", "CLE"),
        ("TEX", "KC"),
        ("SD", "ARI"),
    ]

    reasons = {
        "Home Runs": [
            "Recent power, matchup quality, and park conditions support the profile.",
            "Strong barrel indicators align with a favourable pitcher matchup.",
            "Platoon advantage and hard-contact form create meaningful upside.",
            "Power indicators are positive, with lineup confirmation still important.",
            "The player grades well for damage against the projected pitch mix.",
        ],
        "Hits": [
            "Contact quality, batting-order opportunity, and matchup support a hit.",
            "Low strikeout profile combines with a favourable pitcher contact rate.",
            "Recent consistency and platoon splits strengthen the hitting outlook.",
            "Expected plate appearances and line-drive form support the ranking.",
            "The matchup favours the player's strongest contact zones.",
        ],
        "Total Bases": [
            "Extra-base potential and contact quality support the total-base profile.",
            "Recent power and gap contact provide more than one path to clear.",
            "Matchup, park, and expected plate appearances align positively.",
            "The player combines hit probability with meaningful damage potential.",
            "Hard-hit form and pitch-type success raise the total-base ceiling.",
        ],
    }

    records = []

    for index in range(1, 26):
        team, opponent = team_pairs[(index - 1) % len(team_pairs)]

        if index <= 7:
            confidence = "High"
        elif index <= 17:
            confidence = "Medium"
        else:
            confidence = "Low"

        records.append(
            {
                "rank": index,
                "player": f"Sample Player {index:02d}",
                "team": team,
                "opponent": opponent,
                "category": category,
                "confidence": confidence,
                "score": max(54, 96 - (index * 2)),
                "reason": reasons[category][(index - 1) % len(reasons[category])],
                "status": (
                    "Lineup projected"
                    if index % 3
                    else "Awaiting lineup confirmation"
                ),
            }
        )

    return records


HOME_RUN_RANKINGS = build_placeholder_rankings("Home Runs")
HIT_RANKINGS = build_placeholder_rankings("Hits")
TOTAL_BASE_RANKINGS = build_placeholder_rankings("Total Bases")


# ============================================================
# SESSION STATE
# ============================================================

for state_key in ("show_hr_25", "show_hits_25", "show_tb_25"):
    if state_key not in st.session_state:
        st.session_state[state_key] = False


# ============================================================
# CARD RENDERING
# ============================================================

def render_featured_player(player: dict) -> None:
    """Render the #1 player as a large featured card."""
    image_url = player_image_url(player["player"])
    badge_class = confidence_class(player["confidence"])

    st.markdown(
        f"""
        <div class="gi-featured-player">
            <div class="gi-featured-photo-wrap">
                <img
                    class="gi-featured-photo"
                    src="{escape(image_url)}"
                    alt="Temporary image placeholder for {escape(player['player'])}"
                />
                <div class="gi-photo-note">Photo placeholder</div>
            </div>

            <div class="gi-featured-content">
                <div class="gi-featured-topline">
                    <span class="gi-rank-badge">#{player['rank']}</span>
                    <span class="gi-confidence {badge_class}">
                        {escape(player['confidence'])}
                    </span>
                </div>

                <div class="gi-featured-name">{escape(player['player'])}</div>
                <div class="gi-featured-matchup">
                    {escape(player['team'])} vs. {escape(player['opponent'])}
                </div>
                <div class="gi-featured-market">{escape(player['category'])}</div>

                <div class="gi-featured-reason">
                    {escape(player['reason'])}
                </div>

                <div class="gi-featured-footer">
                    <span>GI Score: {player['score']}</span>
                    <span>{escape(player['status'])}</span>
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_compact_player(player: dict) -> None:
    """Render players #2 through #5 in a compact card."""
    image_url = player_image_url(player["player"])
    badge_class = confidence_class(player["confidence"])

    st.markdown(
        f"""
        <div class="gi-compact-player">
            <img
                class="gi-compact-photo"
                src="{escape(image_url)}"
                alt="Temporary image placeholder for {escape(player['player'])}"
            />

            <div class="gi-compact-rank">#{player['rank']}</div>

            <div class="gi-compact-main">
                <div class="gi-compact-topline">
                    <span class="gi-compact-name">{escape(player['player'])}</span>
                    <span class="gi-confidence {badge_class}">
                        {escape(player['confidence'])}
                    </span>
                </div>

                <div class="gi-compact-matchup">
                    {escape(player['team'])} vs. {escape(player['opponent'])}
                    · GI {player['score']}
                </div>

                <div class="gi-compact-reason">
                    {escape(player['reason'])}
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_full_ranking_row(player: dict) -> None:
    """Render one compact row in the full Top 25 view."""
    image_url = player_image_url(player["player"])
    badge_class = confidence_class(player["confidence"])

    st.markdown(
        f"""
        <div class="gi-full-row">
            <div class="gi-full-rank">#{player['rank']}</div>

            <img
                class="gi-full-photo"
                src="{escape(image_url)}"
                alt="Temporary image placeholder for {escape(player['player'])}"
            />

            <div class="gi-full-player">
                <div class="gi-full-name">{escape(player['player'])}</div>
                <div class="gi-full-matchup">
                    {escape(player['team'])} vs. {escape(player['opponent'])}
                </div>
            </div>

            <div class="gi-full-score">
                <span class="gi-score-label">GI score</span>
                <span class="gi-score-number">{player['score']}</span>
            </div>

            <span class="gi-confidence {badge_class}">
                {escape(player['confidence'])}
            </span>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_ranking_category(
    title: str,
    icon: str,
    rankings: list[dict],
    state_key: str,
    button_key: str,
) -> None:
    """Render a Top 5 preview and optional full Top 25 ranking."""
    st.markdown(
        f"""
        <div class="gi-section-heading">
            <div>
                <div class="gi-section-title">{icon} {escape(title)}</div>
                <div class="gi-section-subtitle">
                    Top 5 shown first. Open the full ranking when you want deeper research.
                </div>
            </div>
            <div class="gi-section-count">25 ranked</div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    render_featured_player(rankings[0])

    for player in rankings[1:5]:
        render_compact_player(player)

    button_label = (
        "Hide Full Top 25"
        if st.session_state[state_key]
        else "View Full Top 25"
    )

    if st.button(
        button_label,
        key=button_key,
        use_container_width=True,
    ):
        st.session_state[state_key] = not st.session_state[state_key]
        st.rerun()

    if st.session_state[state_key]:
        st.markdown(
            """
            <div class="gi-full-list-heading">
                Full Ranking
            </div>
            """,
            unsafe_allow_html=True,
        )

        for player in rankings:
            render_full_ranking_row(player)

        st.caption(
            "In a later build, tapping a player will open that player's "
            "full Intelligence page."
        )


# ============================================================
# PAGE THEME
# ============================================================

st.markdown(
    """
    <style>
        :root {
            --gi-bg: #06111f;
            --gi-panel: rgba(15, 23, 42, 0.84);
            --gi-panel-soft: rgba(15, 23, 42, 0.68);
            --gi-border: rgba(56, 189, 248, 0.22);
            --gi-blue: #38bdf8;
            --gi-blue-light: #bae6fd;
            --gi-text: #f8fafc;
            --gi-muted: #94a3b8;
            --gi-green: #34d399;
            --gi-yellow: #fbbf24;
            --gi-orange: #fb923c;
        }

        .stApp {
            background:
                radial-gradient(
                    circle at 50% -8%,
                    rgba(56, 189, 248, 0.16),
                    transparent 31%
                ),
                linear-gradient(
                    180deg,
                    #06111f 0%,
                    #0a1d33 46%,
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
            padding-top: 1.35rem;
            padding-bottom: 4rem;
        }

        h1, h2, h3 {
            color: var(--gi-text);
            letter-spacing: -0.025em;
        }

        p {
            color: #cbd5e1;
        }

        .gi-hero {
            padding: 34px 32px;
            margin-bottom: 18px;
            border-radius: 24px;
            background:
                radial-gradient(
                    circle at 84% 12%,
                    rgba(56, 189, 248, 0.24),
                    transparent 28%
                ),
                linear-gradient(
                    135deg,
                    rgba(7, 26, 47, 0.99),
                    rgba(11, 42, 74, 0.97)
                );
            border: 1px solid rgba(56, 189, 248, 0.35);
            box-shadow: 0 20px 55px rgba(2, 8, 23, 0.32);
        }

        .gi-eyebrow {
            color: var(--gi-blue);
            font-size: 0.78rem;
            font-weight: 850;
            letter-spacing: 0.15em;
            text-transform: uppercase;
        }

        .gi-title {
            color: #ffffff;
            margin: 8px 0 0;
            font-size: clamp(2.25rem, 5vw, 4.2rem);
            line-height: 1.02;
            font-weight: 900;
        }

        .gi-subtitle {
            max-width: 830px;
            margin: 16px 0 0;
            color: var(--gi-blue-light);
            font-size: 1.03rem;
            line-height: 1.62;
        }

        .gi-status-strip {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 10px;
            padding: 14px 18px;
            margin-bottom: 22px;
            border-radius: 15px;
            background: rgba(15, 23, 42, 0.72);
            border: 1px solid rgba(148, 163, 184, 0.18);
        }

        .gi-status-primary {
            color: #ffffff;
            font-weight: 750;
        }

        .gi-status-secondary {
            color: var(--gi-muted);
        }

        div[data-testid="stMetric"] {
            min-height: 125px;
            padding: 18px;
            border-radius: 18px;
            background: var(--gi-panel);
            border: 1px solid var(--gi-border);
        }

        div[data-testid="stMetricLabel"] {
            color: var(--gi-muted);
        }

        div[data-testid="stMetricValue"] {
            color: var(--gi-blue);
            font-weight: 850;
        }

        .gi-alert-panel {
            padding: 18px 20px;
            margin: 5px 0 24px;
            border-radius: 18px;
            background: rgba(15, 23, 42, 0.74);
            border: 1px solid rgba(251, 191, 36, 0.26);
        }

        .gi-alert-title {
            color: #ffffff;
            font-weight: 800;
            margin-bottom: 5px;
        }

        .gi-alert-copy {
            color: #cbd5e1;
            line-height: 1.55;
        }

        .gi-ranking-shell {
            padding: 18px;
            border-radius: 22px;
            background: rgba(8, 22, 39, 0.68);
            border: 1px solid rgba(56, 189, 248, 0.18);
        }

        .gi-section-heading {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 15px;
            margin-bottom: 14px;
        }

        .gi-section-title {
            color: #ffffff;
            font-size: 1.42rem;
            font-weight: 850;
            letter-spacing: -0.02em;
        }

        .gi-section-subtitle {
            color: var(--gi-muted);
            margin-top: 4px;
            font-size: 0.88rem;
        }

        .gi-section-count {
            white-space: nowrap;
            padding: 6px 10px;
            border-radius: 999px;
            color: var(--gi-blue-light);
            background: rgba(56, 189, 248, 0.10);
            border: 1px solid rgba(56, 189, 248, 0.22);
            font-size: 0.76rem;
            font-weight: 800;
        }

        .gi-featured-player {
            display: grid;
            grid-template-columns: 150px 1fr;
            gap: 22px;
            padding: 22px;
            margin-bottom: 12px;
            border-radius: 20px;
            background:
                linear-gradient(
                    135deg,
                    rgba(14, 116, 144, 0.18),
                    rgba(15, 23, 42, 0.92)
                );
            border: 1px solid rgba(52, 211, 153, 0.32);
        }

        .gi-featured-photo-wrap {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .gi-featured-photo {
            width: 140px;
            height: 140px;
            object-fit: cover;
            border-radius: 20px;
            border: 1px solid rgba(56, 189, 248, 0.34);
            background: #102b46;
        }

        .gi-photo-note {
            color: var(--gi-muted);
            margin-top: 7px;
            font-size: 0.68rem;
            text-align: center;
        }

        .gi-featured-content {
            min-width: 0;
        }

        .gi-featured-topline {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        .gi-rank-badge {
            padding: 6px 10px;
            border-radius: 999px;
            color: #ffffff;
            background: rgba(56, 189, 248, 0.16);
            border: 1px solid rgba(56, 189, 248, 0.28);
            font-weight: 850;
        }

        .gi-confidence {
            display: inline-flex;
            align-items: center;
            padding: 5px 9px;
            border-radius: 999px;
            font-size: 0.70rem;
            font-weight: 850;
            text-transform: uppercase;
        }

        .gi-confidence-high {
            color: #bbf7d0;
            background: rgba(34, 197, 94, 0.14);
            border: 1px solid rgba(34, 197, 94, 0.30);
        }

        .gi-confidence-medium {
            color: #fef08a;
            background: rgba(234, 179, 8, 0.14);
            border: 1px solid rgba(234, 179, 8, 0.30);
        }

        .gi-confidence-low {
            color: #fed7aa;
            background: rgba(249, 115, 22, 0.14);
            border: 1px solid rgba(249, 115, 22, 0.30);
        }

        .gi-featured-name {
            color: #ffffff;
            font-size: 1.62rem;
            font-weight: 900;
        }

        .gi-featured-matchup {
            color: var(--gi-muted);
            margin-top: 2px;
        }

        .gi-featured-market {
            color: var(--gi-blue-light);
            margin-top: 9px;
            font-size: 1.03rem;
            font-weight: 800;
        }

        .gi-featured-reason {
            color: #cbd5e1;
            margin-top: 9px;
            line-height: 1.58;
        }

        .gi-featured-footer {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 16px;
            color: var(--gi-green);
            font-size: 0.81rem;
            font-weight: 750;
        }

        .gi-compact-player {
            display: grid;
            grid-template-columns: 62px 42px 1fr;
            align-items: center;
            gap: 12px;
            padding: 14px;
            margin-bottom: 10px;
            border-radius: 17px;
            background: var(--gi-panel);
            border: 1px solid var(--gi-border);
        }

        .gi-compact-photo {
            width: 58px;
            height: 58px;
            object-fit: cover;
            border-radius: 15px;
            border: 1px solid rgba(56, 189, 248, 0.28);
            background: #102b46;
        }

        .gi-compact-rank {
            color: var(--gi-blue);
            font-weight: 900;
            text-align: center;
        }

        .gi-compact-main {
            min-width: 0;
        }

        .gi-compact-topline {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 7px;
        }

        .gi-compact-name {
            color: #ffffff;
            font-size: 1rem;
            font-weight: 850;
        }

        .gi-compact-matchup {
            color: var(--gi-muted);
            margin-top: 3px;
            font-size: 0.78rem;
        }

        .gi-compact-reason {
            color: #cbd5e1;
            margin-top: 6px;
            font-size: 0.86rem;
            line-height: 1.45;
        }

        .gi-full-list-heading {
            color: #ffffff;
            margin: 22px 0 10px;
            font-size: 1.05rem;
            font-weight: 850;
        }

        .gi-full-row {
            display: grid;
            grid-template-columns: 42px 48px minmax(130px, 1fr) 70px auto;
            align-items: center;
            gap: 10px;
            padding: 11px 12px;
            margin-bottom: 7px;
            border-radius: 14px;
            background: rgba(15, 23, 42, 0.78);
            border: 1px solid rgba(56, 189, 248, 0.15);
        }

        .gi-full-rank {
            color: var(--gi-blue);
            font-weight: 850;
            text-align: center;
        }

        .gi-full-photo {
            width: 44px;
            height: 44px;
            object-fit: cover;
            border-radius: 12px;
            background: #102b46;
        }

        .gi-full-player {
            min-width: 0;
        }

        .gi-full-name {
            color: #ffffff;
            font-weight: 800;
        }

        .gi-full-matchup {
            color: var(--gi-muted);
            margin-top: 2px;
            font-size: 0.74rem;
        }

        .gi-full-score {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .gi-score-label {
            color: var(--gi-muted);
            font-size: 0.62rem;
            text-transform: uppercase;
        }

        .gi-score-number {
            color: var(--gi-blue-light);
            font-weight: 900;
        }

        div[data-testid="stButton"] > button {
            border-radius: 13px;
            border: 1px solid rgba(56, 189, 248, 0.34);
            font-weight: 750;
        }

        hr {
            border-color: rgba(148, 163, 184, 0.16);
            margin: 28px 0;
        }

        @media (max-width: 760px) {
            .block-container {
                padding-top: 0.75rem;
                padding-left: 0.9rem;
                padding-right: 0.9rem;
            }

            .gi-hero {
                padding: 25px 19px;
                border-radius: 20px;
            }

            .gi-title {
                font-size: 2.35rem;
            }

            .gi-subtitle {
                font-size: 0.95rem;
            }

            .gi-status-strip {
                display: block;
            }

            .gi-status-secondary {
                margin-top: 5px;
            }

            .gi-section-heading {
                display: block;
            }

            .gi-section-count {
                display: inline-flex;
                margin-top: 9px;
            }

            .gi-featured-player {
                grid-template-columns: 88px 1fr;
                gap: 14px;
                padding: 16px;
            }

            .gi-featured-photo {
                width: 84px;
                height: 96px;
                border-radius: 15px;
            }

            .gi-photo-note {
                display: none;
            }

            .gi-featured-name {
                font-size: 1.25rem;
            }

            .gi-featured-reason {
                font-size: 0.88rem;
            }

            .gi-compact-player {
                grid-template-columns: 52px 34px 1fr;
                gap: 9px;
                padding: 12px;
            }

            .gi-compact-photo {
                width: 49px;
                height: 49px;
                border-radius: 13px;
            }

            .gi-compact-reason {
                display: none;
            }

            .gi-full-row {
                grid-template-columns: 34px 42px minmax(95px, 1fr) auto;
                gap: 7px;
                padding: 9px;
            }

            .gi-full-score {
                display: none;
            }

            .gi-full-row .gi-confidence {
                font-size: 0.62rem;
                padding: 4px 6px;
            }
        }
    </style>
    """,
    unsafe_allow_html=True,
)


# ============================================================
# HERO AND PAGE STATUS
# ============================================================

toronto_now = get_toronto_now()
refreshed_time = toronto_now.strftime("%B %d, %Y at %I:%M %p ET")

st.markdown(
    """
    <section class="gi-hero">
        <div class="gi-eyebrow">⚾ Game Intelligence</div>
        <h1 class="gi-title">MLB Intelligence Center</h1>
        <p class="gi-subtitle">
            Start with the strongest players in each market, review the reason
            behind every ranking, and open the full Top 25 only when you need
            more depth.
        </p>
    </section>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    f"""
    <div class="gi-status-strip">
        <div class="gi-status-primary">MLB Page v1 is ready for visual review.</div>
        <div class="gi-status-secondary">Refreshed {refreshed_time}</div>
    </div>
    """,
    unsafe_allow_html=True,
)


# ============================================================
# DAILY SNAPSHOT
# ============================================================

st.subheader("Today's MLB Snapshot")

metric_1, metric_2, metric_3, metric_4 = st.columns(4)

with metric_1:
    st.metric("Games", "—", "Schedule feed pending")

with metric_2:
    st.metric("Ranked Markets", "3", "HR · Hits · Total Bases")

with metric_3:
    st.metric("Lineups", "—", "Confirmation feed pending")

with metric_4:
    st.metric("Weather Alerts", "—", "Weather feed pending")

st.markdown(
    """
    <div class="gi-alert-panel">
        <div class="gi-alert-title">Before using a ranking</div>
        <div class="gi-alert-copy">
            Confirm the player is in the starting lineup, review weather and park
            conditions, and check whether the available market value still supports
            the recommendation.
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)


# ============================================================
# RANKING TABS
# ============================================================

st.subheader("Player Rankings")
st.caption(
    "The cards below use placeholders so we can judge the layout before "
    "connecting real players and official headshots."
)

home_run_tab, hits_tab, total_bases_tab = st.tabs(
    ["🔥 Home Runs", "⚾ Hits", "💥 Total Bases"]
)

with home_run_tab:
    render_ranking_category(
        title="Home Run Rankings",
        icon="🔥",
        rankings=HOME_RUN_RANKINGS,
        state_key="show_hr_25",
        button_key="toggle_hr_25",
    )

with hits_tab:
    render_ranking_category(
        title="Hit Rankings",
        icon="⚾",
        rankings=HIT_RANKINGS,
        state_key="show_hits_25",
        button_key="toggle_hits_25",
    )

with total_bases_tab:
    render_ranking_category(
        title="Total Base Rankings",
        icon="💥",
        rankings=TOTAL_BASE_RANKINGS,
        state_key="show_tb_25",
        button_key="toggle_tb_25",
    )

st.divider()


# ============================================================
# PLAYER CARD AND ENGINE ROADMAP
# ============================================================

player_page_column, engine_column = st.columns(2)

with player_page_column:
    st.subheader("Player Intelligence Page")

    with st.container(border=True):
        st.write(
            "In the next stage, selecting a player card will open a dedicated "
            "player page containing:"
        )

        st.markdown(
            """
            - Official player photo and team information
            - Last 5 and last 10 game performance
            - Home and away splits
            - Right- and left-handed pitcher splits
            - Pitch-type and barrel indicators
            - Batting-order and lineup confirmation
            - Park, weather, and matchup context
            - Why Engine explanation and Confidence score
            """
        )

with engine_column:
    st.subheader("Ranking Interpretation")

    with st.container(border=True):
        st.success(
            "High confidence: several strong and independent indicators agree."
        )
        st.warning(
            "Medium confidence: the opportunity is promising but still has "
            "meaningful uncertainty."
        )
        st.error(
            "Low confidence: upside exists, but important evidence is weak, "
            "conflicting, or incomplete."
        )

        st.caption(
            "Confidence measures evidence strength. It does not guarantee an outcome."
        )

st.caption(
    "MLB Page v1 uses sample players and temporary avatar images. Real rankings, "
    "official player headshots, schedule data, lineups, weather, and clickable "
    "player pages will be connected in later builds."
)
