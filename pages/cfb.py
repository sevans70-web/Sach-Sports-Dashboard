"""College Football workspace for Sach Sports Dashboard."""

import pandas as pd
import requests
import streamlit as st

from data.cfb_odds import get_cfb_odds_feed_status, load_cfb_prop_markets

CFB_SEASON = 2026
ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"


@st.cache_data(ttl=300, show_spinner=False)
def _load_scoreboard():
    response = requests.get(
        ESPN_SCOREBOARD,
        params={"limit": 100, "groups": 80},
        timeout=20,
    )
    response.raise_for_status()

    rows = []
    for event in response.json().get("events", []):
        competitions = event.get("competitions") or []
        if not competitions:
            continue
        competition = competitions[0]
        competitors = competition.get("competitors") or []
        home = next((c for c in competitors if c.get("homeAway") == "home"), {})
        away = next((c for c in competitors if c.get("homeAway") == "away"), {})
        status = (event.get("status") or {}).get("type") or {}

        rows.append(
            {
                "game_id": event.get("id"),
                "kickoff": pd.to_datetime(event.get("date"), errors="coerce", utc=True),
                "away_team": (away.get("team") or {}).get("displayName", "Away"),
                "home_team": (home.get("team") or {}).get("displayName", "Home"),
                "away_score": away.get("score"),
                "home_score": home.get("score"),
                "status": status.get("shortDetail") or status.get("description") or "Scheduled",
                "completed": bool(status.get("completed")),
            }
        )

    return pd.DataFrame(rows)


def _inject_cfb_mobile_css():
    st.markdown(
        """
        <style>
        :root {
            --cfb-panel:#201a2d;
            --cfb-panel-2:#342447;
            --cfb-border:#6f4d88;
            --cfb-accent:#d8b35f;
            --cfb-soft:#c9bfd3;
        }
        .cfb-hero {
            border:1px solid var(--cfb-border);
            border-radius:18px;
            padding:1rem 1.05rem;
            background:linear-gradient(135deg,var(--cfb-panel) 0%,var(--cfb-panel-2) 100%);
            margin-bottom:.85rem;
        }
        .cfb-hero-title {font-size:1.3rem;font-weight:800;color:#fff;}
        .cfb-soft {color:var(--cfb-soft);font-size:.9rem;}
        .cfb-kicker {
            color:var(--cfb-accent);
            font-size:.78rem;
            font-weight:800;
            letter-spacing:.08em;
            text-transform:uppercase;
        }
        .cfb-game {
            border-left:3px solid var(--cfb-accent);
            padding:.45rem .75rem;
            margin:.55rem 0 .8rem;
        }
        .cfb-prop-card {
            border:1px solid var(--cfb-border);
            border-radius:16px;
            padding:.8rem .9rem;
            margin:.7rem 0;
            background:linear-gradient(135deg,rgba(32,26,45,.88),rgba(52,36,71,.72));
        }
        .cfb-rank {
            color:var(--cfb-accent);
            font-weight:800;
            font-size:.82rem;
            text-transform:uppercase;
        }
        @media(max-width:700px) {
            .block-container {padding-left:.85rem;padding-right:.85rem;}
            .cfb-hero {padding:.85rem;border-radius:15px;}
            .cfb-hero-title {font-size:1.14rem;}
            .cfb-prop-card {padding:.7rem;border-radius:14px;}
            .stTabs [data-baseweb="tab-list"] {gap:.15rem;overflow-x:auto;}
            .stTabs [data-baseweb="tab"] {
                padding-left:.55rem;
                padding-right:.55rem;
                white-space:nowrap;
            }
            div[data-testid="stMetric"] {padding:.3rem .35rem;}
            div[data-testid="stMetricLabel"] {font-size:.72rem;}
            div[data-testid="stMetricValue"] {font-size:1rem;}
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _hero():
    st.markdown(
        """
        <div class="cfb-hero">
          <div class="cfb-kicker">College Football</div>
          <div class="cfb-hero-title">🏈 CFB Intelligence Center</div>
          <div class="cfb-soft">Active slate • matchup intelligence • player-prop workspace • results</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _intelligence():
    _hero()
    try:
        games = _load_scoreboard()
        feed = get_cfb_odds_feed_status()

        c1, c2, c3 = st.columns(3)
        c1.metric("Season", CFB_SEASON)
        c2.metric("Games", len(games))
        c3.metric("Prop Mode", "Live" if feed.get("status") == "live" else "Foundation")

        if games.empty:
            st.info("No current college-football games are being returned by the live scoreboard.")
            return

        st.markdown("### 🔥 Matchup Intelligence")
        labels = [f"{r.away_team} @ {r.home_team}" for r in games.itertuples()]
        selected = st.selectbox("Select Matchup", labels, key="cfb_matchup")
        row = games.iloc[labels.index(selected)]
        kickoff = row["kickoff"]
        when = (
            kickoff.tz_convert("America/Toronto").strftime("%a %b %d • %I:%M %p ET")
            if pd.notna(kickoff)
            else "Time TBD"
        )
        st.markdown(f"**{row['away_team']} @ {row['home_team']}**")
        st.caption(f"{when} • {row['status']}")

        st.markdown("### 🎯 Prop Pulse")
        st.caption(feed.get("message") or "CFB sportsbook status unavailable.")
        if feed.get("status") == "live":
            passing = load_cfb_prop_markets("Passing Yards")
            if passing.empty:
                st.caption("No passing-yard markets are posted for the current slate yet.")
            else:
                for r in passing.head(3).itertuples():
                    probability = (
                        f"{float(r.sportsbook_implied_probability):.1f}%"
                        if pd.notna(r.sportsbook_implied_probability)
                        else "—"
                    )
                    line = f"{float(r.consensus_line):.1f}" if pd.notna(r.consensus_line) else "—"
                    st.markdown(f"**#{r.rank} {r.player_name}**")
                    st.caption(f"{r.matchup} • Line {line} • Market probability {probability}")

        st.markdown("### 📅 Active Slate")
        for g in games.itertuples():
            when = (
                g.kickoff.tz_convert("America/Toronto").strftime("%a %b %d • %I:%M %p ET")
                if pd.notna(g.kickoff)
                else "Time TBD"
            )
            st.markdown(
                f'<div class="cfb-game"><strong>{g.away_team} @ {g.home_team}</strong>'
                f'<br><span class="cfb-soft">{when} • {g.status}</span></div>',
                unsafe_allow_html=True,
            )
    except Exception as exc:
        st.warning("CFB Intelligence Center is temporarily unavailable.")
        st.caption(str(exc))


def _render_prop_card(row, prop):
    probability = row.get("sportsbook_implied_probability")
    probability_text = (
        f"{float(probability):.1f}%"
        if probability is not None and pd.notna(probability)
        else "—"
    )
    line = row.get("consensus_line")
    line_text = (
        f"{float(line):.1f}"
        if line is not None and pd.notna(line)
        else "TD market"
    )
    odds = row.get("consensus_odds")
    odds_text = str(odds) if odds is not None and not pd.isna(odds) else "—"

    st.markdown(
        f"""
        <div class="cfb-prop-card">
            <div class="cfb-rank">#{int(row.get('rank', 0))} • Market Foundation</div>
            <strong>{row.get('player_name', 'Unknown')}</strong><br>
            <span class="cfb-soft">{row.get('matchup', '')}</span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    c1, c2 = st.columns(2)
    with c1:
        st.metric("Sportsbook Line" if prop not in {"Anytime TD", "First TD"} else "Market", line_text)
        st.metric("Market Probability", probability_text)
    with c2:
        st.metric("Consensus Odds", odds_text)
        st.metric("Books", int(row.get("bookmaker_count", 0)))

    st.caption(
        "Why Engine • Market Foundation ranks the currently posted college-football "
        "sportsbook market. The statistical CFB projection layer will be added next."
    )


def _props():
    st.subheader("Player Props")
    prop = st.selectbox(
        "Select Prop",
        [
            "Passing Yards",
            "Rushing Yards",
            "Receiving Yards",
            "Receptions",
            "Anytime TD",
            "First TD",
        ],
        key="cfb_prop_selector",
    )

    st.markdown(f"### Top 25 {prop}")

    feed = get_cfb_odds_feed_status()
    if feed.get("status") != "live":
        st.info(feed.get("message") or "NCAAF player-prop markets are not available yet.")
        return

    markets = load_cfb_prop_markets(prop)
    if markets.empty:
        st.info(
            f"No {prop} markets are posted for the current NCAAF slate yet. "
            "This section will populate automatically when sportsbooks release them."
        )
        return

    st.caption(
        f"{feed.get('provider', 'Sportsbook')} • {len(markets)} ranked players • "
        "Market Foundation mode"
    )

    for _, row in markets.iterrows():
        _render_prop_card(row, prop)


def _results():
    st.subheader("Games / Results")
    try:
        games = _load_scoreboard()
        if games.empty:
            st.info("No current college-football games are available.")
            return

        for g in games.itertuples():
            when = (
                g.kickoff.tz_convert("America/Toronto").strftime("%a %b %d • %I:%M %p ET")
                if pd.notna(g.kickoff)
                else "Time TBD"
            )
            st.markdown(f"### {g.away_team} @ {g.home_team}")
            if g.completed and g.away_score is not None and g.home_score is not None:
                st.metric("Final", f"{g.away_team} {g.away_score} — {g.home_team} {g.home_score}")
            st.caption(f"{when} • {g.status}")
            st.divider()
    except Exception as exc:
        st.warning("CFB Games / Results is temporarily unavailable.")
        st.caption(str(exc))


def show():
    _inject_cfb_mobile_css()
    st.title("🏈 College Football")
    st.caption("Intelligence Center • Player Props • Games & Results")

    tabs = st.tabs(
        [
            "🏈 Intelligence Center",
            "🎯 Player Props",
            "🎮 Games / Results",
        ]
    )
    with tabs[0]:
        _intelligence()
    with tabs[1]:
        _props()
    with tabs[2]:
        _results()


show()
