"""Weekly NFL slate and game-intelligence drill-down."""
from __future__ import annotations

from html import escape

import pandas as pd
import streamlit as st

from data.nfl_roster import load_nfl_roster
from data.nfl_schedule import load_nfl_schedule
from data.nfl_team_logos import nfl_team_logo_url
from engines.nfl_game_intelligence import build_matchup_intelligence

NFL_SEASON = 2026
BASELINE_SEASON = 2025

TEAM_NAMES = {
    "ARI":"Arizona Cardinals","ATL":"Atlanta Falcons","BAL":"Baltimore Ravens","BUF":"Buffalo Bills",
    "CAR":"Carolina Panthers","CHI":"Chicago Bears","CIN":"Cincinnati Bengals","CLE":"Cleveland Browns",
    "DAL":"Dallas Cowboys","DEN":"Denver Broncos","DET":"Detroit Lions","GB":"Green Bay Packers",
    "HOU":"Houston Texans","IND":"Indianapolis Colts","JAX":"Jacksonville Jaguars","KC":"Kansas City Chiefs",
    "LAC":"Los Angeles Chargers","LAR":"Los Angeles Rams","LV":"Las Vegas Raiders","MIA":"Miami Dolphins",
    "MIN":"Minnesota Vikings","NE":"New England Patriots","NO":"New Orleans Saints","NYG":"New York Giants",
    "NYJ":"New York Jets","PHI":"Philadelphia Eagles","PIT":"Pittsburgh Steelers","SEA":"Seattle Seahawks",
    "SF":"San Francisco 49ers","TB":"Tampa Bay Buccaneers","TEN":"Tennessee Titans","WAS":"Washington Commanders",
}


def _render_html(html: str) -> None:
    st.markdown(" ".join(line.strip() for line in html.splitlines() if line.strip()), unsafe_allow_html=True)


def _time_label(value) -> str:
    kickoff = pd.to_datetime(value, errors="coerce")
    if pd.isna(kickoff):
        return "Kickoff TBD"
    return kickoff.strftime("%I:%M %p ET").lstrip("0")


def _css() -> None:
    st.markdown(
        """
        <style>
        .block-container{max-width:1100px;padding-top:.15rem!important}
        .nfl-games-hero{margin:4px 0 10px;padding:11px 12px;border-radius:13px;border:1.5px solid rgba(25,217,120,.58);background:linear-gradient(115deg,#101112,#111315 68%,rgba(246,200,76,.07))}
        .nfl-games-hero h1{margin:0;color:#fff;font-size:1.25rem;font-weight:950}
        .nfl-games-hero p{margin:4px 0 0;color:#a7abb2;font-size:.74rem;line-height:1.3}
        .nfl-day-heading{color:#f6c84c;font-size:.84rem;font-weight:900;margin:16px 0 7px;text-transform:uppercase;letter-spacing:.06em}

        .nfl-slate-card{background:linear-gradient(118deg,#101112 0%,#111315 68%,rgba(25,217,120,.055) 100%);border:1.5px solid #30343a;border-radius:13px;padding:10px 11px 8px;margin:8px 0 4px}
        .nfl-slate-card.selected{border-color:#19d978;box-shadow:inset 0 0 0 1px rgba(25,217,120,.18)}
        .nfl-slate-top{display:flex;justify-content:space-between;gap:8px;color:#8f949c;font-size:.68rem;font-weight:750;padding-bottom:7px;border-bottom:1px solid #292c31}
        .nfl-slate-status{color:#19d978!important;font-weight:900!important}
        .nfl-slate-team{display:grid;grid-template-columns:42px minmax(0,1fr) 44px;align-items:center;gap:9px;padding:8px 0 3px}
        .nfl-slate-team + .nfl-slate-team{padding-top:6px}
        .nfl-slate-logo{width:38px;height:38px;object-fit:contain;display:block}
        .nfl-slate-team-main{min-width:0}
        .nfl-slate-team-main strong{display:block;color:#fff;font-size:.92rem;line-height:1.12;font-weight:900}
        .nfl-slate-team-main span{display:block;color:#a7abb2;font-size:.70rem;line-height:1.2;margin-top:2px}
        .nfl-slate-team>b{color:#fff;font-size:1rem;text-align:right;font-weight:950}
        div[class*="st-key-nfl_game_select_"]{margin:0 0 7px!important}
        div[class*="st-key-nfl_game_select_"] button{min-height:34px!important;padding:.18rem .55rem!important;background:#080909!important;color:#f6c84c!important;border:1px solid rgba(214,179,92,.58)!important;border-radius:9px!important;font-size:.72rem!important;font-weight:850!important}

        .nfl-intel-shell{margin:9px 0 14px;padding:13px;border:1.5px solid rgba(214,179,92,.66);border-radius:15px;background:linear-gradient(118deg,#0b0c0d,#101214 72%,rgba(25,217,120,.05));box-shadow:0 8px 24px rgba(0,0,0,.20)}
        .nfl-matchup-head{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:8px;align-items:center;padding-bottom:10px;border-bottom:1px solid #292d31}
        .nfl-team{display:flex;align-items:center;gap:8px;min-width:0}.nfl-team.home{justify-content:flex-end}.nfl-team img{width:42px;height:42px;object-fit:contain}.nfl-team strong{font-size:1.05rem;color:#fff}.nfl-at{color:#888f96;font-size:.72rem;font-weight:900}
        .nfl-rundown{margin:10px 0 0;color:#d8dadd;font-size:.78rem;line-height:1.48}.nfl-rundown b{color:#f6c84c}
        .nfl-game-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:10px 0}.nfl-game-metric{background:#111315;border:1px solid #30343a;border-bottom:2px solid #19d978;border-radius:9px;padding:8px;min-width:0}.nfl-game-metric span{display:block;color:#92979e;font-size:.57rem}.nfl-game-metric strong{display:block;color:#fff;font-size:.80rem;margin-top:3px;white-space:normal}
        .nfl-scout{margin:9px 0 2px;padding:9px 10px;border:1px solid #2d3136;border-radius:10px;background:#0d0f10}.nfl-scout-title{color:#f6c84c;font-size:.72rem;font-weight:950;margin-bottom:6px}.nfl-signal{color:#c9cdd1;font-size:.70rem;line-height:1.42;margin:3px 0}
        div[class*="st-key-game_player_"] button{background:#101112!important;color:#fff!important;border:1px solid #30343a!important;border-radius:9px!important;min-height:42px!important;font-weight:800!important;text-align:left!important;justify-content:flex-start!important}
        div[class*="st-key-back_to_nfl"] button{background:#080909!important;color:#fff!important;border:1px solid #34373c!important;border-radius:9px!important}
        @media(max-width:700px){
          .block-container{padding-left:.85rem!important;padding-right:.85rem!important}
          div[class*="st-key-back_to_nfl"]{display:flex!important;justify-content:flex-end!important;width:auto!important;margin:-48px 0 8px auto!important}
          .nfl-games-hero{margin-top:.2rem!important}
          .nfl-slate-card{padding:9px 10px 7px}.nfl-slate-team{grid-template-columns:38px minmax(0,1fr) 36px;gap:8px}.nfl-slate-logo{width:34px;height:34px}.nfl-slate-team-main strong{font-size:.88rem}.nfl-slate-team-main span{font-size:.67rem}
          .nfl-game-metrics{gap:4px}.nfl-team img{width:34px;height:34px}.nfl-team strong{font-size:.92rem}.nfl-scout{padding:8px}.nfl-signal{padding:6px 0;margin:0;border-bottom:1px solid #272b30;font-size:.68rem}.nfl-signal:last-child{border-bottom:0}
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _load_phase(phase: str) -> pd.DataFrame:
    try:
        df = load_nfl_schedule(NFL_SEASON, phase).copy()
        if not df.empty:
            df["kickoff_et"] = pd.to_datetime(df["kickoff_et"], errors="coerce")
        return df
    except Exception:
        return pd.DataFrame()


def _open_player(row: pd.Series, matchup: str) -> None:
    player = row.to_dict(); player["game"] = matchup
    st.session_state["nfl_selected_player"] = player
    st.switch_page("pages/nfl_player.py")


def _select_game(game_id: str) -> None:
    current = str(st.session_state.get("nfl_selected_game") or "")
    st.session_state["nfl_selected_game"] = None if current == str(game_id) else str(game_id)
    if st.query_params.get("nfl_game"):
        st.query_params.clear()


def _starting_qb(team: str, roster: pd.DataFrame) -> str:
    if roster.empty:
        return "QB TBD"
    pool = roster[(roster["team"].astype(str).str.upper() == team.upper()) & (roster["position"] == "QB")].copy()
    if pool.empty:
        return "QB TBD"
    if "status" in pool.columns:
        active = pool[~pool["status"].astype(str).str.lower().isin(["injured reserve", "reserve", "retired"])]
        if not active.empty:
            pool = active
    return str(pool.iloc[0].get("player_name") or "QB TBD")


def _score(game: pd.Series, side: str) -> str:
    value = game.get(f"{side}_score")
    return "" if pd.isna(value) else str(int(value) if float(value).is_integer() else value)


def _status(game: pd.Series) -> str:
    raw = str(game.get("status") or "Scheduled")
    if raw.lower() == "final": return "FINAL"
    return raw.upper() if raw else "SCHEDULED"


def _render_game_card(game: pd.Series, roster: pd.DataFrame, selected: bool, key: str) -> None:
    away = str(game.get("away_team") or "").upper(); home = str(game.get("home_team") or "").upper()
    away_name = TEAM_NAMES.get(away, away); home_name = TEAM_NAMES.get(home, home)
    away_logo = nfl_team_logo_url(away); home_logo = nfl_team_logo_url(home)
    when = _time_label(game.get("kickoff_et")); stadium = str(game.get("stadium") or "Venue TBD")
    status = _status(game)
    show_score = status == "FINAL"
    selected_class = " selected" if selected else ""
    card = f'''
    <div class="nfl-slate-card{selected_class}">
      <div class="nfl-slate-top"><span class="nfl-slate-status">{escape(status)}</span><span>{escape(stadium)} · {escape(when)}</span></div>
      <div class="nfl-slate-team"><img class="nfl-slate-logo" src="{escape(away_logo)}"><div class="nfl-slate-team-main"><strong>{escape(away_name)}</strong><span>QB · {escape(_starting_qb(away, roster))}</span></div><b>{escape(_score(game,"away") if show_score else "")}</b></div>
      <div class="nfl-slate-team"><img class="nfl-slate-logo" src="{escape(home_logo)}"><div class="nfl-slate-team-main"><strong>{escape(home_name)}</strong><span>QB · {escape(_starting_qb(home, roster))}</span></div><b>{escape(_score(game,"home") if show_score else "")}</b></div>
    </div>'''
    st.html(card)
    st.button("Hide Game Intelligence" if selected else f"View {away} @ {home}  →", key=key, use_container_width=True, on_click=_select_game, args=(str(game.get("game_id")),))


def _player_buttons(team: str, matchup: str, key_prefix: str) -> None:
    try: roster = load_nfl_roster(NFL_SEASON)
    except Exception:
        st.info("Player roster is temporarily unavailable."); return
    players = roster[roster["team"].astype(str).str.upper().eq(team.upper())].copy()
    pos_order = {"QB":0,"RB":1,"WR":2,"TE":3,"DE":4,"DT":4,"DL":4,"NT":4,"LB":5,"OLB":5,"ILB":5,"CB":6,"DB":6,"S":7,"FS":7,"SS":7}
    players["_pos_order"] = players["position"].map(pos_order).fillna(50)
    players = players.sort_values(["_pos_order","player_name"], kind="stable")
    if players.empty: return
    offense = players[players["position"].isin(["QB", "RB", "WR", "TE"])].copy(); defense = players[players["position"].isin(["DE", "DT", "DL", "NT", "LB", "OLB", "ILB", "CB", "DB", "S", "FS", "SS"])].copy()
    pool = pd.concat([offense, defense.head(10)], ignore_index=True).drop_duplicates("player_id")
    cols = st.columns(2)
    for i, (_, row) in enumerate(pool.iterrows()):
        with cols[i % 2]:
            label = f"{row.get('player_name','Player')} · {row.get('position','')}"
            if st.button(label, key=f"game_player_{key_prefix}_{i}_{row.get('player_id')}", use_container_width=True): _open_player(row, matchup)


def _render_game_intelligence(game: pd.Series, game_id: str) -> None:
    away = str(game.get("away_team") or "").upper(); home = str(game.get("home_team") or "").upper(); when = _time_label(game.get("kickoff_et")); stadium = str(game.get("stadium") or "Venue TBD"); roof = str(game.get("roof") or "Environment TBD").replace("outdoors", "Outdoor").replace("dome", "Dome")
    intel = build_matchup_intelligence(away, home, BASELINE_SEASON); away_logo = nfl_team_logo_url(away); home_logo = nfl_team_logo_url(home); signals = "".join(f'<div class="nfl-signal">• {escape(s)}</div>' for s in intel.get("signals", [])[:4])
    _render_html(f'''<div class="nfl-intel-shell"><div class="nfl-matchup-head"><div class="nfl-team"><img src="{escape(away_logo)}"><strong>{escape(away)}</strong></div><div class="nfl-at">AT</div><div class="nfl-team home"><strong>{escape(home)}</strong><img src="{escape(home_logo)}"></div></div><div class="nfl-rundown"><b>Game Rundown</b><br>{escape(intel.get('rundown','Matchup context is loading.'))}</div><div class="nfl-game-metrics"><div class="nfl-game-metric"><span>KICKOFF</span><strong>{escape(when)}</strong></div><div class="nfl-game-metric"><span>VENUE</span><strong>{escape(stadium)}</strong></div><div class="nfl-game-metric"><span>ENVIRONMENT</span><strong>{escape(roof)}</strong></div></div><div class="nfl-scout"><div class="nfl-scout-title">SCOUT DESK · MATCHUP SIGNALS</div>{signals or '<div class="nfl-signal">More matchup signals will populate as Week 1 data arrives.</div>'}</div></div>''')
    away_tab, home_tab = st.tabs([away, home])
    with away_tab: _player_buttons(away, f"{away} @ {home}", f"{game_id}_away")
    with home_tab: _player_buttons(home, f"{away} @ {home}", f"{game_id}_home")


def show() -> None:
    _css()
    if st.button("← Back to NFL", key="back_to_nfl"): st.switch_page("pages/nfl.py")
    phase = str(st.session_state.get("nfl_active_phase") or "REG"); week = st.session_state.get("nfl_active_week"); schedule = _load_phase(phase)
    if schedule.empty:
        st.error("The NFL schedule feed is temporarily unavailable. Return to NFL and refresh the page."); return
    weeks = sorted(pd.to_numeric(schedule["week"], errors="coerce").dropna().astype(int).unique())
    if week is None or int(week) not in weeks: week = weeks[0] if weeks else None
    if week is None:
        st.error("No NFL week is available yet."); return
    games = schedule[pd.to_numeric(schedule["week"], errors="coerce").eq(int(week))].copy().sort_values(["kickoff_et", "game_id"], kind="stable")
    _render_html(f'<div class="nfl-games-hero"><h1>🏈 Week {int(week)} NFL Games</h1><p>Choose a matchup to open Game Intelligence, team rosters and matchup details.</p></div>')
    try: roster = load_nfl_roster(NFL_SEASON)
    except Exception: roster = pd.DataFrame()
    query_selected = st.query_params.get("nfl_game")
    if query_selected: st.session_state["nfl_selected_game"] = str(query_selected)
    selected_id = st.session_state.get("nfl_selected_game")
    games["day_key"] = games["kickoff_et"].dt.normalize()
    for day_index, day_key in enumerate(games["day_key"].drop_duplicates().tolist()):
        day_games = games[games["day_key"].eq(day_key)].sort_values("kickoff_et", kind="stable"); day = pd.to_datetime(day_key, errors="coerce"); day_label = f"{day.strftime('%A')} · {day.strftime('%B')} {day.day}" if pd.notna(day) else "Kickoff TBD"; _render_html(f'<div class="nfl-day-heading">{escape(day_label)}</div>')
        for game_index, (_, game) in enumerate(day_games.iterrows()):
            game_id = str(game.get("game_id") or f"{week}-{game_index}"); selected = str(selected_id) == game_id; _render_game_card(game, roster, selected, f"nfl_game_select_{day_index}_{game_index}")
            if str(st.session_state.get("nfl_selected_game") or "") == game_id: _render_game_intelligence(game, game_id)

show()
