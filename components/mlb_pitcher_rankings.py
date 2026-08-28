from __future__ import annotations
from html import escape
import streamlit as st
from engines.mlb_pitcher_intelligence import get_pitcher_rankings

CATEGORY_CONFIG = {
    "strikeouts":("🎯 Strikeouts","K"),
    "outs_recorded":("⏱️ Outs","outs"),
    "hits_allowed":("⚾ Hits Allowed","hits"),
    "walks_allowed":("◉ Walks Allowed","BB"),
    "earned_runs":("🔴 Earned Runs","ER"),
}

def _matchup(row):
    team=str(row.get("team_name") or "TBD"); opp=str(row.get("opponent_name") or "TBD")
    if row.get("is_home") is True: return f"{opp} vs. {team}"
    return f"{team} vs. {opp}"

def _projection_text(category,row):
    p=float(row.get("projection") or 0)
    if category=="outs_recorded": return f"{p:.1f} outs · ~{p/3:.1f} IP"
    return f"{p:.1f} {CATEGORY_CONFIG[category][1]}"

def _movement(row):
    m=row.get("movement") or {}
    return str(m.get("label") or row.get("movement_label") or "—")

def _details(category,row):
    st.markdown("""
    <style>
    .pitch-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:6px 0}
    .pitch-detail-grid>div{background:#101112;border:2px solid #34373c;border-radius:10px;padding:7px}
    .pitch-detail-grid span{display:block;color:#a7abb2;font-size:.64rem}.pitch-detail-grid b{color:#fff}
    </style>
    """,unsafe_allow_html=True)
    st.markdown(
      f"<div class='pitch-detail-grid'><div><span>GI Score</span><b>{float(row.get('gi_score') or 0):.1f}</b></div>"
      f"<div><span>Projection</span><b>{escape(_projection_text(category,row))}</b></div>"
      f"<div><span>Benchmark</span><b>{float(row.get('benchmark_probability') or 0):.0f}%</b></div></div>",
      unsafe_allow_html=True
    )
    st.write(f"**Why:** {row.get('why') or 'Pitcher profile is being evaluated.'}")
    if row.get("lineup_context_confirmed"):
        st.write("**Opponent lineup:** Confirmed")
    else:
        st.write("**Opponent lineup:** Not fully confirmed")

def _render_pitcher_card(category,row):
    rank=int(row.get("rank") or 0); score=float(row.get("gi_score") or 0)
    name=escape(str(row.get("pitcher_name") or "Pitcher")); matchup=escape(_matchup(row))
    reason=escape(str(row.get("why") or "")); projection=escape(_projection_text(category,row))
    headshot=escape(str(row.get("headshot_url") or "")); hand=escape(str(row.get("pitcher_hand") or ""))
    lineup = "✓ Confirmed opponent lineup" if row.get("lineup_context_confirmed") else "○ Opponent lineup not fully confirmed"
    photo=(f'<img src="{headshot}" alt="{name}" style="width:48px;height:48px;object-fit:cover;object-position:center 12%;border-radius:11px;border:2px solid rgba(25,217,120,.48);">' if headshot else "")
    key=f"pitcher_intel_{category}_{rank}"
    if key not in st.session_state: st.session_state[key]=False

    with st.container(border=True,key=f"pitcher_card_{category}_{rank}"):
        st.markdown(
          f"<div class='pitch-card-grid'><div class='pitch-rank'>#{rank}<small>{escape(_movement(row))}</small></div><div>{photo}</div>"
          f"<div class='pitch-main'><b>{name}</b><span>{matchup} · {hand}HP</span><span>{reason}</span><em>{escape(lineup)}</em></div>"
          f"<div class='pitch-score'><small>GI SCORE</small><b>{score:.1f}</b><span>{projection}</span></div></div>",
          unsafe_allow_html=True
        )
        if st.button("ⓘ Hide Intelligence" if st.session_state[key] else "ⓘ View Intelligence",key=f"{key}_button",use_container_width=True):
            st.session_state[key]=not st.session_state[key]
        if st.session_state[key]: _details(category,row)

def _render_category(category,rows):
    st.markdown(f"### {CATEGORY_CONFIG[category][0]}")
    st.caption("Ranked by pitcher GI score using workload, season rates, sample reliability, and opponent handedness.")
    if not rows:
        st.caption("No probable pitchers with usable season data are available yet."); return
    for row in rows[:5]: _render_pitcher_card(category,row)
    state=f"show_pitcher_{category}_25"
    if state not in st.session_state: st.session_state[state]=False
    if st.button("Show Top 5 Only" if st.session_state[state] else "View Full Top 25",key=f"toggle_pitcher_{category}_25",use_container_width=True):
        st.session_state[state]=not st.session_state[state]
    if st.session_state[state]:
        for row in rows[5:]: _render_pitcher_card(category,row)

def render_pitcher_rankings():
    st.markdown("""
    <style>
    div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlockBorderWrapper"]{
      background:linear-gradient(100deg,rgba(25,217,120,.13),#101112 18%,#101112 82%,rgba(25,217,120,.035))!important;
      border:2px solid #3a3d42!important;border-left:6px solid #19d978!important;border-radius:16px!important
    }
    .pitch-card-grid{display:grid;grid-template-columns:42px 52px minmax(0,1fr) 68px;gap:8px;align-items:center}
    .pitch-rank{color:#19d978;font-weight:900;text-align:center}.pitch-rank small{display:block;color:#a7abb2}
    .pitch-main b{display:block;color:#fff;font-weight:850}.pitch-main span{display:block;color:#cfd2d6;font-size:.78rem;line-height:1.3}
    .pitch-main em{display:inline-block;color:#bbf7d0;background:rgba(25,217,120,.09);border:1px solid rgba(25,217,120,.45);border-radius:999px;padding:3px 7px;margin-top:5px;font-size:.68rem;font-style:normal;font-weight:800}
    .pitch-score{text-align:right}.pitch-score small{display:block;color:#19d978;font-weight:800}.pitch-score b{display:block;color:#ffcc33;font-size:1.05rem}.pitch-score span{color:#a7abb2;font-size:.68rem}
    div[data-testid="stTabs"] [data-baseweb="tab-highlight"]{background:#19d978!important}
    @media(max-width:700px){.pitch-card-grid{grid-template-columns:38px 48px minmax(0,1fr) 60px;gap:7px}.pitch-main span{font-size:.73rem}}
    </style>
    """,unsafe_allow_html=True)

    result=get_pitcher_rankings(limit=25)
    if not result.get("success"):
        st.caption("Pitcher rankings are waiting for today's probable-pitcher data."); return
    st.caption(f"{int(result.get('pitcher_count') or 0)} probable pitchers loaded for today's slate.")
    rankings=result.get("rankings") or {}
    tabs=st.tabs(["🎯 Strikeouts","⏱️ Outs","⚾ Hits Allowed","◉ Walks Allowed","🔴 Earned Runs"])
    for tab,category in zip(tabs,CATEGORY_CONFIG):
        with tab: _render_category(category,rankings.get(category,[]))
