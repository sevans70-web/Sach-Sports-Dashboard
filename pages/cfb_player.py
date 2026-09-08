from __future__ import annotations

from html import escape
from zoneinfo import ZoneInfo
import pandas as pd
import streamlit as st

TZ = ZoneInfo("America/Toronto")


def _html(value: str) -> None:
    st.markdown(" ".join(line.strip() for line in value.splitlines() if line.strip()), unsafe_allow_html=True)


def _kickoff(value) -> str:
    stamp = pd.to_datetime(value, errors="coerce", utc=True)
    if pd.isna(stamp):
        return "Kickoff TBD"
    return stamp.tz_convert(TZ).strftime("%a %b %d · %I:%M %p ET").replace(" 0", " ")


st.markdown(
    """
<style>
.block-container{max-width:950px;padding-top:.05rem!important}
.cfb-player-head{display:grid;grid-template-columns:76px minmax(0,1fr);gap:12px;align-items:center;padding:12px;background:linear-gradient(118deg,#101112,#111315 68%,rgba(25,217,120,.07));border:1.5px solid #30343a;border-radius:14px;margin:3px 0 9px}
.cfb-player-photo,.cfb-player-fallback{width:72px;height:72px;border-radius:50%;overflow:hidden;background:#080909;border:2px solid rgba(214,179,92,.86)}
.cfb-player-photo img{width:100%;height:100%;object-fit:cover;object-position:center 24%}.cfb-player-fallback{display:flex;align-items:center;justify-content:center;color:#f6c84c;font-weight:900}
.cfb-player-copy h2{margin:0;color:#fff;font-size:1.32rem}.cfb-player-copy p{margin:4px 0;color:#a7abb2;font-size:.78rem}.cfb-player-copy strong{color:#f6c84c;font-size:.76rem}
.cfb-inline-logo{width:24px;height:24px;object-fit:contain;vertical-align:middle;margin-right:6px}
.cfb-game-state{display:flex;justify-content:space-between;gap:8px;margin:0 0 10px;padding:8px 10px;border:1px solid #34373c;border-radius:9px;background:#0b0d0e;color:#c8ccd1;font-size:.72rem;font-weight:850}.cfb-game-state strong{color:#f6c84c}.cfb-game-state span{color:#a7abb2;text-align:right}
.cfb-market-card{display:grid;grid-template-columns:minmax(0,1fr) 55px;gap:8px;padding:12px;border:1px solid #30343a;border-left:4px solid #19d978;border-radius:11px;background:#0d0f10;margin:9px 0}.cfb-market-card b{display:block;color:#fff;font-size:.92rem}.cfb-market-card span{display:block;color:#f6c84c;font-size:.78rem;font-weight:850;margin-top:4px}.cfb-market-card small{display:block;color:#9da2aa;font-size:.68rem;margin-top:4px}.cfb-gi{text-align:right}.cfb-gi small{display:block;color:#8f959d;font-size:.47rem;font-weight:800}.cfb-gi strong{display:block;color:#f6c84c;font-size:.86rem;font-weight:900;margin-top:4px}
.cfb-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:9px 0}.cfb-metric{background:#101112;border:1px solid #30343a;border-radius:9px;padding:8px 7px;min-width:0}.cfb-metric:nth-child(odd){border-left:3px solid #19d978}.cfb-metric:nth-child(even){border-left:3px solid #d6b35c}.cfb-metric span{display:block;color:#92979e;font-size:.55rem}.cfb-metric strong{display:block;color:#fff;font-size:.80rem;margin-top:3px}
.cfb-intel{padding:11px;border:1px solid rgba(214,179,92,.52);border-radius:10px;background:#101112;color:#d9dbde;font-size:.76rem;line-height:1.45;margin-top:10px}.cfb-intel b{color:#f6c84c}
div[class*="st-key-back_cfb_player"]{width:max-content!important;margin-bottom:8px!important}div[class*="st-key-back_cfb_player"] button{background:#080909!important;color:#fff!important;border:1px solid #34373c!important;border-radius:9px!important}
@media(max-width:700px){.block-container{padding-left:.85rem!important;padding-right:.85rem!important}.cfb-player-head{grid-template-columns:64px minmax(0,1fr);gap:10px;padding:10px}.cfb-player-photo,.cfb-player-fallback{width:60px;height:60px}.cfb-player-copy h2{font-size:1.1rem}.cfb-inline-logo{width:22px;height:22px}.cfb-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
""",
    unsafe_allow_html=True,
)

if st.button("← Back", key="back_cfb_player"):
    st.switch_page("pages/cfb.py")

player = st.session_state.get("cfb_selected_player")
if not isinstance(player, dict):
    st.warning("Choose a CFB player from Player Rankings first.")
    st.stop()

name = str(player.get("player_name") or "CFB Player")
team = str(player.get("team") or "")
pos = str(player.get("position") or "")
matchup = str(player.get("matchup") or "Matchup pending")
photo = str(player.get("headshot") or "")
logo = str(player.get("team_logo") or "")
prop = str(player.get("selected_prop") or "Player Prop")
rank = int(player.get("rank") or 0)
gi = player.get("gi_score")
line = player.get("consensus_line")
line_type = str(player.get("line_type") or "market")
model = player.get("model_probability")
per_game = player.get("per_game")
season_total = player.get("season_total")
games = player.get("games_played")
stats_year = player.get("stats_season")
why = str(player.get("why_engine") or "Current ranking uses the verified CFB data that is available.")

img = f'<div class="cfb-player-photo"><img src="{escape(photo)}" alt="{escape(name)}"></div>' if photo else '<div class="cfb-player-fallback">CFB</div>'
team_logo = f'<img class="cfb-inline-logo" src="{escape(logo)}" alt="{escape(team)} logo">' if logo else ""
_html(f'<div class="cfb-player-head">{img}<div class="cfb-player-copy"><h2>{escape(name)}</h2><p>{team_logo}{escape(team)}{(" · "+escape(pos)) if pos else ""}</p><strong>{escape(matchup)}</strong></div></div>')
_html(f'<div class="cfb-game-state"><strong>🕒 {_kickoff(player.get("kickoff"))}</strong><span>{escape(matchup)}</span></div>')

if line is not None and not pd.isna(line):
    line_label = f"Model projection {float(line):.1f}" if line_type == "projection" else f"Market line {float(line):.1f}"
else:
    line_label = "Line unavailable"
model_label = f"Model confidence {float(model):.1f}%" if model is not None and not pd.isna(model) else "Model confidence —"
gi_label = "—" if gi is None or pd.isna(gi) else f"{float(gi):.1f}"
_html(f'<div class="cfb-market-card"><div><b>{escape(prop)}</b><span>#{rank} · {escape(line_label)}</span><small>{escape(model_label)}</small></div><div class="cfb-gi"><small>GI SCORE</small><strong>{gi_label}</strong></div></div>')

metrics = [
    ("PER GAME", "—" if per_game is None or pd.isna(per_game) else f"{float(per_game):.1f}"),
    ("SEASON TOTAL", "—" if season_total is None or pd.isna(season_total) else f"{float(season_total):.0f}"),
    ("GAMES", "—" if games is None or pd.isna(games) else f"{int(float(games))}"),
    ("DATA", "—" if stats_year is None or pd.isna(stats_year) else f"{int(float(stats_year))}"),
]
_html('<div class="cfb-metrics">'+''.join(f'<div class="cfb-metric"><span>{escape(k)}</span><strong>{escape(v)}</strong></div>' for k,v in metrics)+'</div>')
_html(f'<div class="cfb-intel"><b>Why This Player Ranks Here</b><br>{escape(why)}</div>')
st.caption("Game-by-game CFB trend history will appear here when verified player game logs are available; no history is fabricated.")
