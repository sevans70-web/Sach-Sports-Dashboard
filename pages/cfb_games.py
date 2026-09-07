from __future__ import annotations
from html import escape
from zoneinfo import ZoneInfo
import pandas as pd
import requests
import streamlit as st

TZ=ZoneInfo("America/Toronto")
SCOREBOARD="https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
ROSTER="https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/{team_id}/roster"

def html(x): st.markdown(" ".join(line.strip() for line in x.splitlines() if line.strip()),unsafe_allow_html=True)

@st.cache_data(ttl=180,show_spinner=False)
def games():
    r=requests.get(SCOREBOARD,params={"limit":150,"groups":80},timeout=20); r.raise_for_status(); rows=[]
    for e in r.json().get("events",[]):
        c=(e.get("competitions") or [{}])[0]; comps=c.get("competitors") or []; h=next((x for x in comps if x.get("homeAway")=="home"),{}); a=next((x for x in comps if x.get("homeAway")=="away"),{}); stt=(e.get("status") or {}).get("type") or {}; v=c.get("venue") or {}
        def team(x): return x.get("team") or {}
        rows.append({"game_id":e.get("id"),"kickoff":pd.to_datetime(e.get("date"),errors="coerce",utc=True),"away_team":team(a).get("displayName","Away"),"home_team":team(h).get("displayName","Home"),"away_id":team(a).get("id"),"home_id":team(h).get("id"),"away_logo":team(a).get("logo") or "","home_logo":team(h).get("logo") or "","away_score":a.get("score"),"home_score":h.get("score"),"status":stt.get("shortDetail") or stt.get("description") or "Scheduled","completed":bool(stt.get("completed")),"venue":v.get("fullName") or "Venue TBD","indoor":bool(v.get("indoor"))})
    df=pd.DataFrame(rows)
    if not df.empty:
        today=pd.Timestamp.now(tz=TZ).date(); local=df["kickoff"].dt.tz_convert(TZ).dt.date
        # Today's games plus future games only. Yesterday and older disappear automatically.
        df=df[local>=today].copy().sort_values(["kickoff","game_id"],kind="stable")
    return df

@st.cache_data(ttl=900,show_spinner=False)
def roster(team_id):
    if not team_id:return []
    try:
        r=requests.get(ROSTER.format(team_id=team_id),timeout=20); r.raise_for_status(); data=r.json(); out=[]
        for group in data.get("athletes",[]) or []:
            group_pos=str(group.get("position") or "")
            for a in group.get("items",[]) or []:
                pos=((a.get("position") or {}).get("abbreviation") or group_pos or "").upper()
                out.append({"name":a.get("fullName") or a.get("displayName") or "Player","pos":pos,"jersey":a.get("jersey") or "","headshot":((a.get("headshot") or {}).get("href") or "")})
        order={"QB":0,"RB":1,"WR":2,"TE":3,"OL":4,"OT":4,"OG":4,"C":4,"DE":5,"DT":5,"DL":5,"LB":6,"CB":7,"S":8,"K":9,"P":10}
        return sorted(out,key=lambda x:(order.get(x["pos"],50),x["name"]))
    except Exception:return []

def qb(team_id):
    return next((p["name"] for p in roster(team_id) if p["pos"]=="QB"),"QB TBD")

def when(v):
    x=pd.to_datetime(v,errors="coerce",utc=True); return "Kickoff TBD" if pd.isna(x) else x.tz_convert(TZ).strftime("%I:%M %p ET").lstrip("0")

def team_roster(team_id):
    rows=roster(team_id)
    if not rows: st.caption("Roster is temporarily unavailable."); return
    for p in rows:
        pic=f'<img src="{escape(p["headshot"])}">' if p["headshot"] else '<span>🏈</span>'
        html(f'<div class="cfb-player">{pic}<div><b>{escape(p["name"])}</b><small>{escape(p["pos"])}{(" · #"+escape(p["jersey"])) if p["jersey"] else ""}</small></div></div>')

def css():
    st.markdown('''<style>
    .block-container{max-width:1100px;padding-top:.15rem!important}.cfb-hero{padding:12px 14px;border:2px solid #8c64aa;border-radius:15px;background:linear-gradient(110deg,rgba(216,179,95,.15),#0b0c0d 48%,rgba(91,54,119,.26));margin:3px 0 11px}.cfb-hero h1{margin:0;color:#fff;font-size:1.4rem}.cfb-hero p{margin:6px 0 0;color:#c7c9ce;font-size:.78rem}.day{color:#d8b35f;font-size:.84rem;font-weight:950;margin:16px 0 7px;text-transform:uppercase;letter-spacing:.06em}
    .cfb-card{background:linear-gradient(118deg,#101112,#111315 68%,rgba(140,100,170,.08));border:1.5px solid #30343a;border-left:4px solid #8c64aa;border-radius:13px;padding:9px 11px;margin:7px 0 4px}.top{display:flex;justify-content:space-between;gap:8px;color:#92979f;font-size:.67rem;font-weight:800;padding-bottom:7px;border-bottom:1px solid #292c31}.status{color:#d8b35f}.team{display:grid;grid-template-columns:42px minmax(0,1fr) 38px;align-items:center;gap:9px;padding:7px 0 2px}.team img{width:38px;height:38px;object-fit:contain}.team b{color:#fff;font-size:.88rem}.team span{display:block;color:#a7abb2;font-size:.67rem;margin-top:2px}.score{text-align:right!important;font-size:1rem!important}.intel{margin:7px 0 10px;padding:11px;border:1px solid #43364e;border-radius:12px;background:#131016}.intel b{color:#d8b35f}.intel p{color:#d6d9dd;font-size:.75rem;line-height:1.45}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.metric{padding:7px;background:#101214;border:1px solid #30343a;border-bottom:2px solid #8c64aa;border-radius:8px}.metric small{display:block;color:#92979e;font-size:.52rem}.metric strong{color:#fff;font-size:.72rem}.cfb-player{display:flex;align-items:center;gap:9px;background:#101112;border:1px solid #30343a;border-radius:9px;padding:7px;margin:5px 0}.cfb-player img,.cfb-player>span{width:34px;height:34px;object-fit:cover;border-radius:50%;display:flex;align-items:center;justify-content:center}.cfb-player b{display:block;color:#fff;font-size:.75rem}.cfb-player small{display:block;color:#a7abb2;font-size:.62rem}
    div[class*="st-key-cfb_game_select_"] button{background:#080909!important;color:#d8b35f!important;border:1px solid rgba(216,179,95,.58)!important;border-radius:9px!important;min-height:34px!important}.block-container div[class*="st-key-back_to_cfb"]{display:flex!important;justify-content:flex-end!important;margin:-48px 0 9px auto!important;width:auto!important}div[class*="st-key-back_to_cfb"] button{background:#080909!important;color:#fff!important;border:1px solid #34373c!important;border-radius:9px!important}
    @media(max-width:700px){.block-container{padding-left:.85rem!important;padding-right:.85rem!important}.team{grid-template-columns:38px minmax(0,1fr) 34px}.team img{width:34px;height:34px}.block-container div[class*="st-key-back_to_cfb"]{margin:-78px 0 9px auto!important}}
    </style>''',unsafe_allow_html=True)

def show():
    css()
    if st.button("← Back to CFB",key="back_to_cfb"): st.switch_page("pages/cfb.py")
    html('<div class="cfb-hero"><h1>🏈 College Football Games</h1><p>Choose a matchup for live game context, Game Intelligence and either team roster.</p></div>')
    try: df=games()
    except Exception: st.error("The CFB schedule feed is temporarily unavailable."); return
    if df.empty: st.info("No CFB games remain on the current slate."); return
    selected=st.session_state.get("cfb_selected_game")
    df["day"]=df["kickoff"].dt.tz_convert(TZ).dt.normalize()
    for di,d in enumerate(df["day"].drop_duplicates()):
        html(f'<div class="day">{pd.to_datetime(d).strftime("%A · %B %d")}</div>')
        for gi,(_,g) in enumerate(df[df["day"].eq(d)].iterrows()):
            gid=str(g["game_id"]); status=str(g["status"]); live=not g["completed"] and any(x in status.lower() for x in ["qtr","quarter","half","ot"," - ","1st","2nd","3rd","4th"])
            def row(side):
                name=str(g[f"{side}_team"]); logo=str(g[f"{side}_logo"]); score=g[f"{side}_score"] if (g["completed"] or live) else ""; starter=qb(g[f"{side}_id"])
                return f'<div class="team"><img src="{escape(logo)}"><div><b>{escape(name)}</b><span>QB · {escape(starter)}</span></div><b class="score">{escape(str(score or ""))}</b></div>'
            html(f'<div class="cfb-card"><div class="top"><span class="status">{escape(status)}</span><span>{escape(str(g["venue"]))} · {escape(when(g["kickoff"]))}</span></div>{row("away")}{row("home")}</div>')
            if st.button("Hide Game Intelligence" if selected==gid else "View Game Intelligence",key=f"cfb_game_select_{di}_{gi}_{gid}",use_container_width=True): st.session_state["cfb_selected_game"]=None if selected==gid else gid; st.rerun()
            if st.session_state.get("cfb_selected_game")==gid:
                env="Indoor" if g["indoor"] else "Outdoor"
                html(f'<div class="intel"><b>🔥 Game Intelligence</b><p>{escape(str(g["away_team"]))} at {escape(str(g["home_team"]))}. Live status, starting-quarterback context and team rosters are shown from the current ESPN game feed.</p><div class="metrics"><div class="metric"><small>KICKOFF</small><strong>{escape(when(g["kickoff"]))}</strong></div><div class="metric"><small>VENUE</small><strong>{escape(str(g["venue"]))}</strong></div><div class="metric"><small>ENVIRONMENT</small><strong>{env}</strong></div></div></div>')
                a,h=st.tabs([str(g["away_team"]),str(g["home_team"])])
                with a: team_roster(g["away_id"])
                with h: team_roster(g["home_id"])
show()
