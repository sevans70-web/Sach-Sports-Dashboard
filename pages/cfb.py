"""College Football workspace for Sach Sports Dashboard."""

import pandas as pd
import requests
import streamlit as st

from data.cfb_intelligence import build_cfb_rankings
from data.cfb_odds import get_cfb_odds_feed_status

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
        rows.append({
            "game_id": event.get("id"),
            "kickoff": pd.to_datetime(event.get("date"), errors="coerce", utc=True),
            "away_team": (away.get("team") or {}).get("displayName", "Away"),
            "home_team": (home.get("team") or {}).get("displayName", "Home"),
            "away_score": away.get("score"),
            "home_score": home.get("score"),
            "status": status.get("shortDetail") or status.get("description") or "Scheduled",
            "completed": bool(status.get("completed")),
        })
    return pd.DataFrame(rows)


def _inject_cfb_mobile_css():
    st.markdown("""
    <style>
    :root{--cfb-panel:#201a2d;--cfb-panel-2:#342447;--cfb-border:#6f4d88;--cfb-accent:#d8b35f;--cfb-soft:#c9bfd3}
    .cfb-hero{border:1px solid var(--cfb-border);border-radius:18px;padding:1rem 1.05rem;
    background:linear-gradient(135deg,var(--cfb-panel) 0%,var(--cfb-panel-2) 100%);margin-bottom:.85rem}
    .cfb-hero-title{font-size:1.3rem;font-weight:800;color:#fff}.cfb-soft{color:var(--cfb-soft);font-size:.9rem}
    .cfb-kicker,.cfb-rank{color:var(--cfb-accent);font-size:.78rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
    .cfb-game{border-left:3px solid var(--cfb-accent);padding:.45rem .75rem;margin:.55rem 0 .8rem}
    .cfb-prop-card{border:1px solid var(--cfb-border);border-radius:16px;padding:.8rem .9rem;margin:.7rem 0;
    background:linear-gradient(135deg,rgba(32,26,45,.88),rgba(52,36,71,.72))}
    .cfb-verified{font-size:.75rem;color:#d8b35f;margin-top:.25rem}
    @media(max-width:700px){
      .block-container{padding-left:.85rem;padding-right:.85rem}.cfb-hero{padding:.85rem;border-radius:15px}
      .cfb-hero-title{font-size:1.14rem}.cfb-prop-card{padding:.7rem;border-radius:14px}
      .stTabs [data-baseweb="tab-list"]{gap:.15rem;overflow-x:auto}.stTabs [data-baseweb="tab"]{padding-left:.55rem;padding-right:.55rem;white-space:nowrap}
      div[data-testid="stMetric"]{padding:.3rem .35rem}div[data-testid="stMetricLabel"]{font-size:.72rem}div[data-testid="stMetricValue"]{font-size:1rem}
    }
    </style>""", unsafe_allow_html=True)


def _hero():
    st.markdown("""<div class="cfb-hero"><div class="cfb-kicker">College Football</div>
    <div class="cfb-hero-title">🏈 CFB Intelligence Center</div>
    <div class="cfb-soft">Active slate • matchup intelligence • player-prop workspace • results</div></div>""",
    unsafe_allow_html=True)


def _intelligence():
    _hero()
    try:
        games = _load_scoreboard()
        feed = get_cfb_odds_feed_status()
        c1,c2,c3=st.columns(3)
        c1.metric("Season",CFB_SEASON); c2.metric("Games",len(games))
        c3.metric("Prop Mode","Live" if feed.get("status") in {"live","stale"} else "Foundation")
        if games.empty:
            st.info("No current college-football games are being returned by the live scoreboard.")
            return

        st.markdown("### 🔥 Matchup Intelligence")
        labels=[f"{r.away_team} @ {r.home_team}" for r in games.itertuples()]
        selected=st.selectbox("Select Matchup",labels,key="cfb_matchup")
        row=games.iloc[labels.index(selected)]
        kickoff=row["kickoff"]
        when=kickoff.tz_convert("America/Toronto").strftime("%a %b %d • %I:%M %p ET") if pd.notna(kickoff) else "Time TBD"
        st.markdown(f"**{row['away_team']} @ {row['home_team']}**"); st.caption(f"{when} • {row['status']}")

        st.markdown("### 🎯 Intelligence Pulse")
        passing=build_cfb_rankings("Passing Yards")
        if passing.empty:
            st.caption(feed.get("message") or "No passing-yard markets are posted yet.")
        else:
            for r in passing.head(3).itertuples():
                st.markdown(f"**#{r.rank} {r.player_name}**")
                st.caption(f"{r.matchup} • GI {r.gi_score:.1f} • Model {r.model_probability:.1f}%")

        st.markdown("### 📅 Active Slate")
        for g in games.itertuples():
            when=g.kickoff.tz_convert("America/Toronto").strftime("%a %b %d • %I:%M %p ET") if pd.notna(g.kickoff) else "Time TBD"
            st.markdown(f'<div class="cfb-game"><strong>{g.away_team} @ {g.home_team}</strong><br><span class="cfb-soft">{when} • {g.status}</span></div>',unsafe_allow_html=True)
    except Exception as exc:
        st.warning("CFB Intelligence Center is temporarily unavailable."); st.caption(str(exc))


def _fmt(value, digits=1):
    try:
        if pd.isna(value): return "—"
        return f"{float(value):.{digits}f}"
    except Exception:
        return "—"


def _render_prop_card(row, prop):
    mode=row.get("ranking_mode","Market Foundation")
    verified=bool(row.get("stats_verified",False))
    st.markdown(f"""<div class="cfb-prop-card">
      <div class="cfb-rank">#{int(row.get('rank',0))} • {mode}</div>
      <strong>{row.get('player_name','Unknown')}</strong><br>
      <span class="cfb-soft">{row.get('matchup','')}</span>
      <div class="cfb-verified">{"✓ ESPN statistical foundation verified" if verified else "Market data only • player stats not verified"}</div>
    </div>""",unsafe_allow_html=True)

    c1,c2=st.columns(2)
    with c1:
        st.metric("GI Score",_fmt(row.get("gi_score")))
        st.metric("Model Probability",f"{_fmt(row.get('model_probability'))}%")
        if prop not in {"Anytime TD","First TD"}:
            st.metric("Sportsbook Line",_fmt(row.get("consensus_line")))
    with c2:
        st.metric("Market Probability",f"{_fmt(row.get('sportsbook_implied_probability'))}%")
        st.metric("Consensus Odds",str(row.get("consensus_odds")) if pd.notna(row.get("consensus_odds")) else "—")
        if verified:
            st.metric("2025 Per Game",_fmt(row.get("per_game")))

    st.caption(f"Why Engine • {row.get('why_engine','')}")


def _props():
    st.subheader("Player Props")
    prop=st.selectbox("Select Prop",["Passing Yards","Rushing Yards","Receiving Yards","Receptions","Anytime TD","First TD"],key="cfb_prop_selector")
    st.markdown(f"### Top {prop}")

    feed=get_cfb_odds_feed_status()
    rankings=build_cfb_rankings(prop)
    if rankings.empty:
        st.info(feed.get("message") or f"No {prop} markets are posted for the current NCAAF slate yet.")
        return

    verified=int(rankings["stats_verified"].fillna(False).sum()) if "stats_verified" in rankings else 0
    st.caption(f"{feed.get('provider','Sportsbook')} • {len(rankings)} ranked players • {verified} statistical profiles verified")

    for _,row in rankings.iterrows():
        _render_prop_card(row,prop)


def _results():
    st.subheader("Games / Results")
    try:
        games=_load_scoreboard()
        if games.empty: st.info("No current college-football games are available."); return
        for g in games.itertuples():
            when=g.kickoff.tz_convert("America/Toronto").strftime("%a %b %d • %I:%M %p ET") if pd.notna(g.kickoff) else "Time TBD"
            st.markdown(f"### {g.away_team} @ {g.home_team}")
            if g.completed and g.away_score is not None and g.home_score is not None:
                st.metric("Final",f"{g.away_team} {g.away_score} — {g.home_team} {g.home_score}")
            st.caption(f"{when} • {g.status}"); st.divider()
    except Exception as exc:
        st.warning("CFB Games / Results is temporarily unavailable."); st.caption(str(exc))


def show():
    _inject_cfb_mobile_css()
    st.title("🏈 College Football")
    st.caption("Intelligence Center • Player Props • Games & Results")
    tabs=st.tabs(["🏈 Intelligence Center","🎯 Player Props","🎮 Games / Results"])
    with tabs[0]: _intelligence()
    with tabs[1]: _props()
    with tabs[2]: _results()

show()
