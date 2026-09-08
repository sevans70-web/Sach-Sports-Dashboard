"""Dedicated WNBA schedule page."""
from datetime import datetime,timedelta
from html import escape
from zoneinfo import ZoneInfo
import pandas as pd, streamlit as st
from data.wnba_schedule import load_wnba_scoreboard
TZ=ZoneInfo('America/Toronto')
st.markdown('''<style>.head{margin:4px 0 10px;padding:11px 12px;border-radius:13px;border:1.5px solid rgba(25,217,120,.58);background:linear-gradient(115deg,#101112,#111315 68%,rgba(246,200,76,.07))}.head h2{margin:0;font-size:1.25rem}.head p{margin:4px 0 0;color:#a7abb2;font-size:.74rem}.game{border:1.5px solid #34383d;border-left:5px solid #19d978;border-radius:14px;padding:.78rem .85rem;margin:.6rem 0;background:#101112}.top{display:flex;justify-content:space-between;color:#19d978;font-size:.67rem;font-weight:900}.status{color:#a7abb2}.team{display:grid;grid-template-columns:34px 1fr;gap:9px;align-items:center;margin:.55rem 0}.logo{width:32px;height:32px;object-fit:contain}.name{font-size:.9rem;font-weight:900}.meta{color:#a7abb2;font-size:.68rem}.score{color:#d6b35c;font-weight:900}div[class*="st-key-back_to_wnba"]{display:flex!important;justify-content:flex-end!important}div[class*="st-key-back_to_wnba"] button{background:#080909!important;color:#fff!important;border:1.5px solid #34373c!important;border-radius:10px!important}</style>''',unsafe_allow_html=True)
if st.button('← Back to WNBA',key='back_to_wnba'):st.switch_page('pages/wnba.py')
st.markdown('<div class="head"><h2>🏀 WNBA Games</h2><p>Choose a date range to review matchups and game status.</p></div>',unsafe_allow_html=True)
today=datetime.now(TZ).date();c1,c2=st.columns(2);start=c1.date_input('From',today,key='wnba_games_from');end=c2.date_input('To',today+timedelta(days=14),key='wnba_games_to')
if end<start:st.warning('The end date must be on or after the start date.');st.stop()
try:games=load_wnba_scoreboard(start.isoformat(),end.isoformat())
except Exception as e:st.warning('WNBA schedule data is temporarily unavailable.');st.caption(str(e));st.stop()
st.caption(f"{len(games)} game{'s' if len(games)!=1 else ''} found")
if games.empty:st.info('No WNBA games are scheduled in this date range.');st.stop()
def fmt(v):
 t=pd.to_datetime(v,errors='coerce');
 if pd.isna(t):return 'Time TBD'
 t=t.tz_localize(TZ) if t.tzinfo is None else t.tz_convert(TZ);return t.strftime('%a %b %d • %I:%M %p ET')
def team(logo,name,abbr,score,show):
 img=f'<img class="logo" src="{escape(str(logo))}">' if logo else '<div></div>';sc=f'<span class="score"> · {int(score)}</span>' if show and pd.notna(score) else ''
 return f'<div class="team">{img}<div><div class="name">{escape(str(name))}{sc}</div><div class="meta">{escape(str(abbr or ""))}</div></div></div>'
for _,g in games.iterrows():
 show=str(g.get('state')) in {'in','post'};st.markdown(f'<div class="game"><div class="top"><span>{fmt(g.get("tipoff_et"))}</span><span class="status">{escape(str(g.get("status") or "Scheduled"))}</span></div>{team(g.get("away_logo"),g.get("away_team"),g.get("away_abbr"),g.get("away_score"),show)}{team(g.get("home_logo"),g.get("home_team"),g.get("home_abbr"),g.get("home_score"),show)}</div>',unsafe_allow_html=True)
