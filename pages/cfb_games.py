from __future__ import annotations
from html import escape
from zoneinfo import ZoneInfo
from datetime import datetime, timedelta
import pandas as pd
import requests
import streamlit as st

TZ=ZoneInfo("America/Toronto")
SCOREBOARD="https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
ROSTER="https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/{team_id}/roster"

def html(x): st.markdown(" ".join(line.strip() for line in x.splitlines() if line.strip()),unsafe_allow_html=True)

@st.cache_data(ttl=900,show_spinner=False)
def games():
    # ESPN defaults can collapse to the current day. Ask explicitly for the
    # upcoming two-week window so Thursday/Saturday and next-week games remain visible.
    start=pd.Timestamp.now(tz=TZ).date()
    end=start+timedelta(days=14)
    date_range=f"{start.strftime('%Y%m%d')}-{end.strftime('%Y%m%d')}"
    r=requests.get(SCOREBOARD,params={"limit":300,"groups":80,"dates":date_range},timeout=20); r.raise_for_status(); rows=[]
    for e in r.json().get("events",[]):
        c=(e.get("competitions") or [{}])[0]; comps=c.get("competitors") or []; h=next((x for x in comps if x.get("homeAway")=="home"),{}); a=next((x for x in comps if x.get("homeAway")=="away"),{}); stt=(e.get("status") or {}).get("type") or {}; v=c.get("venue") or {}
        def team(x): return x.get("team") or {}
        def rec(x):
            rs=x.get("records") or []
            return str((rs[0] or {}).get("summary") or "") if rs else ""
        def rank(x):
            try:
                value=int(((x.get("curatedRank") or {}).get("current")) or 0)
                return value if 0 < value <= 25 else None
            except Exception:
                return None
        rows.append({"game_id":e.get("id"),"kickoff":pd.to_datetime(e.get("date"),errors="coerce",utc=True),"away_team":team(a).get("displayName","Away"),"home_team":team(h).get("displayName","Home"),"away_id":team(a).get("id"),"home_id":team(h).get("id"),"away_logo":team(a).get("logo") or "","home_logo":team(h).get("logo") or "","away_score":a.get("score"),"home_score":h.get("score"),"away_record":rec(a),"home_record":rec(h),"away_rank":rank(a),"home_rank":rank(h),"status":stt.get("shortDetail") or stt.get("description") or "Scheduled","state":str(stt.get("state") or "pre"),"completed":bool(stt.get("completed")),"venue":v.get("fullName") or "Venue TBD","indoor":bool(v.get("indoor"))})
    df=pd.DataFrame(rows)
    if not df.empty:
        today=pd.Timestamp.now(tz=TZ).date(); local=df["kickoff"].dt.tz_convert(TZ).dt.date
        # Today's games plus future games only. Yesterday and older disappear automatically.
        df=df[local>=today].copy().sort_values(["kickoff","game_id"],kind="stable")
    return df

@st.cache_data(ttl=3600,show_spinner=False)
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
    .block-container{max-width:1100px;padding-top:.15rem!important}
    .cfb-hero{margin:4px 0 10px;padding:11px 12px;border-radius:13px;border:1.5px solid rgba(25,217,120,.58);background:linear-gradient(115deg,#101112,#111315 68%,rgba(246,200,76,.07))}
    .cfb-hero h1{margin:0;color:#fff;font-size:1.25rem;font-weight:950}
    .cfb-hero p{margin:4px 0 0;color:#a7abb2;font-size:.74rem;line-height:1.3}
    .day{color:#f6c84c;font-size:.84rem;font-weight:950;margin:16px 0 7px;text-transform:uppercase;letter-spacing:.06em}
    .cfb-card{background:linear-gradient(118deg,#101112 0%,#111315 68%,rgba(25,217,120,.055) 100%);border:1.5px solid #30343a;border-radius:13px;padding:10px 11px 8px;margin:8px 0 4px}
    .cfb-card.selected{border-color:#d6b35c;box-shadow:0 0 0 1px rgba(214,179,92,.14)}.cfb-card.live{border-color:#19d978;box-shadow:0 0 0 1px rgba(25,217,120,.18),0 0 18px rgba(25,217,120,.08)}
    .top{display:flex;justify-content:space-between;gap:8px;color:#8f949c;font-size:.68rem;font-weight:750;padding-bottom:7px;border-bottom:1px solid #292c31}
    .status{font-weight:900!important}.status-live{color:#19d978!important}.status-pre{color:#f6c84c!important}.status-post{color:#a7abb2!important}
    .team{display:grid;grid-template-columns:42px minmax(0,1fr) 44px;align-items:center;gap:9px;padding:8px 0 3px}
    .team + .team{padding-top:6px}.team img{width:38px;height:38px;object-fit:contain;display:block}.team b{color:#fff;font-size:.92rem;line-height:1.12;font-weight:900}.team span{display:block;color:#a7abb2;font-size:.70rem;line-height:1.2;margin-top:2px}.score{text-align:right!important;font-size:1rem!important;font-weight:950!important}
    .intel{margin:9px 0 14px;padding:13px;border:1.5px solid rgba(214,179,92,.66);border-radius:15px;background:linear-gradient(118deg,#0b0c0d,#101214 72%,rgba(25,217,120,.05));box-shadow:0 8px 24px rgba(0,0,0,.20)}.intel b{color:#f6c84c}.intel p{color:#d6d9dd;font-size:.75rem;line-height:1.45}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.metric{padding:7px;background:#111315;border:1px solid #30343a;border-bottom:2px solid #19d978;border-radius:8px}.metric small{display:block;color:#92979e;font-size:.52rem}.metric strong{color:#fff;font-size:.72rem}.cfb-player{display:flex;align-items:center;gap:9px;background:#101112;border:1px solid #30343a;border-radius:9px;padding:7px;margin:5px 0}.cfb-player img,.cfb-player>span{width:34px;height:34px;object-fit:cover;border-radius:50%;display:flex;align-items:center;justify-content:center}.cfb-player b{display:block;color:#fff;font-size:.75rem}.cfb-player small{display:block;color:#a7abb2;font-size:.62rem}
    div[class*="st-key-cfb_game_select_"]{margin:0 0 7px!important}div[class*="st-key-cfb_game_select_"] button{min-height:34px!important;padding:.18rem .55rem!important;background:#080909!important;color:#f6c84c!important;border:1px solid rgba(214,179,92,.58)!important;border-radius:9px!important;font-size:.72rem!important;font-weight:850!important}
    .block-container div[class*="st-key-back_to_cfb"]{display:flex!important;justify-content:flex-end!important;margin:0 0 9px auto!important;width:auto!important}div[class*="st-key-back_to_cfb"] button{background:#080909!important;color:#fff!important;border:1px solid #34373c!important;border-radius:9px!important}
    @media(max-width:700px){.block-container{padding-left:.85rem!important;padding-right:.85rem!important}.cfb-hero{margin-top:.2rem!important}.team{grid-template-columns:38px minmax(0,1fr) 36px;gap:8px}.team img{width:34px;height:34px}.team b{font-size:.88rem}.team span{font-size:.67rem}.block-container div[class*="st-key-back_to_cfb"]{margin:0 0 9px auto!important}}
    </style>''',unsafe_allow_html=True)



def _matchup_intelligence(g) -> str:
    away=str(g.get("away_team") or "Away")
    home=str(g.get("home_team") or "Home")
    aq=qb(g.get("away_id")); hq=qb(g.get("home_id"))
    ar=g.get("away_rank"); hr=g.get("home_rank")
    arec=str(g.get("away_record") or "").strip(); hrec=str(g.get("home_record") or "").strip()
    away_label=(f"No. {int(ar)} {away}" if ar else away) + (f" ({arec})" if arec else "")
    home_label=(f"No. {int(hr)} {home}" if hr else home) + (f" ({hrec})" if hrec else "")
    ranking_note=""
    if ar and not hr:
        ranking_note=f" {away} enters as the ranked side, while {home} has the home-field setting."
    elif hr and not ar:
        ranking_note=f" {home} enters as the ranked side and also owns the home-field setting."
    elif ar and hr:
        ranking_note=f" This is a ranked matchup: No. {int(ar)} versus No. {int(hr)}."
    qb_note=f" Quarterback watch: {aq} ({away}) versus {hq} ({home})."
    state=str(g.get("state") or "pre").lower()
    if ar and hr:
        matchup_read=f"The ranking gap is {abs(int(ar)-int(hr))} spots, so neither side should be treated as a routine matchup on ranking alone."
    elif ar or hr:
        ranked_team=away if ar else home
        matchup_read=f"{ranked_team} is the ranked side; the key pregame question is whether that ranking edge holds once quarterback play and home field are accounted for."
    else:
        matchup_read="Neither team carries a current Top-25 marker in this feed, so quarterback execution, turnover control and home field carry more weight than national ranking."
    timing=" Pregame: use this as matchup context until live possession and score information exists." if state=="pre" else (" Live: weigh the current score/clock with the pregame matchup rather than treating the pregame read as static." if state=="in" else " Final: use the completed result when grading the prediction record.")
    return f"{away_label} at {home_label}, {g.get('venue') or 'venue TBD'}.{ranking_note}{qb_note} {matchup_read}{timing}"

def show():
    css()
    if st.button("← Back to CFB",key="back_to_cfb"): st.switch_page("pages/cfb.py")
    html('<div class="cfb-hero"><h1>🏈 College Football Games</h1><p>Choose a matchup for live game context, Game Intelligence and either team roster.</p></div>')
    try:
        # Keep the game slate independent from sportsbook availability.
        # SportsGameOdds powers player props; ESPN powers games, live status and rosters.
        df=games()
    except Exception:
        st.error("The CFB schedule is temporarily unavailable."); return
    if df.empty:
        st.info("No upcoming CFB games are currently listed."); return
    selected=st.session_state.get("cfb_selected_game")
    df["day"]=df["kickoff"].dt.tz_convert(TZ).dt.normalize()
    for di,d in enumerate(df["day"].drop_duplicates()):
        html(f'<div class="day">{pd.to_datetime(d).strftime("%A · %B %d")}</div>')
        for gi,(_,g) in enumerate(df[df["day"].eq(d)].iterrows()):
            gid=str(g["game_id"]); status=str(g["status"]); state=str(g.get("state") or "pre").lower(); live=(state=="in") and not bool(g["completed"])
            def row(side):
                name=str(g[f"{side}_team"]); logo=str(g[f"{side}_logo"]); score=g[f"{side}_score"] if (g["completed"] or live) else ""; starter=qb(g[f"{side}_id"])
                return f'<div class="team"><img src="{escape(logo)}"><div><b>{escape(name)}</b><span>QB · {escape(starter)}</span></div><b class="score">{escape(str(score or ""))}</b></div>'
            selected_now=st.session_state.get("cfb_selected_game")==gid
            classes=[]
            if selected_now: classes.append("selected")
            if live: classes.append("live")
            class_attr=(" "+" ".join(classes)) if classes else ""
            state_class="status-live" if live else ("status-post" if bool(g["completed"]) or state=="post" else "status-pre")
            html(f'<div class="cfb-card{class_attr}"><div class="top"><span class="status {state_class}">{escape(status.upper())}</span><span>{escape(str(g["venue"]))} · {escape(when(g["kickoff"]))}</span></div>{row("away")}{row("home")}</div>')
            abbr_away="".join(word[0] for word in str(g["away_team"]).split()[:3]).upper() or "AWAY"
            abbr_home="".join(word[0] for word in str(g["home_team"]).split()[:3]).upper() or "HOME"
            if st.button("Hide Game Intelligence" if selected_now else f"View {abbr_away} @ {abbr_home}  →",key=f"cfb_game_select_{di}_{gi}_{gid}",use_container_width=True): st.session_state["cfb_selected_game"]=None if selected_now else gid; st.rerun()
            if st.session_state.get("cfb_selected_game")==gid:
                env="Indoor" if g["indoor"] else "Outdoor"
                analysis=_matchup_intelligence(g)
                html(f'<div class="intel"><b>🔥 Game Intelligence</b><p>{escape(analysis)}</p><div class="metrics"><div class="metric"><small>KICKOFF</small><strong>{escape(when(g["kickoff"]))}</strong></div><div class="metric"><small>VENUE</small><strong>{escape(str(g["venue"]))}</strong></div><div class="metric"><small>ENVIRONMENT</small><strong>{env}</strong></div></div></div>')
                a,h=st.tabs([str(g["away_team"]),str(g["home_team"])])
                with a: team_roster(g["away_id"])
                with h: team_roster(g["home_id"])
show()
