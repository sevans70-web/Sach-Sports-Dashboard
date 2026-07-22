"""
Game Intelligence - MLB Page v1.1
----------------------------------
File location: pages/mlb.py

Fixes in this version:
- Prevents player-card HTML from appearing as raw code.
- Removes dependency on temporary internet avatar images.
- Uses built-in initials placeholders until official MLB headshots are connected.
- Keeps the existing tablet/app-first visual design.
- Adds responsive desktop behaviour without changing the mobile identity.

Important:
The rankings and player identities below are placeholders for layout testing.
They are not current recommendations.
"""

from datetime import datetime, timedelta
from html import escape
from textwrap import dedent
from zoneinfo import ZoneInfo

import streamlit as st
from components.mlb_schedule import (
    render_live_mlb_schedule,
    schedule_summary,
)

from engines.game_intelligence import (
    get_all_rankings,
    get_daily_ranking_snapshot,
)
from data.ranking_history import (
    compare_player_rank,
    load_ranking_snapshot,
)

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


def player_initials(player_name: str) -> str:
    """Return two initials for a temporary player-photo placeholder."""
    words = [word for word in player_name.split() if word]

    if not words:
        return "MLB"

    if len(words) == 1:
        return words[0][:2].upper()

    return f"{words[0][0]}{words[-1][0]}".upper()


def render_html(html: str) -> None:
    """Render HTML as one continuous line so Streamlit cannot split it."""
    clean_html = " ".join(
        line.strip()
        for line in html.splitlines()
        if line.strip()
    )
    st.markdown(clean_html, unsafe_allow_html=True)

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


def convert_live_rankings(
    engine_result: dict,
    category_label: str,
) -> list[dict]:
    """Convert live engine results into the format used by the player cards."""

    converted = []

    for player in engine_result.get("rankings", []):
        reasons = player.get("why", [])
        risk_flags = player.get("risk_flags", [])

        converted.append(
            {
                "rank": player.get("rank", 0),
                "player": player.get(
                    "player_name",
                    "Player unavailable",
                ),
                "team": player.get("team_name", "TBD"),
"opponent": player.get("opponent_name", "TBD"),
"headshot_url": player.get("headshot_url"),
"player_id": player.get("player_id", None),
"position": player.get("position_abbreviation", ""),
                "category": category_label,
                "confidence": player.get("confidence", "Low"),
                "score": player.get("gi_score", 0),
                "reason": (
                    reasons[0]
                    if reasons
                    else "Live statistical profile is being evaluated."
                ),
                "status": (
                    risk_flags[0]
                    if risk_flags
                    else "Live data available"
                ),
            }
        )

    return converted


@st.cache_data(ttl=900, show_spinner=False)
def load_live_rankings() -> dict:
    """Load live MLB player rankings for today's games."""
    snapshot = get_daily_ranking_snapshot(
        recent_days=14,
        limit=25,
    )

    return snapshot.get("rankings", {})
    
live_rankings = load_live_rankings()

yesterday_date = (
    datetime.now(TORONTO_TIMEZONE).date() - timedelta(days=1)
)

previous_snapshot = load_ranking_snapshot(yesterday_date)
previous_rankings = previous_snapshot.get("rankings", {})

HOME_RUN_RANKINGS = convert_live_rankings(
    live_rankings.get("home_runs", {}),
    "Home Runs",
)
for player in HOME_RUN_RANKINGS:
    player["movement"] = compare_player_rank(
        player["player"],
        player["rank"],
        previous_rankings.get("home_runs", []),
    )
HIT_RANKINGS = convert_live_rankings(
    live_rankings.get("hits", {}),
    "Hits",
)

TOTAL_BASE_RANKINGS = convert_live_rankings(
    live_rankings.get("total_bases", {}),
    "Total Bases",
)


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
    badge_class = confidence_class(player["confidence"])
    initials = player_initials(player["player"])

    render_html(
        f"""
        <div class="gi-featured-player">
            <div class="gi-featured-photo-wrap">
                <div
                    class="gi-featured-photo-placeholder"
                    aria-label="Temporary image placeholder for {escape(player['player'])}"
                >
                    {escape(initials)}
                </div>
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

                <div class="gi-featured-market">
                    {escape(player['category'])}
                </div>

                <div class="gi-featured-reason">
                    {escape(player['reason'])}
                </div>

                <div class="gi-featured-footer">
                    <span>GI Score: {player['score']}</span>
                    <span>{escape(player['status'])}</span>
                </div>
            </div>
        </div>
        """
    )


def render_compact_player(player: dict) -> None:
    """Render players #2 through #5 in a compact card."""
    badge_class = confidence_class(player["confidence"])
    initials = player_initials(player["player"])

    render_html(
        f"""
        <div class="gi-compact-player">
            <div
                class="gi-compact-photo-placeholder"
                aria-label="Temporary image placeholder for {escape(player['player'])}"
            >
                {escape(initials)}
            </div>

            <div class="gi-compact-rank">#{player['rank']}</div>

            <div class="gi-compact-main">
                <div class="gi-compact-topline">
                    <span class="gi-compact-name">
                        {escape(player['player'])}
                    </span>

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
        """
    )


def render_full_ranking_row(player: dict) -> None:
    """Render one row in the full Top 25 view."""
    badge_class = confidence_class(player["confidence"])
    initials = player_initials(player["player"])

    render_html(
        f"""
        <div class="gi-full-row">
            <div class="gi-full-rank">#{player['rank']}</div>

            <div
                class="gi-full-photo-placeholder"
                aria-label="Temporary image placeholder for {escape(player['player'])}"
            >
                {escape(initials)}
            </div>

        <div class="gi-full-name">
            {escape(player['player'])}
            {escape(player.get("movement", ""))}
        </div>
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
        """
    )


def render_ranking_category(
    title: str,
    icon: str,
    rankings: list[dict],
    state_key: str,
    button_key: str,
) -> None:
    """Render a Top 5 preview and optional full Top 25 ranking."""
    render_html(
        f"""
        <div class="gi-section-heading">
            <div>
                <div class="gi-section-title">
                    {icon} {escape(title)} Rankings
                </div>

                <div class="gi-section-subtitle">
                    Top 5 shown first. Open the full ranking when you want deeper research.
                </div>
            </div>

            <div class="gi-section-count">25 ranked</div>
        </div>
        """
    )
    if not rankings:
        st.info(f"No {title.lower()} rankings are available right now.")
        return
        
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
        render_html(
            """
            <div class="gi-full-list-heading">
                Full Ranking
            </div>
            """
        )

        for player in rankings:
            render_full_ranking_row(player)

        st.caption(
            "In a later build, selecting a player will open that player's "
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
                    rgba(11, 42, 74, 0.96)
                );
            border: 1px solid rgba(56, 189, 248, 0.36);
            box-shadow: 0 18px 48px rgba(2, 8, 23, 0.32);
        }

        .gi-eyebrow {
            color: var(--gi-blue);
            font-size: 0.78rem;
            font-weight: 850;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            margin-bottom: 10px;
        }

        .gi-hero-title {
            color: #ffffff;
            font-size: clamp(2rem, 4vw, 3.5rem);
            font-weight: 900;
            line-height: 1.04;
            margin: 0;
        }

        .gi-hero-subtitle {
            color: var(--gi-blue-light);
            max-width: 820px;
            font-size: 1.02rem;
            line-height: 1.62;
            margin: 16px 0 0;
        }

        .gi-status-strip {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 10px;
            padding: 14px 18px;
            margin: 10px 0 25px;
            border-radius: 15px;
            background: rgba(15, 23, 42, 0.72);
            border: 1px solid rgba(148, 163, 184, 0.16);
        }

        .gi-status-primary {
            color: #ffffff;
            font-weight: 750;
        }

        .gi-status-secondary {
            color: var(--gi-muted);
        }

        div[data-testid="stMetric"] {
            min-height: 120px;
            padding: 16px;
            border-radius: 17px;
            background: var(--gi-panel-soft);
            border: 1px solid var(--gi-border);
        }

        div[data-testid="stMetricLabel"] {
            color: #cbd5e1;
        }

        div[data-testid="stMetricValue"] {
            color: #ffffff;
            font-weight: 850;
        }

        .gi-before-ranking {
            padding: 17px 19px;
            margin: 20px 0 28px;
            border-radius: 16px;
            background: rgba(15, 23, 42, 0.65);
            border: 1px solid rgba(251, 191, 36, 0.30);
        }

        .gi-before-title {
            color: #ffffff;
            font-weight: 800;
            margin-bottom: 5px;
        }

        .gi-before-text {
            color: #cbd5e1;
            line-height: 1.55;
        }

        .gi-tabs-note {
            color: var(--gi-muted);
            font-size: 0.91rem;
            margin-bottom: 10px;
        }

        .gi-section-heading {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin: 18px 0 13px;
        }

        .gi-section-title {
            color: #ffffff;
            font-size: 1.08rem;
            font-weight: 850;
        }

        .gi-section-subtitle {
            color: var(--gi-muted);
            font-size: 0.87rem;
            margin-top: 3px;
        }

        .gi-section-count {
            color: #d8f3ff;
            padding: 6px 10px;
            border-radius: 999px;
            background: rgba(56, 189, 248, 0.13);
            border: 1px solid rgba(56, 189, 248, 0.28);
            font-size: 0.76rem;
            font-weight: 800;
        }

        .gi-featured-player {
            display: grid;
            grid-template-columns: 145px minmax(0, 1fr);
            gap: 22px;
            padding: 21px;
            margin-bottom: 13px;
            border-radius: 20px;
            background:
                linear-gradient(
                    135deg,
                    rgba(14, 116, 144, 0.15),
                    rgba(15, 23, 42, 0.88)
                );
            border: 1px solid rgba(56, 189, 248, 0.30);
            box-shadow: 0 14px 34px rgba(2, 8, 23, 0.22);
        }

        .gi-featured-photo-wrap {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
        }

        .gi-featured-photo-placeholder {
            width: 128px;
            height: 150px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 18px;
            background:
                radial-gradient(
                    circle at 50% 30%,
                    rgba(56, 189, 248, 0.24),
                    transparent 45%
                ),
                linear-gradient(
                    160deg,
                    #123e66,
                    #0a1c31
                );
            border: 1px solid rgba(56, 189, 248, 0.36);
            color: #ffffff;
            font-size: 2.2rem;
            font-weight: 900;
            letter-spacing: 0.04em;
        }

        .gi-photo-note {
            color: var(--gi-muted);
            font-size: 0.72rem;
            margin-top: 7px;
        }

        .gi-featured-content {
            min-width: 0;
        }

        .gi-featured-topline {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
        }

        .gi-rank-badge {
            color: #ffffff;
            padding: 6px 10px;
            border-radius: 10px;
            background: rgba(56, 189, 248, 0.13);
            border: 1px solid rgba(56, 189, 248, 0.28);
            font-weight: 850;
        }

        .gi-confidence {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 5px 9px;
            border-radius: 999px;
            font-size: 0.72rem;
            font-weight: 850;
            text-transform: uppercase;
        }

        .gi-confidence-high {
            color: #bbf7d0;
            background: rgba(34, 197, 94, 0.15);
            border: 1px solid rgba(34, 197, 94, 0.30);
        }

        .gi-confidence-medium {
            color: #fef08a;
            background: rgba(234, 179, 8, 0.15);
            border: 1px solid rgba(234, 179, 8, 0.30);
        }

        .gi-confidence-low {
            color: #fed7aa;
            background: rgba(249, 115, 22, 0.15);
            border: 1px solid rgba(249, 115, 22, 0.30);
        }

        .gi-featured-name {
            color: #ffffff;
            font-size: 1.62rem;
            font-weight: 900;
            margin-top: 13px;
        }

        .gi-featured-matchup {
            color: var(--gi-muted);
            margin-top: 2px;
        }

        .gi-featured-market {
            color: var(--gi-blue-light);
            font-size: 1rem;
            font-weight: 800;
            margin-top: 11px;
        }

        .gi-featured-reason {
            color: #cbd5e1;
            line-height: 1.58;
            margin-top: 8px;
        }

        .gi-featured-footer {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 8px;
            color: var(--gi-green);
            font-size: 0.82rem;
            font-weight: 750;
            margin-top: 16px;
        }

        .gi-compact-player {
            display: grid;
            grid-template-columns: 58px 42px minmax(0, 1fr);
            align-items: center;
            gap: 13px;
            padding: 14px 16px;
            margin-bottom: 10px;
            border-radius: 17px;
            background: var(--gi-panel-soft);
            border: 1px solid var(--gi-border);
        }

        .gi-compact-photo-placeholder,
        .gi-full-photo-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-weight: 850;
            background:
                linear-gradient(
                    145deg,
                    #123e66,
                    #0a1c31
                );
            border: 1px solid rgba(56, 189, 248, 0.32);
        }

        .gi-compact-photo-placeholder {
            width: 54px;
            height: 54px;
            border-radius: 14px;
            font-size: 0.92rem;
        }

        .gi-compact-rank {
            color: var(--gi-blue-light);
            font-weight: 850;
            text-align: center;
        }

        .gi-compact-main {
            min-width: 0;
        }

        .gi-compact-topline {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
        }

        .gi-compact-name {
            color: #ffffff;
            font-weight: 850;
        }

        .gi-compact-matchup {
            color: var(--gi-muted);
            font-size: 0.82rem;
            margin-top: 2px;
        }

        .gi-compact-reason {
            color: #cbd5e1;
            font-size: 0.88rem;
            line-height: 1.45;
            margin-top: 6px;
        }

        .gi-full-list-heading {
            color: #ffffff;
            font-size: 1rem;
            font-weight: 850;
            margin: 20px 0 10px;
        }

        .gi-full-row {
            display: grid;
            grid-template-columns: 48px 46px minmax(0, 1fr) 80px auto;
            align-items: center;
            gap: 12px;
            padding: 12px 14px;
            margin-bottom: 8px;
            border-radius: 14px;
            background: rgba(15, 23, 42, 0.66);
            border: 1px solid rgba(56, 189, 248, 0.17);
        }

        .gi-full-rank {
            color: var(--gi-blue-light);
            font-weight: 850;
            text-align: center;
        }

        .gi-full-photo-placeholder {
            width: 42px;
            height: 42px;
            border-radius: 12px;
            font-size: 0.72rem;
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
            font-size: 0.78rem;
            margin-top: 2px;
        }

        .gi-full-score {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .gi-score-label {
            color: var(--gi-muted);
            font-size: 0.66rem;
            text-transform: uppercase;
        }

        .gi-score-number {
            color: #ffffff;
            font-weight: 850;
        }

        div[data-testid="stButton"] > button {
            min-height: 44px;
            border-radius: 13px;
            font-weight: 800;
        }

        div[data-testid="stVerticalBlockBorderWrapper"] {
            background: rgba(15, 23, 42, 0.66);
            border: 1px solid rgba(56, 189, 248, 0.18);
            border-radius: 18px;
        }

        hr {
            border-color: rgba(148, 163, 184, 0.16);
            margin: 30px 0;
        }

        @media (min-width: 1100px) {
            .block-container {
                max-width: 1440px;
            }

            .gi-featured-player {
                grid-template-columns: 165px minmax(0, 1fr);
                padding: 25px;
            }

            .gi-featured-photo-placeholder {
                width: 145px;
                height: 170px;
            }
        }

        @media (max-width: 760px) {
            .block-container {
                padding-top: 0.8rem;
                padding-left: 0.85rem;
                padding-right: 0.85rem;
            }

            .gi-hero {
                padding: 25px 20px;
                border-radius: 20px;
            }

            .gi-hero-title {
                font-size: 2.25rem;
            }

            .gi-status-strip {
                display: block;
            }

            .gi-status-secondary {
                margin-top: 5px;
            }

            .gi-featured-player {
                grid-template-columns: 96px minmax(0, 1fr);
                gap: 14px;
                padding: 16px;
            }

            .gi-featured-photo-placeholder {
                width: 88px;
                height: 110px;
                border-radius: 15px;
                font-size: 1.6rem;
            }

            .gi-featured-name {
                font-size: 1.25rem;
            }

            .gi-featured-footer {
                display: block;
            }

            .gi-featured-footer span {
                display: block;
                margin-top: 4px;
            }

            .gi-compact-player {
                grid-template-columns: 48px 34px minmax(0, 1fr);
                gap: 9px;
                padding: 12px;
            }

            .gi-compact-photo-placeholder {
                width: 46px;
                height: 46px;
                border-radius: 12px;
                font-size: 0.78rem;
            }

            .gi-full-row {
                grid-template-columns: 36px 40px minmax(0, 1fr) auto;
                gap: 8px;
            }

            .gi-full-score {
                display: none;
            }

            .gi-full-row .gi-confidence {
                font-size: 0.64rem;
                padding: 4px 7px;
            }
        }

        @media (max-width: 460px) {
            .gi-featured-player {
                display: block;
            }

            .gi-featured-photo-wrap {
                align-items: flex-start;
                margin-bottom: 14px;
            }

            .gi-featured-photo-placeholder {
                width: 82px;
                height: 82px;
            }

            .gi-photo-note {
                display: none;
            }

            .gi-compact-reason {
                display: none;
            }

            .gi-full-row {
                grid-template-columns: 32px 36px minmax(0, 1fr);
            }

            .gi-full-row .gi-confidence {
                display: none;
            }
        }
    </style>
    """,
    unsafe_allow_html=True,
)


# ============================================================
# PAGE CONTENT
# ============================================================

toronto_now = get_toronto_now()
refreshed_time = toronto_now.strftime("%B %d, %Y at %I:%M %p ET")

render_html(
    """
    <section class="gi-hero">
        <div class="gi-eyebrow">⚾ Game Intelligence</div>

        <h1 class="gi-hero-title">
            MLB Intelligence Center
        </h1>

        <p class="gi-hero-subtitle">
            Start with the strongest players in each market, review the reason
            behind every ranking, and open the full Top 25 only when you need
            more depth.
        </p>
    </section>
    """
)

render_html(
    f"""
    <div class="gi-status-strip">
        <div class="gi-status-primary">
            MLB Page v1.1 is ready for visual review.
        </div>

        <div class="gi-status-secondary">
            Refreshed {escape(refreshed_time)}
        </div>
    </div>
    """
)

with st.expander("⚾ View today's MLB games", expanded=False):
    live_schedule = render_live_mlb_schedule()

live_summary = schedule_summary(live_schedule)

st.subheader("Today's MLB Snapshot")

snapshot_1, snapshot_2, snapshot_3, snapshot_4 = st.columns(4)

with snapshot_1:
    games_status = (
        f"{live_summary['live']} live · {live_summary['final']} final"
    )

    st.metric(
        "Games",
        live_summary["games"],
        games_status,
    )

with snapshot_2:
    st.metric("Ranked Markets", "3", "HR · Hits · Total Bases")

with snapshot_3:
    st.metric("Lineups", "—", "Confirmation feed pending")

with snapshot_4:
    st.metric("Weather Alerts", "—", "Weather feed pending")

render_html(
    """
    <div class="gi-before-ranking">
        <div class="gi-before-title">
            Before using a ranking
        </div>

        <div class="gi-before-text">
            Confirm the player is in the starting lineup, review weather and park
            conditions, and check whether the available market value still supports
            the recommendation.
        </div>
    </div>
    """
)

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
        title="Home Run",
        icon="🔥",
        rankings=HOME_RUN_RANKINGS,
        state_key="show_hr_25",
        button_key="toggle_hr_25",
    )

with hits_tab:
    render_ranking_category(
        title="Hit",
        icon="⚾",
        rankings=HIT_RANKINGS,
        state_key="show_hits_25",
        button_key="toggle_hits_25",
    )

with total_bases_tab:
    render_ranking_category(
        title="Total Base",
        icon="💥",
        rankings=TOTAL_BASE_RANKINGS,
        state_key="show_tb_25",
        button_key="toggle_tb_25",
    )

st.divider()

player_page_column, interpretation_column = st.columns(2)

with player_page_column:
    st.subheader("Player Intelligence Page")
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

with interpretation_column:
    st.subheader("Ranking Interpretation")

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
    "MLB Page v1.1 uses sample players and built-in temporary photo placeholders. "
    "Real rankings, official player headshots, schedule data, lineups, weather, "
    "and clickable player pages will be connected in later builds."
)
