"""NHL Intelligence Center — MLB-derived structure for Sach Sports Dashboard."""
from __future__ import annotations

from datetime import datetime, timedelta
from html import escape
import json
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st

from data.nhl_data import NHL_BASELINE_SEASON, NHL_CURRENT_SEASON, load_nhl_scoreboard, nhl_headshot_url
from engines.nhl_rankings import NHL_PROPS, build_nhl_baseline_top25

TORONTO_TZ = ZoneInfo("America/Toronto")
MOVEMENT_FILE = Path("/tmp/sach_nhl_rank_movement.json")


def _css() -> None:
    st.markdown("""
    <style>
    :root{--nhl-panel:#101927;--nhl-panel2:#172a3a;--nhl-border:#315a72;--nhl-accent:#20d9d2;--nhl-soft:#b9c7d8}
    .nhl-hero{border:1px solid var(--nhl-border);border-radius:18px;padding:1rem 1.05rem;background:linear-gradient(135deg,var(--nhl-panel),var(--nhl-panel2));margin-bottom:.9rem}
    .nhl-kicker{color:var(--nhl-accent);font-size:.76rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.nhl-title{font-size:1.32rem;font-weight:850;color:#fff}.nhl-soft{color:var(--nhl-soft);font-size:.86rem}
    .nhl-game,.nhl-card{border:1px solid var(--nhl-border);border-left:3px solid var(--nhl-accent);border-radius:14px;padding:.75rem .85rem;margin:.55rem 0;background:linear-gradient(135deg,rgba(16,25,39,.9),rgba(23,42,58,.7))}
    .nhl-player{display:grid;grid-template-columns:92px minmax(0,1fr);gap:.85rem;align-items:center;border:1px solid var(--nhl-border);border-radius:16px;padding:.78rem;margin:.58rem 0;background:linear-gradient(135deg,rgba(16,25,39,.9),rgba(23,42,58,.65))}
    .nhl-photo{width:92px;height:92px;object-fit:contain;object-position:center bottom;border-radius:12px;background:#f4f7fa}.nhl-rank{font-size:1.08rem;font-weight:850}.nhl-meta{color:var(--nhl-soft);font-size:.76rem;margin:.15rem 0 .48rem}.nhl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.4rem}.nhl-stat{border:1px solid rgba(49,90,114,.55);border-radius:10px;padding:.4rem .48rem;background:rgba(8,14,27,.3)}.nhl-stat span{display:block;color:var(--nhl-soft);font-size:.64rem}.nhl-stat b{font-size:.96rem}.nhl-why{font-size:.7rem;color:var(--nhl-soft);margin-top:.45rem;line-height:1.35}
    @media(max-width:700px){.block-container{padding-left:.82rem;padding-right:.82rem}.nhl-hero{padding:.82rem}.nhl-player{grid-template-columns:74px minmax(0,1fr);gap:.62rem;padding:.62rem}.nhl-photo{width:74px;height:74px}.nhl-grid{gap:.28rem}.nhl-stat{padding:.32rem}.nhl-stat b{font-size:.86rem}.stTabs [data-baseweb="tab-list"]{overflow-x:auto;gap:.12rem}.stTabs [data-baseweb="tab"]{white-space:nowrap;padding-left:.5rem;padding-right:.5rem}}
    </style>""", unsafe_allow_html=True)


def _hero() -> None:
    st.markdown(f'''<div class="nhl-hero"><div class="nhl-kicker">NHL • {NHL_CURRENT_SEASON}</div><div class="nhl-title">🏒 NHL Intelligence Center</div><div class="nhl-soft">MLB foundation • slate intelligence • five core player props • movement • results</div></div>''', unsafe_allow_html=True)


def _games(start, end):
    try: return load_nhl_scoreboard(start.isoformat(), end.isoformat())
    except Exception as exc:
        st.warning("NHL schedule data is temporarily unavailable."); st.caption(str(exc)); return pd.DataFrame()


def _time(v):
    ts=pd.to_datetime(v,errors="coerce",utc=True)
    return "Time TBD" if pd.isna(ts) else ts.tz_convert(TORONTO_TZ).strftime("%a %b %d • %I:%M %p ET")


def _game_card(r):
    state=str(r.get("state") or ""); score=""
    if pd.notna(r.get("away_score")) and pd.notna(r.get("home_score")): score=f" • {r.get('away_abbr')} {int(r.get('away_score'))}–{int(r.get('home_score'))} {r.get('home_abbr')}"
    live=f" • P{r.get('period')} {r.get('clock')}" if state in {"LIVE","CRIT"} and r.get("period") else ""
    st.markdown(f'<div class="nhl-game"><b>{escape(str(r.get("away_team")))} @ {escape(str(r.get("home_team")))}</b><br><span class="nhl-soft">{_time(r.get("start_time_utc"))} • {escape(state)}{escape(score)}{escape(live)}</span></div>',unsafe_allow_html=True)


def _movement(df, prop):
    if df.empty:return df
    try: state=json.loads(MOVEMENT_FILE.read_text()) if MOVEMENT_FILE.exists() else {}
    except Exception: state={}
    previous=state.get(prop,{}) or {}; current={}; labels=[]
    for _,r in df.iterrows():
        key=str(int(r.player_id)) if pd.notna(r.get("player_id")) else f"{r.get('player_name')}|{r.get('team')}"; rank=int(r["rank"]); old=previous.get(key); current[key]=rank
        labels.append("NEW" if old is None else (f"↑ {int(old)-rank}" if int(old)>rank else (f"↓ {rank-int(old)}" if int(old)<rank else "—")))
    out=df.copy(); out["movement"]=labels; state[prop]=current
    try:MOVEMENT_FILE.write_text(json.dumps(state))
    except Exception:pass
    return out


def _player_card(r):
    pid=int(r.player_id); team=str(r.get("team") or "").split(",")[0]; name=escape(str(r.player_name)); prop=str(r.prop)
    secondary_label, secondary="Games",r.get("games_played")
    if prop=="Goalie Saves": secondary_label,secondary="Starts",r.get("games_started")
    st.markdown(f'''<div class="nhl-player"><img class="nhl-photo" src="{nhl_headshot_url(pid,team)}" alt="{name} headshot"><div><div class="nhl-rank">#{int(r['rank'])} {name}</div><div class="nhl-meta">{escape(team)} • {escape(str(r.get('movement','—')))} • {NHL_BASELINE_SEASON} baseline</div><div class="nhl-grid"><div class="nhl-stat"><span>{escape(str(r.metric_label))}</span><b>{float(r.ranking_value):.2f}</b></div><div class="nhl-stat"><span>GI Baseline</span><b>{float(r.gi_score):.1f}</b></div><div class="nhl-stat"><span>{secondary_label}</span><b>{int(secondary) if pd.notna(secondary) else '—'}</b></div></div><div class="nhl-why"><b>Why Engine:</b> {escape(str(r.reason))}</div></div></div>''',unsafe_allow_html=True)


def _intelligence():
    _hero(); today=datetime.now(TORONTO_TZ).date(); games=_games(today,today+timedelta(days=7))
    live=games[games.state.isin(["LIVE","CRIT"])] if not games.empty else pd.DataFrame(); upcoming=games[games.state.eq("FUT")] if not games.empty else pd.DataFrame()
    a,b,c=st.columns(3);a.metric("Season",NHL_CURRENT_SEASON);b.metric("Live",len(live));c.metric("Next 7 Days",len(upcoming))
    st.markdown("### 🔥 Slate Intelligence")
    if games.empty: st.info("No NHL games are available in the next seven days. The live slate will populate automatically when games return.")
    else:
        for _,r in pd.concat([live,upcoming]).head(8).iterrows():_game_card(r)
    st.markdown("### 🎯 Prop Intelligence")
    st.markdown('<div class="nhl-card"><b>Five core NHL markets</b><br><span class="nhl-soft">Shots on Goal • Points • Goals • Assists • Goalie Saves</span><br><br><span class="nhl-soft">Shared intelligence: recent form • expected ice time • line role • power-play role • opponent defense • projected goalie • home/away • injuries/scratches. Goalie Saves adds confirmed starter, projected shots faced and workload.</span></div>',unsafe_allow_html=True)


def _schedule():
    st.subheader("Games / Schedule"); today=datetime.now(TORONTO_TZ).date(); a,b=st.columns(2); start=a.date_input("From",today,key="nhl_from"); end=b.date_input("To",today+timedelta(days=14),key="nhl_to")
    if end<start:st.warning("The end date must be on or after the start date.");return
    games=_games(start,end)
    if games.empty:st.info("No NHL games are scheduled in this date range.");return
    for _,r in games.sort_values("start_time_utc").iterrows():_game_card(r)


def _props():
    st.subheader("Player Props"); prop=st.selectbox("Select Prop",NHL_PROPS,key="nhl_prop"); st.markdown(f"### Top 25 {prop}")
    st.caption(f"Real {NHL_BASELINE_SEASON} regular-season baseline. Live 2026–27 probability and matchup weighting activate with the current slate; baseline data is not mislabeled as a live prediction.")
    try:df=_movement(build_nhl_baseline_top25(prop),prop)
    except Exception as exc:st.warning("NHL player data is temporarily unavailable.");st.caption(str(exc));return
    if df.empty:st.info("No qualified real-player rows are available right now.");return
    for _,r in df.iterrows():_player_card(r)


def _results():
    st.subheader("Results / Performance"); st.caption("Completed games now; prediction grading and prop-level performance will populate here as NHL predictions are recorded.")
    today=datetime.now(TORONTO_TZ).date(); games=_games(today-timedelta(days=14),today)
    completed=games[games.state.eq("OFF")].copy() if not games.empty else pd.DataFrame()
    if completed.empty:st.info("No completed NHL games are available in the last 14 days.")
    else:
        for _,r in completed.sort_values("start_time_utc",ascending=False).iterrows():_game_card(r)
    st.markdown("### 📈 Prediction Performance");st.caption("Hit rate, prop performance, calibration and prediction history will populate automatically once live NHL predictions begin being saved and graded.")


def show():
    _css();st.title("🏒 NHL");tabs=st.tabs(["🧠 Intelligence","📅 Games / Schedule","🎯 Player Props","📈 Results / Performance"])
    with tabs[0]:_intelligence()
    with tabs[1]:_schedule()
    with tabs[2]:_props()
    with tabs[3]:_results()
show()
