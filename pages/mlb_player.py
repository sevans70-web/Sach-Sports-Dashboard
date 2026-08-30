"""Dedicated MLB Player Intelligence page."""

from __future__ import annotations

from html import escape
from typing import Any

import streamlit as st

from data.mlb_player_profile import get_player_game_log, summarize_game_log
from data.mlb_players import get_player_headshot_url


def _fmt_rate(value: Any) -> str:
    try:
        return f"{float(value):.3f}"
    except (TypeError, ValueError):
        return "—"


def _fmt_num(value: Any) -> str:
    try:
        return str(int(value))
    except (TypeError, ValueError):
        return "—"


def _metric(label: str, value: str) -> str:
    return (
        "<div class='player-profile-metric'>"
        f"<span>{escape(label)}</span>"
        f"<strong>{escape(value)}</strong>"
        "</div>"
    )


def _player_header(player: dict[str, Any]) -> None:
    player_id = int(player.get("player_id") or 0)
    name = str(player.get("player_name") or "MLB Player")
    team = str(player.get("team_name") or "")
    opponent = str(player.get("opponent_name") or "")
    pos = str(player.get("position_abbreviation") or player.get("position") or "")
    order = player.get("batting_order")
    pitcher = str(player.get("opposing_probable_pitcher") or "Pitcher TBA")
    hand = str(player.get("opposing_pitcher_hand") or "")
    image = str(player.get("headshot_url") or get_player_headshot_url(player_id) or "")

    batting = f"Batting #{order}" if order else "Lineup player"
    hand_label = f" · {hand}HP" if hand in {"R", "L"} else ""

    img_html = (
        f"<img class='player-profile-photo' src='{escape(image)}' alt='{escape(name)} headshot'>"
        if image
        else "<div class='player-profile-photo-fallback'>MLB</div>"
    )

    st.markdown(
        f"""
        <div class="player-profile-head">
          {img_html}
          <div class="player-profile-copy">
            <h2>{escape(name)}</h2>
            <p>{escape(team)} · {escape(pos)} · {escape(batting)}</p>
            <strong>vs. {escape(opponent)} · {escape(pitcher)}{escape(hand_label)}</strong>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _ranking_strip(player: dict[str, Any]) -> None:
    ranking = player.get("ranking")
    if not isinstance(ranking, dict):
        return
    category = str(ranking.get("category") or "Today's market")
    rank = ranking.get("rank")
    gi = float(ranking.get("score", ranking.get("gi_score", 0)) or 0)
    probability = None
    for key in (
        "home_run_probability",
        "one_plus_hit_probability",
        "over_1_5_total_bases_probability",
        "one_plus_run_probability",
        "one_plus_rbi_probability",
        "one_plus_walk_probability",
        "one_plus_stolen_base_probability",
    ):
        if ranking.get(key) not in (None, ""):
            probability = ranking.get(key)
            break

    prob_text = f" · {float(probability):.0f}%" if probability is not None else ""
    st.markdown(
        f"<div class='player-ranking-strip'>"
        f"<b>{escape(category)}</b>"
        f"<span>#{escape(str(rank or '—'))} · GI {gi:.1f}{escape(prob_text)}</span>"
        f"</div>",
        unsafe_allow_html=True,
    )


st.markdown(
    """
    <style>
    .player-profile-head{
      display:grid;grid-template-columns:76px minmax(0,1fr);gap:12px;align-items:center;
      padding:12px;background:linear-gradient(118deg,#101112,#111315 68%,rgba(25,217,120,.07));
      border:1.5px solid #30343a;border-radius:14px;margin:5px 0 9px;
    }
    .player-profile-photo,.player-profile-photo-fallback{
      width:72px;height:72px;border-radius:13px;object-fit:cover;
      background:#080909;border:2px solid rgba(214,179,92,.75);
    }
    .player-profile-photo-fallback{
      display:flex;align-items:center;justify-content:center;color:#f6c84c;font-weight:900;
    }
    .player-profile-copy h2{margin:0;color:#fff;font-size:1.35rem}
    .player-profile-copy p{margin:3px 0;color:#a7abb2;font-size:.78rem}
    .player-profile-copy strong{display:block;color:#f6c84c;font-size:.76rem;line-height:1.25}
    .player-ranking-strip{
      display:flex;justify-content:space-between;gap:8px;align-items:center;
      background:#0c0e0f;border:1px solid rgba(25,217,120,.55);border-radius:10px;
      padding:8px 10px;margin:7px 0 11px;
    }
    .player-ranking-strip b{color:#fff;font-size:.78rem}
    .player-ranking-strip span{color:#19d978;font-size:.75rem;font-weight:900}
    .player-window-note{color:#a7abb2;font-size:.70rem;margin:1px 0 7px}
    .player-profile-grid{
      display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:8px 0;
    }
    .player-profile-metric{
      min-width:0;background:#101112;border:1.5px solid #34373c;border-radius:10px;
      min-height:68px;padding:7px 6px;display:flex;flex-direction:column;justify-content:center;
    }
    .player-profile-metric:nth-child(1),
    .player-profile-metric:nth-child(5){border-color:rgba(25,217,120,.68)}
    .player-profile-metric:nth-child(4),
    .player-profile-metric:nth-child(8){border-color:rgba(214,179,92,.68)}
    .player-profile-metric span{color:#9da2aa;font-size:.61rem;line-height:1.1}
    .player-profile-metric strong{color:#fff;font-size:.94rem;margin-top:4px;line-height:1}
    .player-matchup-card{
      background:#101112;border:1.5px solid #34373c;border-radius:11px;padding:10px;margin-top:9px;
    }
    .player-matchup-card b{color:#f6c84c}
    .player-matchup-card span{display:block;color:#a7abb2;font-size:.74rem;margin-top:4px}
    div[data-testid="stSegmentedControl"] > div{
      width:100%!important;display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:4px!important;
    }
    div[data-testid="stSegmentedControl"] button{
      min-width:0!important;width:100%!important;background:#080909!important;color:#fff!important;
      border:1px solid #34373c!important;font-weight:850!important;min-height:34px!important;
    }
    div[data-testid="stSegmentedControl"] button[aria-pressed="true"]{
      color:#f6c84c!important;border-color:#d6b35c!important;background:#11100c!important;
    }
    @media(max-width:700px){
      .player-profile-head{grid-template-columns:64px minmax(0,1fr);gap:10px;padding:10px}
      .player-profile-photo,.player-profile-photo-fallback{width:60px;height:60px}
      .player-profile-copy h2{font-size:1.12rem}
      .player-profile-grid{gap:4px}
      .player-profile-metric{min-height:62px;padding:6px 4px}
      .player-profile-metric span{font-size:.54rem}
      .player-profile-metric strong{font-size:.82rem}
    }
    </style>
    """,
    unsafe_allow_html=True,
)

if st.button("← Back to game", key="back_to_mlb_game"):
    st.switch_page("pages/mlb_game.py")

player = st.session_state.get("mlb_selected_player")
if not isinstance(player, dict) or not player.get("player_id"):
    st.warning("Choose a player from a game roster first.")
    st.page_link("pages/mlb.py", label="Return to MLB", icon="⚾")
    st.stop()

_player_header(player)
_ranking_strip(player)

window = st.segmented_control(
    "Recent form",
    options=["L5", "L10", "L20", "Season"],
    default="L5",
    key="mlb_player_window",
    selection_mode="single",
) or "L5"

game_log = get_player_game_log(int(player["player_id"]))
summary = summarize_game_log(game_log, window)

if not game_log:
    st.caption("Recent MLB game-log data is temporarily unavailable.")
else:
    selected_games = summary.get("games", 0)
    st.markdown(
        f"<div class='player-window-note'>{escape(window)} · {selected_games} game"
        f"{'s' if selected_games != 1 else ''}</div>",
        unsafe_allow_html=True,
    )

    metrics = [
        ("AVG", _fmt_rate(summary.get("avg"))),
        ("Hits", _fmt_num(summary.get("hits"))),
        ("HR", _fmt_num(summary.get("home_runs"))),
        ("Total Bases", _fmt_num(summary.get("total_bases"))),
        ("Runs", _fmt_num(summary.get("runs"))),
        ("RBIs", _fmt_num(summary.get("rbi"))),
        ("Walks", _fmt_num(summary.get("walks"))),
        ("Stolen Bases", _fmt_num(summary.get("stolen_bases"))),
    ]
    st.markdown(
        "<div class='player-profile-grid'>"
        + "".join(_metric(label, value) for label, value in metrics)
        + "</div>",
        unsafe_allow_html=True,
    )

game = player.get("game", {}) or {}
pitcher = str(player.get("opposing_probable_pitcher") or "Pitcher TBA")
hand = str(player.get("opposing_pitcher_hand_description") or player.get("opposing_pitcher_hand") or "")
venue = str(game.get("venue") or player.get("venue") or "Venue TBA")
st.markdown(
    f"""
    <div class="player-matchup-card">
      <b>Today's Matchup</b>
      <span>Opposing pitcher: {escape(pitcher)}{(' · ' + escape(hand)) if hand else ''}</span>
      <span>Venue: {escape(venue)}</span>
      <span>Confirmed batting order: #{escape(str(player.get('batting_order') or '—'))}</span>
    </div>
    """,
    unsafe_allow_html=True,
)

st.caption("L5 / L10 / L20 / Season is the reusable recent-form pattern for the Player Intelligence page.")
