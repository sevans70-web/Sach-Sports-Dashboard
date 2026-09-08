"""WNBA Intelligence Center — MLB-style main-page flow."""
from __future__ import annotations
from datetime import datetime
from html import escape
import json
from pathlib import Path
from zoneinfo import ZoneInfo
import pandas as pd
import streamlit as st
from data.wnba_schedule import current_wnba_window
from data.wnba_stats import WNBA_BASELINE_SEASON, wnba_headshot_url
from engines.wnba_rankings import build_wnba_baseline_top25
from components.wnba_prediction_performance import render_wnba_prediction_performance

WNBA_SEASON="2026"; TORONTO_TZ=ZoneInfo("America/Toronto"); WNBA_MOVEMENT_FILE=Path("/tmp/sach_wnba_rank_movement.json")
WNBA_PROPS=["Points","Rebounds","Assists","3-Pointers Made","Points + Rebounds + Assists (PRA)","Points + Rebounds","Points + Assists","Rebounds + Assists","Steals","Blocks"]
PROP_ICONS={"Points":"🏀","Rebounds":"💪","Assists":"🎯","3-Pointers Made":"🔥","Points + Rebounds + Assists (PRA)":"📊","Points + Rebounds":"⚡","Points + Assists":"🧠","Rebounds + Assists":"🔁","Steals":"🖐️","Blocks":"🧱"}

def css():
 st.markdown('''<style>
 :root{--g:#19d978;--gold:#d6b35c;--border:#34383d;--soft:#a7abb2}.wnba-hero{border:2px solid rgba(214,179,92,.9);border-radius:15px;padding:14px;background:linear-gradient(105deg,rgba(214,179,92,.25),rgba(4,5,4,.98) 44%,rgba(25,217,120,.25));margin:0 0 6px}.wnba-kicker{color:var(--g);font-size:.76rem;font-weight:900;letter-spacing:.08em;margin-bottom:.3rem}.wnba-title{font-size:1.55rem;font-weight:950;color:#fff;line-height:1.08;margin-bottom:.45rem}.wnba-soft{color:var(--soft);font-size:.84rem;line-height:1.45}.wnba-updated{color:#a7abb2;font-size:.68rem;font-weight:800;text-align:right;margin:2px 0 6px}.wnba-snapshot-title{display:flex;justify-content:space-between;align-items:end;font-size:1rem;font-weight:900;margin:.8rem 0 .4rem}.wnba-snapshot-title span{color:var(--g);font-size:.62rem}.wnba-snapshot{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:1rem}.wnba-snap{background:#101112;border:2px solid #34383d;border-radius:13px;padding:9px}.wnba-snap:first-child{border-color:var(--g)}.wnba-snap:last-child{border-color:#d6b35c}.wnba-snap small{display:block;color:#fff;font-size:.58rem;font-weight:900}.wnba-snap strong{display:block;color:#fff;font-size:1.18rem;margin:.25rem 0}.wnba-snap:first-child strong{color:var(--g)}.wnba-snap:last-child strong{color:#f0c43f}.wnba-snap em{display:block;color:#dfe2e4;font-size:.59rem;font-style:normal}.wnba-rank-head{margin:.2rem 0 .45rem;padding:5px 2px}.wnba-rank-head strong{display:block;color:#fff;font-size:1.35rem;font-weight:900}.wnba-rank-head span{display:block;color:#b8b09f;font-size:.70rem;margin-top:1px}.wnba-sec{margin:8px 0 12px}.wnba-sec strong{font-size:1.18rem;font-weight:950}.wnba-sec span{display:block;color:#a7abb2;font-size:.72rem;margin-top:3px}.wnba-card{border:2px solid #34383d;border-left:6px solid var(--g);border-radius:15px;padding:.78rem;margin:.65rem 0 .28rem;background:linear-gradient(135deg,#101112,#0d0f10)}.wnba-grid{display:grid;grid-template-columns:42px 82px minmax(0,1fr);gap:8px}.wnba-rank{font-size:1rem;font-weight:950}.wnba-move{color:#a7abb2;font-size:.67rem;margin-top:.2rem}.wnba-photo{width:76px;height:76px;object-fit:contain;object-position:center bottom;border-radius:50%;background:#f6f6f6;border:3px solid rgba(214,179,92,.75)}.wnba-name{font-size:1.02rem;font-weight:950}.wnba-meta{color:#a7abb2;font-size:.7rem;margin:.2rem 0}.wnba-prop{font-size:.72rem;margin-top:.28rem}.wnba-prop b{color:#fff}.wnba-gold{color:#d6b35c;font-weight:900}.wnba-reason{color:#b7bbc0;font-size:.68rem;line-height:1.38;margin-top:.35rem}.wnba-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:.65rem 0 .15rem}.wnba-kpi{border:1.5px solid #34383d;border-radius:10px;padding:7px;background:#101112}.wnba-kpi:first-child{border-color:var(--g)}.wnba-kpi:nth-child(2){border-color:rgba(214,179,92,.8)}.wnba-kpi span{display:block;color:#a7abb2;font-size:.58rem}.wnba-kpi strong{font-size:.85rem}div[class*="st-key-wnba_games_entry"] button{width:100%!important;min-height:82px!important;padding:12px 15px!important;margin:4px 0 10px!important;text-align:left!important;justify-content:flex-start!important;border:1.5px solid rgba(214,179,92,.68)!important;border-left:5px solid #19d978!important;border-radius:13px!important;background:linear-gradient(112deg,rgba(246,200,76,.12),#0d0f10 36%,#0b0d0e 68%,rgba(25,217,120,.10))!important;color:#fff!important;font-weight:900!important}div[class*="st-key-wnba_player_open_"] button{width:100%!important;min-height:42px!important;background:#080909!important;color:#fff!important;border:1.5px solid #19d978!important;border-radius:10px!important;font-weight:850!important;margin:0 0 .75rem!important}[data-testid="stTabs"] [data-baseweb="tab-list"]{overflow-x:auto!important;scrollbar-width:none!important}[data-testid="stTabs"] [data-baseweb="tab"]{white-space:nowrap!important}@media(max-width:700px){.block-container{padding-top:0!important;padding-left:.85rem!important;padding-right:.85rem!important}.wnba-title{font-size:1.38rem}.wnba-grid{grid-template-columns:34px 70px minmax(0,1fr)}.wnba-photo{width:66px;height:66px}}
 </style>''',unsafe_allow_html=True)

def movement_state():
 try:
  return json.loads(WNBA_MOVEMENT_FILE.read_text()) if WNBA_MOVEMENT_FILE.exists() else {}
 except Exception:return {}

def apply_movement(df,cat):
 if df is None or df.empty:return df
 state=movement_state(); prev=state.get(cat,{}); cur={}; moves=[]
 for _,r in df.iterrows():
  pid=r.get('player_id'); key=str(int(pid)) if pd.notna(pid) else f"{r.get('player_name')}|{r.get('team')}"; rank=int(r.get('rank',0)); cur[key]=rank; old=prev.get(key)
  moves.append('NEW' if old is None else (f'↑ {int(old)-rank}' if int(old)>rank else (f'↓ {rank-int(old)}' if int(old)<rank else '—')))
 out=df.copy(); out['rank_movement']=moves; state[cat]=cur
 try:WNBA_MOVEMENT_FILE.write_text(json.dumps(state))
 except Exception:pass
 return out

def num(v):
 n=pd.to_numeric(v,errors='coerce'); return '—' if pd.isna(n) else f'{float(n):.1f}'

def render_card(r,prop):
 rank=int(r.get('rank',0)); pid=r.get('player_id'); name=escape(str(r.get('player_name','Unknown'))); team=escape(str(r.get('team','—'))); move=escape(str(r.get('rank_movement','—'))); metric=escape(str(r.get('metric_label','Per Game'))); gp=pd.to_numeric(r.get('games_played'),errors='coerce'); games='—' if pd.isna(gp) else str(int(gp)); img=f'<img class="wnba-photo" src="{wnba_headshot_url(int(pid))}">' if pd.notna(pid) else '<div class="wnba-photo"></div>'; reason=f"Ranks #{rank} in {prop} from the current {WNBA_BASELINE_SEASON} baseline, averaging {num(r.get('ranking_value'))} across {games} games."
 st.markdown(f'''<div class="wnba-card"><div class="wnba-grid"><div><div class="wnba-rank">#{rank}</div><div class="wnba-move">{move}</div></div><div>{img}</div><div><div class="wnba-name">{name}</div><div class="wnba-meta">{team} · {WNBA_BASELINE_SEASON} regular season</div><div class="wnba-prop"><b>{escape(prop)}</b> · <span class="wnba-gold">{metric} {num(r.get('ranking_value'))}</span></div><div class="wnba-reason">{escape(reason)}</div></div></div><div class="wnba-kpis"><div class="wnba-kpi"><span>{metric}</span><strong>{num(r.get('ranking_value'))}</strong></div><div class="wnba-kpi"><span>GAMES</span><strong>{games}</strong></div><div class="wnba-kpi"><span>MIN/G</span><strong>{num(r.get('minutes_per_game'))}</strong></div></div></div>''',unsafe_allow_html=True)
 if st.button('ⓘ View Intelligence',key=f'wnba_player_open_{prop}_{rank}_{pid}',use_container_width=True):
  st.session_state['wnba_selected_player']=r.to_dict(); st.session_state['wnba_selected_prop']=prop; st.switch_page('pages/wnba_player.py')

def render_market(prop):
 icon=PROP_ICONS[prop]; st.markdown(f'<div class="wnba-sec"><strong>{icon} {escape(prop)} Rankings</strong><span>Ranked from verified current-season evidence. Top 5 shown first.</span></div>',unsafe_allow_html=True)
 try:df=build_wnba_baseline_top25(prop,WNBA_BASELINE_SEASON,minimum_games=10)
 except Exception as e:st.warning('WNBA player data is temporarily unavailable.');st.caption(str(e));return
 df=apply_movement(df,prop)
 if df.empty:st.info('No qualified WNBA players are available for this market right now.');return
 show=st.session_state.get(f'wnba_show25_{prop}',False)
 for _,r in (df if show else df.head(5)).iterrows():render_card(r,prop)
 if st.button('Show Top 5' if show else 'Open full Top 25',key=f'wnba_toggle_{prop}',use_container_width=True):st.session_state[f'wnba_show25_{prop}']=not show;st.rerun()

def show():
 css(); st.markdown('''<section class="wnba-hero"><div class="wnba-kicker">WNBA</div><div class="wnba-title">WNBA Intelligence Center</div><div class="wnba-soft">Start with today’s strongest WNBA prop opportunities, review the reason behind every ranking, and open the full player card when you need more depth.</div></section>''',unsafe_allow_html=True); now=datetime.now(TORONTO_TZ); st.markdown(f'<div class="wnba-updated">Updated {now.strftime("%A · %I:%M %p ET")}</div>',unsafe_allow_html=True)
 if st.button("🏀 TODAY'S WNBA GAMES  ›  Open today's slate & Game Intelligence",key='wnba_games_entry',use_container_width=True):st.switch_page('pages/wnba_games.py')
 try:games=current_wnba_window(days_back=1,days_forward=14)
 except Exception:games=pd.DataFrame()
 today=games[pd.to_datetime(games['tipoff_et'],errors='coerce').dt.date.eq(now.date())].copy() if not games.empty else pd.DataFrame(); live=today[today['state'].eq('in')] if not today.empty else pd.DataFrame(); final=today[today['state'].eq('post')] if not today.empty else pd.DataFrame(); upcoming=today[today['state'].eq('pre')] if not today.empty else pd.DataFrame()
 st.markdown(f'''<div class="wnba-snapshot-title"><strong>Today's WNBA Snapshot</strong><span>Daily slate view</span></div><div class="wnba-snapshot"><div class="wnba-snap"><small>GAMES</small><strong>{len(today)}</strong><em>{len(live)} live · {len(final)} final</em></div><div class="wnba-snap"><small>UPCOMING</small><strong>{len(upcoming)}</strong><em>today</em></div><div class="wnba-snap"><small>SEASON</small><strong>{WNBA_SEASON}</strong><em>regular season</em></div></div>''',unsafe_allow_html=True)
 render_wnba_prediction_performance(); st.divider(); st.markdown('<div class="wnba-rank-head"><strong>Player Rankings</strong><span>Market-specific intelligence · current-season evidence</span></div>',unsafe_allow_html=True)
 tabs=st.tabs([f'{PROP_ICONS[p]} {p}' for p in WNBA_PROPS])
 for tab,prop in zip(tabs,WNBA_PROPS):
  with tab:render_market(prop)
 st.divider();st.caption('Sach Sports Dashboard · WNBA Intelligence')
show()
