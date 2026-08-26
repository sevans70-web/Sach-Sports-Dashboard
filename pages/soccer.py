"""Soccer workspace for Sach Sports Dashboard."""
from __future__ import annotations

from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st

from data.soccer_data import (
    SOCCER_LEAGUES,
    load_soccer_scoreboard,
    recent_stats_for_scoreboard,
)
from data.soccer_odds import load_soccer_prop_markets
from engines.soccer_rankings import (
    SOCCER_PROPS,
    build_soccer_rankings,
)

TORONTO_TZ = ZoneInfo("America/Toronto")


def _inject_css():
    st.markdown("""
    <style>
    :root{
      --soc-panel:#10251f;
      --soc-panel2:#173a31;
      --soc-border:#2f7160;
      --soc-accent:#55e6b5;
      --soc-soft:#b8d1c9
    }
    .soc-hero{
      border:1px solid var(--soc-border);
      border-radius:18px;
      padding:1rem 1.05rem;
      background:linear-gradient(
        135deg,var(--soc-panel),var(--soc-panel2)
      );
      margin-bottom:.9rem
    }
    .soc-kicker{
      color:var(--soc-accent);
      font-size:.76rem;
      font-weight:850;
      letter-spacing:.08em;
      text-transform:uppercase
    }
    .soc-title{
      font-size:1.32rem;
      font-weight:850;
      color:#fff
    }
    .soc-soft{
      color:var(--soc-soft);
      font-size:.86rem
    }
    .soc-game,.soc-card{
      border:1px solid var(--soc-border);
      border-radius:15px;
      padding:.78rem .85rem;
      margin:.55rem 0;
      background:linear-gradient(
        135deg,
        rgba(16,37,31,.88),
        rgba(23,58,49,.66)
      )
    }
    .soc-game{
      border-left:3px solid var(--soc-accent)
    }
    .soc-rank{
      color:var(--soc-accent);
      font-weight:850;
      font-size:.78rem;
      text-transform:uppercase
    }
    .soc-grid{
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:.38rem;
      margin-top:.55rem
    }
    .soc-stat{
      border:1px solid rgba(47,113,96,.55);
      border-radius:9px;
      padding:.4rem
    }
    .soc-label{
      color:var(--soc-soft);
      font-size:.64rem
    }
    .soc-value{
      font-size:.96rem;
      font-weight:800
    }
    @media(max-width:700px){
      .block-container{
        padding-left:.82rem;
        padding-right:.82rem
      }
      .soc-hero{
        padding:.82rem;
        border-radius:15px
      }
      .soc-title{font-size:1.14rem}
      .soc-card,.soc-game{
        padding:.68rem;
        border-radius:13px
      }
      .stTabs [data-baseweb="tab-list"]{
        gap:.12rem;
        overflow-x:auto
      }
      .stTabs [data-baseweb="tab"]{
        padding-left:.5rem;
        padding-right:.5rem;
        white-space:nowrap
      }
      .soc-grid{
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:.28rem
      }
      .soc-stat{padding:.32rem}
      .soc-label{font-size:.59rem}
      .soc-value{font-size:.88rem}
    }
    </style>
    """, unsafe_allow_html=True)


def _hero(league_name):
    st.markdown(
        f"""
        <div class="soc-hero">
          <div class="soc-kicker">
            Soccer • {league_name}
          </div>
          <div class="soc-title">
            ⚽ Soccer Intelligence Center
          </div>
          <div class="soc-soft">
            Fixtures • player intelligence •
            five core props • results
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _when(value):
    if pd.isna(value):
        return "Time TBD"

    return (
        value.tz_convert(TORONTO_TZ)
        .strftime("%a %b %d • %I:%M %p ET")
    )


def _load(league_name, league_slug):
    # Fixtures/stats and sportsbook markets are isolated.
    # A sportsbook 429 must NEVER take down Soccer.
    try:
        games = load_soccer_scoreboard(league_slug)
    except Exception:
        games = pd.DataFrame()

    try:
        stats = recent_stats_for_scoreboard(
            league_slug,
            games,
        )
    except Exception:
        stats = pd.DataFrame()

    try:
        markets = load_soccer_prop_markets(
            league_name
        )
    except Exception:
        markets = pd.DataFrame()
        markets.attrs["status"] = "provider_error"

    return games, stats, markets


def _market_message(markets):
    status = str(getattr(markets, "attrs", {}).get("status") or "")

    if status == "rate_limited":
        st.warning(
            "Player prop markets are temporarily rate-limited. "
            "Fixtures and results remain available, and the prop "
            "tabs will repopulate automatically when the provider "
            "allows the next refresh."
        )
    elif status == "missing_key":
        st.warning(
            "The soccer sportsbook feed is not connected."
        )
    elif status == "provider_error":
        st.warning(
            "The player-prop provider is temporarily unavailable. "
            "The rest of Soccer is still available."
        )


def _overview(league_name, games, stats, markets):
    _hero(league_name)

    upcoming = (
        games[~games["completed"].fillna(False)]
        if not games.empty
        else games
    )

    players = (
        markets["player_id"].nunique()
        if not markets.empty
        else 0
    )

    c1, c2, c3 = st.columns(3)
    c1.metric("Upcoming", len(upcoming))
    c2.metric("Players tracked", players)
    c3.metric("Core props", 5)

    _market_message(markets)

    st.markdown("### 🔥 Matchup Intelligence")
    if upcoming.empty:
        st.info(
            "No upcoming fixtures are currently "
            "being returned for this league."
        )
    else:
        for g in (
            upcoming.sort_values("kickoff")
            .head(12)
            .itertuples()
        ):
            st.markdown(
                f"""
                <div class="soc-game">
                  <strong>
                    {g.away_team} @ {g.home_team}
                  </strong><br>
                  <span class="soc-soft">
                    {_when(g.kickoff)} • {g.status}
                  </span>
                </div>
                """,
                unsafe_allow_html=True,
            )

    st.markdown("### 🎯 Intelligence Pulse")
    pulse = build_soccer_rankings(
        stats,
        games,
        "Shots on Target",
        markets,
    )

    if pulse.empty:
        st.caption(
            "Player intelligence will populate when verified "
            "sportsbook player markets are available."
        )
    else:
        for r in pulse.head(3).itertuples():
            cols = st.columns([1, 5])

            with cols[0]:
                photo = str(
                    getattr(r, "photo_url", "")
                    or ""
                ).strip()
                if photo:
                    st.image(photo, width=58)

            with cols[1]:
                prob = (
                    f"{r.market_probability:.1f}%"
                    if pd.notna(r.market_probability)
                    else "—"
                )
                st.markdown(
                    f"**#{r.rank} {r.player_name}** "
                    f"— GI {r.gi_score:.1f}"
                )
                st.caption(
                    f"{r.matchup} • line {r.line:g} "
                    f"• market implied {prob}"
                )


def _render_card(row, prop):
    photo = str(
        row.get("photo_url") or ""
    ).strip()

    if photo:
        top_cols = st.columns([1, 5])
        with top_cols[0]:
            st.image(photo, width=72)
        card_target = top_cols[1]
    else:
        card_target = st.container()

    with card_target:
        prob = (
            f"{row['market_probability']:.1f}%"
            if pd.notna(
                row.get("market_probability")
            )
            else "—"
        )

        odds = row.get("consensus_odds")
        odds = (
            odds
            if odds not in (None, "", "nan")
            else "—"
        )

        st.markdown(
            f"""
            <div class="soc-card">
              <div class="soc-rank">
                #{int(row['rank'])} • {prop}
              </div>
              <strong>{row['player_name']}</strong><br>
              <span class="soc-soft">
                {row['matchup']}
              </span>
              <div class="soc-grid">
                <div class="soc-stat">
                  <div class="soc-label">GI SCORE</div>
                  <div class="soc-value">
                    {row['gi_score']:.1f}
                  </div>
                </div>
                <div class="soc-stat">
                  <div class="soc-label">PROP LINE</div>
                  <div class="soc-value">
                    {row['line']:g}
                  </div>
                </div>
                <div class="soc-stat">
                  <div class="soc-label">MARKET %</div>
                  <div class="soc-value">{prob}</div>
                </div>
                <div class="soc-stat">
                  <div class="soc-label">ODDS</div>
                  <div class="soc-value">{odds}</div>
                </div>
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.caption(
        f"Why Engine • {row['why_engine']}"
    )


def _props(games, stats, markets):
    st.subheader("Player Props")
    st.caption(
        "Shots on Target • Shots • Saves • Goals • Assists"
    )

    _market_message(markets)

    # Keep the prop navigation visible even when the market provider is down.
    tabs = st.tabs([
        "🎯 SOT",
        "👟 Shots",
        "🧤 Saves",
        "⚽ Goals",
        "🅰️ Assists",
    ])

    for tab, prop in zip(tabs, SOCCER_PROPS):
        with tab:
            rankings = build_soccer_rankings(
                stats,
                games,
                prop,
                markets,
            )

            st.markdown(f"### Top {prop}")

            if rankings.empty:
                st.info(
                    f"No verified {prop.lower()} rankings "
                    f"are available for the current slate yet."
                )
                continue

            for _, row in rankings.iterrows():
                _render_card(row, prop)


def _results(games):
    st.subheader("Games / Results")

    if games.empty:
        st.info(
            "No soccer fixtures are currently available."
        )
        return

    for g in (
        games.sort_values(
            "kickoff",
            ascending=False,
        )
        .itertuples()
    ):
        st.markdown(
            f"### {g.away_team} @ {g.home_team}"
        )

        if (
            g.completed
            and g.away_score is not None
            and g.home_score is not None
        ):
            st.metric(
                "Final",
                f"{g.away_team} {g.away_score} "
                f"— {g.home_team} {g.home_score}",
            )

        st.caption(
            f"{_when(g.kickoff)} • {g.status}"
        )
        st.divider()


def show():
    _inject_css()

    st.title("⚽ Soccer")
    st.caption(
        "Intelligence Center • Player Props • Games & Results"
    )

    league_name = st.selectbox(
        "Competition",
        list(SOCCER_LEAGUES),
        key="soccer_league",
    )
    league_slug = SOCCER_LEAGUES[league_name]

    games, stats, markets = _load(
        league_name,
        league_slug,
    )

    tabs = st.tabs([
        "⚽ Intelligence Center",
        "🎯 Player Props",
        "🎮 Games / Results",
    ])

    with tabs[0]:
        _overview(
            league_name,
            games,
            stats,
            markets,
        )

    with tabs[1]:
        _props(
            games,
            stats,
            markets,
        )

    with tabs[2]:
        _results(games)


show()
