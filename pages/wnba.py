"""WNBA workspace — MLB-style mobile-first intelligence layout."""
from __future__ import annotations

from datetime import datetime, timedelta
from html import escape
import json
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st

from data.wnba_schedule import current_wnba_window, load_wnba_scoreboard
from data.wnba_stats import WNBA_BASELINE_SEASON, wnba_headshot_url
from engines.wnba_rankings import build_wnba_baseline_top25
from components.wnba_prediction_performance import render_wnba_prediction_performance

WNBA_SEASON = "2026"
TORONTO_TZ = ZoneInfo("America/Toronto")
WNBA_MOVEMENT_FILE = Path("/tmp/sach_wnba_rank_movement.json")

WNBA_PROPS = [
    "Points", "Rebounds", "Assists", "3-Pointers Made",
    "Points + Rebounds + Assists (PRA)", "Points + Rebounds",
    "Points + Assists", "Rebounds + Assists", "Steals", "Blocks",
]
PROP_ICONS = {
    "Points": "🏀", "Rebounds": "💪", "Assists": "🎯", "3-Pointers Made": "🔥",
    "Points + Rebounds + Assists (PRA)": "📊", "Points + Rebounds": "⚡",
    "Points + Assists": "🧠", "Rebounds + Assists": "🔁", "Steals": "🖐️", "Blocks": "🧱",
}


def _inject_wnba_css() -> None:
    st.markdown("""
    <style>
    :root{--g:#19d978;--gold:#d6b35c;--panel:#101112;--border:#34383d;--soft:#a7abb2}
    .wnba-hero{border:2px solid rgba(214,179,92,.9);border-radius:15px;padding:14px 14px 13px;
      background:linear-gradient(105deg,rgba(214,179,92,.25) 0%,rgba(4,5,4,.98) 44%,rgba(25,217,120,.25) 100%);
      margin:0 0 6px;box-shadow:inset 0 0 24px rgba(25,217,120,.08),0 0 0 1px rgba(25,217,120,.16)}
    .wnba-kicker{color:var(--g);font-size:.76rem;font-weight:900;letter-spacing:.08em;margin-bottom:.3rem}
    .wnba-hero-title{font-size:1.55rem;font-weight:950;color:#fff;line-height:1.08;margin-bottom:.45rem}
    .wnba-soft{color:var(--soft);font-size:.84rem;line-height:1.45}.wnba-updated{color:#a7abb2;font-size:.68rem;font-weight:800;text-align:right;margin:2px 0 6px}
    .wnba-slate-link{border:1.5px solid rgba(214,179,92,.7);border-left:6px solid var(--g);border-radius:14px;padding:.78rem .85rem;margin:.5rem 0 1rem;
      background:linear-gradient(100deg,rgba(214,179,92,.10),rgba(25,217,120,.08));font-size:.88rem}
    .wnba-heading{margin:1rem 0 .35rem;font-size:1.15rem;font-weight:950;color:#fff}.wnba-heading span{display:block;color:#a7abb2;font-size:.72rem;font-weight:500;margin-top:.18rem}
    .wnba-snapshot-title{display:flex;justify-content:space-between;gap:8px;align-items:end;font-size:1rem;font-weight:900;margin:.8rem 0 .4rem}.wnba-snapshot-title span{color:var(--g);font-size:.62rem}
    .wnba-snapshot{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:1rem}
    .wnba-snap{min-width:0;background:#101112;border:2px solid #34383d;border-radius:13px;padding:9px}.wnba-snap:first-child{border-color:var(--g)}.wnba-snap:last-child{border-color:#d6b35c}
    .wnba-snap small{display:block;color:#fff;font-size:.58rem;font-weight:900;letter-spacing:.05em}.wnba-snap strong{display:block;color:#fff;font-size:1.18rem;margin:.25rem 0}.wnba-snap:first-child strong{color:var(--g)}.wnba-snap:last-child strong{color:#f0c43f}.wnba-snap em{display:block;color:#dfe2e4;font-size:.59rem;font-style:normal}
    .wnba-game{border:1.5px solid var(--border);border-left:5px solid var(--g);border-radius:14px;padding:.78rem .85rem;margin:.6rem 0;background:linear-gradient(135deg,#101112,#0d0f10)}
    .wnba-game-top{display:flex;justify-content:space-between;gap:8px;color:var(--g);font-size:.67rem;font-weight:900}.wnba-game-status{color:#a7abb2;text-align:right}
    .wnba-team-row{display:grid;grid-template-columns:34px 1fr;gap:9px;align-items:center;margin:.55rem 0}.wnba-team-logo{width:32px;height:32px;object-fit:contain}.wnba-team-name{font-size:.9rem;font-weight:900}.wnba-team-meta{color:#a7abb2;font-size:.68rem}
    .wnba-score{color:#d6b35c;font-weight:900}.wnba-market-note{color:#a7abb2;font-size:.72rem;line-height:1.4;margin:.2rem 0 .7rem}
    .wnba-card{border:2px solid #34383d;border-left:6px solid var(--g);border-radius:15px;padding:.78rem;margin:.65rem 0;background:linear-gradient(135deg,#101112,#0d0f10)}
    .wnba-card-grid{display:grid;grid-template-columns:42px 82px minmax(0,1fr);gap:8px;align-items:start}.wnba-rank{font-size:1rem;font-weight:950}.wnba-move{color:#a7abb2;font-size:.67rem;margin-top:.2rem}.wnba-photo{width:76px;height:76px;object-fit:contain;object-position:center bottom;border-radius:50%;background:#f6f6f6;border:3px solid rgba(214,179,92,.75)}
    .wnba-name{font-size:1.02rem;font-weight:950;line-height:1.1}.wnba-meta{color:#a7abb2;font-size:.7rem;margin:.2rem 0}.wnba-prop-line{font-size:.72rem;margin-top:.28rem}.wnba-prop-line b{color:#fff}.wnba-baseline{color:#d6b35c;font-weight:900}.wnba-reason{color:#b7bbc0;font-size:.68rem;line-height:1.38;margin-top:.35rem}
    .wnba-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:.65rem 0 .15rem}.wnba-kpi{border:1.5px solid #34383d;border-radius:10px;padding:7px;background:#101112}.wnba-kpi:first-child{border-color:var(--g)}.wnba-kpi:nth-child(2){border-color:rgba(214,179,92,.8)}.wnba-kpi span{display:block;color:#a7abb2;font-size:.58rem}.wnba-kpi strong{font-size:.85rem}
    .wnba-detail{border:1px solid #34383d;border-radius:12px;padding:.75rem;margin:.4rem 0;background:#0e1011}.wnba-detail h4{color:#d6b35c;margin:0 0 .45rem;font-size:.9rem}.wnba-detail p{color:#c6c9cd;font-size:.72rem;line-height:1.45;margin:.25rem 0}
    div[class*="st-key-wnba_market_selector"] [data-testid="stSegmentedControl"]{width:100%!important;overflow-x:auto!important}div[class*="st-key-wnba_market_selector"] [role="radiogroup"]{display:flex!important;flex-wrap:nowrap!important;width:max-content!important;min-width:100%!important}div[class*="st-key-wnba_market_selector"] button{white-space:nowrap!important}
    [data-testid="stTabs"] [data-baseweb="tab-highlight"],[data-baseweb="tab-highlight"]{background:#d6b35c!important;background-color:#d6b35c!important}
    [data-testid="stTabs"] button[role="tab"][aria-selected="true"]{color:#fff!important;border-bottom-color:#d6b35c!important;box-shadow:inset 0 -3px 0 #d6b35c!important}
    @media(max-width:700px){.block-container{padding-top:0!important;padding-left:.85rem!important;padding-right:.85rem!important}.wnba-hero{margin-top:0!important}.wnba-hero-title{font-size:1.38rem}.wnba-card{padding:.65rem}.wnba-card-grid{grid-template-columns:34px 70px minmax(0,1fr);gap:7px}.wnba-photo{width:66px;height:66px}.wnba-name{font-size:.93rem}.wnba-reason{font-size:.64rem}.wnba-kpi{padding:6px 5px}.wnba-kpi span{font-size:.52rem}.wnba-kpi strong{font-size:.78rem}.stTabs [data-baseweb="tab-list"]{overflow-x:auto;scrollbar-width:none}.stTabs [data-baseweb="tab"]{white-space:nowrap;padding-left:.5rem;padding-right:.5rem}}
    </style>
    """, unsafe_allow_html=True)


def _hero() -> None:
    st.markdown("""
    <section class="wnba-hero"><div class="wnba-kicker">WNBA</div><div class="wnba-hero-title">WNBA Intelligence Center</div>
    <div class="wnba-soft">Start with today’s strongest WNBA prop opportunities, review the intelligence behind each ranking, and open the full player view when you need more depth.</div></section>
    """, unsafe_allow_html=True)


def _format_tipoff(value) -> str:
    ts = pd.to_datetime(value, errors="coerce")
    if pd.isna(ts): return "Time TBD"
    ts = ts.tz_localize(TORONTO_TZ) if ts.tzinfo is None else ts.tz_convert(TORONTO_TZ)
    return ts.strftime("%a %b %d • %I:%M %p ET")


def _load_games() -> pd.DataFrame:
    try: return current_wnba_window(days_back=1, days_forward=14)
    except Exception: return pd.DataFrame()


def _today_games(games: pd.DataFrame) -> pd.DataFrame:
    if games.empty: return games
    today = datetime.now(TORONTO_TZ).date()
    dates = pd.to_datetime(games["tipoff_et"], errors="coerce").dt.date
    return games[dates.eq(today)].copy()


def _render_game_card(game: pd.Series, show_score: bool = True) -> None:
    away_logo = escape(str(game.get("away_logo") or "")); home_logo = escape(str(game.get("home_logo") or ""))
    state = str(game.get("state") or "pre"); status = escape(str(game.get("status") or "Scheduled"))
    away_score = pd.to_numeric(game.get("away_score"), errors="coerce"); home_score = pd.to_numeric(game.get("home_score"), errors="coerce")
    score_ok = show_score and state in {"in", "post"} and pd.notna(away_score) and pd.notna(home_score)
    def row(logo, name, abbr, score):
        score_html = f'<span class="wnba-score"> · {int(score)}</span>' if score_ok else ""
        logo_html = f'<img class="wnba-team-logo" src="{logo}">' if logo else '<div></div>'
        return f'<div class="wnba-team-row">{logo_html}<div><div class="wnba-team-name">{escape(str(name))}{score_html}</div><div class="wnba-team-meta">{escape(str(abbr or ""))}</div></div></div>'
    st.markdown(f'''<div class="wnba-game"><div class="wnba-game-top"><span>{_format_tipoff(game.get("tipoff_et"))}</span><span class="wnba-game-status">{status}</span></div>{row(away_logo,game.get("away_team","Away"),game.get("away_abbr",""),away_score)}{row(home_logo,game.get("home_team","Home"),game.get("home_abbr",""),home_score)}</div>''', unsafe_allow_html=True)


def _load_movement_state() -> dict:
    try:
        if WNBA_MOVEMENT_FILE.exists(): return json.loads(WNBA_MOVEMENT_FILE.read_text(encoding="utf-8"))
    except Exception: pass
    return {}


def _apply_rank_movement(df: pd.DataFrame, category: str) -> pd.DataFrame:
    if df is None or df.empty: return df
    state = _load_movement_state(); previous = state.get(category, {}); current = {}; movement = []
    for _, row in df.iterrows():
        pid = row.get("player_id"); key = str(int(pid)) if pd.notna(pid) else f'{row.get("player_name")}|{row.get("team")}'
        rank = int(row.get("rank", 0)); current[key] = rank; old = previous.get(key)
        movement.append("NEW" if old is None else (f"↑ {int(old)-rank}" if int(old)>rank else (f"↓ {rank-int(old)}" if int(old)<rank else "—")))
    out = df.copy(); out["rank_movement"] = movement; state[category] = current
    try: WNBA_MOVEMENT_FILE.write_text(json.dumps(state), encoding="utf-8")
    except Exception: pass
    return out


def _num(v, digits=1):
    n = pd.to_numeric(v, errors="coerce"); return "—" if pd.isna(n) else f"{float(n):.{digits}f}"


def _reason(row: pd.Series, prop: str) -> str:
    value = _num(row.get("ranking_value")); games = pd.to_numeric(row.get("games_played"), errors="coerce")
    games_text = str(int(games)) if pd.notna(games) else "available"
    return f"Ranks #{int(row.get('rank',0))} in this market from the current {WNBA_BASELINE_SEASON} statistical baseline: {value} per game across {games_text} games."


def _render_player_card(row: pd.Series, prop: str) -> None:
    rank=int(row.get("rank",0)); name=escape(str(row.get("player_name","Unknown"))); team=escape(str(row.get("team","—"))); move=escape(str(row.get("rank_movement","—")))
    pid=row.get("player_id"); img=f'<img class="wnba-photo" src="{wnba_headshot_url(int(pid))}">' if pd.notna(pid) else '<div class="wnba-photo"></div>'
    metric=escape(str(row.get("metric_label","Per Game"))); games=pd.to_numeric(row.get("games_played"),errors="coerce"); games_text=str(int(games)) if pd.notna(games) else "—"
    st.markdown(f'''<div class="wnba-card"><div class="wnba-card-grid"><div><div class="wnba-rank">#{rank}</div><div class="wnba-move">{move}</div></div><div>{img}</div><div><div class="wnba-name">{name}</div><div class="wnba-meta">{team} · {WNBA_BASELINE_SEASON} regular season</div><div class="wnba-prop-line"><b>{escape(prop)}</b> · <span class="wnba-baseline">{metric} {_num(row.get("ranking_value"))}</span></div><div class="wnba-reason">{escape(_reason(row,prop))}</div></div></div><div class="wnba-kpis"><div class="wnba-kpi"><span>{metric}</span><strong>{_num(row.get("ranking_value"))}</strong></div><div class="wnba-kpi"><span>GAMES</span><strong>{games_text}</strong></div><div class="wnba-kpi"><span>MIN/G</span><strong>{_num(row.get("minutes_per_game"))}</strong></div></div></div>''', unsafe_allow_html=True)
    with st.expander("ⓘ View Intelligence", expanded=False):
        st.markdown(f'''<div class="wnba-detail"><h4>🧠 Current Intelligence</h4><p><b>Market evidence:</b> {escape(_reason(row,prop))}</p><p><b>Season context:</b> {_num(row.get("points_per_game"))} PTS/G · {_num(row.get("rebounds_per_game"))} REB/G · {_num(row.get("assists_per_game"))} AST/G · {_num(row.get("threes_per_game"))} 3PM/G.</p><p><b>Prediction layer:</b> This card is using verified season statistics only. A betting line, matchup probability and GI score are not shown until those live inputs are connected, so baseline data is never mislabeled as a prediction.</p></div>''', unsafe_allow_html=True)


def _market_rankings(prop: str) -> None:
    icon=PROP_ICONS.get(prop,"🏀")
    st.markdown(f'<div class="wnba-heading">{icon} {escape(prop)} Rankings<span>Market-specific intelligence · current-season evidence</span></div>', unsafe_allow_html=True)
    try: top25=build_wnba_baseline_top25(prop,WNBA_BASELINE_SEASON,minimum_games=10)
    except Exception as exc:
        st.warning("WNBA player data is temporarily unavailable."); st.caption(str(exc)); return
    top25=_apply_rank_movement(top25,prop)
    if top25.empty: st.info("No qualified WNBA players are available for this market right now."); return
    show25=st.session_state.get(f"wnba_show25_{prop}",False); shown=top25 if show25 else top25.head(5)
    for _,row in shown.iterrows(): _render_player_card(row,prop)
    label="Show Top 5" if show25 else "Open full Top 25"
    if st.button(label,key=f"wnba_toggle_{prop}",use_container_width=True):
        st.session_state[f"wnba_show25_{prop}"]=not show25; st.rerun()


def _render_intelligence() -> None:
    games=_load_games(); today=_today_games(games)
    live=today[today["state"].eq("in")] if not today.empty else pd.DataFrame(); final=today[today["state"].eq("post")] if not today.empty else pd.DataFrame(); upcoming=today[today["state"].eq("pre")] if not today.empty else pd.DataFrame()
    st.markdown('<div class="wnba-slate-link">🏀 <b>TODAY’S WNBA GAMES</b> › Open today’s slate, game status & WNBA intelligence</div>',unsafe_allow_html=True)
    st.markdown(f'''<div class="wnba-snapshot-title"><strong>Today’s WNBA Snapshot</strong><span>Daily slate view</span></div><div class="wnba-snapshot"><div class="wnba-snap"><small>GAMES</small><strong>{len(today)}</strong><em>{len(live)} live · {len(final)} final</em></div><div class="wnba-snap"><small>UPCOMING</small><strong>{len(upcoming)}</strong><em>today</em></div><div class="wnba-snap"><small>SEASON</small><strong>{WNBA_SEASON}</strong><em>regular season</em></div></div>''',unsafe_allow_html=True)
    st.markdown('<div class="wnba-heading">🔥 Slate Intelligence<span>Today’s WNBA matchups and status</span></div>',unsafe_allow_html=True)
    if today.empty: st.info("No WNBA games are on today’s slate.")
    else:
        for _,g in today.iterrows(): _render_game_card(g,True)
    st.divider()
    st.markdown('<div class="wnba-heading">Player Rankings<span>Market-specific intelligence · current-season evidence</span></div>',unsafe_allow_html=True)
    prop=st.segmented_control("WNBA market",WNBA_PROPS,default=st.session_state.get("wnba_market_selector","Points"),key="wnba_market_selector",selection_mode="single",label_visibility="collapsed") or "Points"
    _market_rankings(prop)


def _render_games_schedule() -> None:
    st.markdown('<div class="wnba-heading">🏀 Today’s WNBA Games<span>Choose a date range to review matchups and game status.</span></div>',unsafe_allow_html=True)
    today=datetime.now(TORONTO_TZ).date(); c1,c2=st.columns(2); start=c1.date_input("From",today,key="wnba_schedule_from"); end=c2.date_input("To",today+timedelta(days=14),key="wnba_schedule_to")
    if end<start: st.warning("The end date must be on or after the start date."); return
    try: games=load_wnba_scoreboard(start.isoformat(),end.isoformat())
    except Exception as exc: st.warning("WNBA schedule data is temporarily unavailable."); st.caption(str(exc)); return
    st.caption(f"{len(games)} game{'s' if len(games)!=1 else ''} found")
    if games.empty: st.info("No WNBA games are scheduled in this date range."); return
    for _,g in games.iterrows(): _render_game_card(g,True)


def _render_player_props() -> None:
    st.markdown('<div class="wnba-heading">🎯 Player Rankings<span>Market-specific intelligence · current-season evidence</span></div>',unsafe_allow_html=True)
    prop=st.segmented_control("WNBA prop",WNBA_PROPS,default=st.session_state.get("wnba_props_market","Points"),key="wnba_props_market",selection_mode="single",label_visibility="collapsed") or "Points"
    st.markdown('<div class="wnba-market-note">Top 5 shown first. Open the full Top 25 only when you need more depth.</div>',unsafe_allow_html=True)
    _market_rankings(prop)


def show() -> None:
    _inject_wnba_css(); _hero(); now=datetime.now(TORONTO_TZ); st.markdown(f'<div class="wnba-updated">Updated {now.strftime("%A · %I:%M %p ET")}</div>',unsafe_allow_html=True)
    tabs=st.tabs(["🧠 Intelligence","📅 Games / Schedule","🎯 Player Props","📈 Prediction Performance"])
    with tabs[0]: _render_intelligence()
    with tabs[1]: _render_games_schedule()
    with tabs[2]: _render_player_props()
    with tabs[3]: render_wnba_prediction_performance()

show()
