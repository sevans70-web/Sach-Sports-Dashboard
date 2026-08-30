"""Dedicated MLB game page: matchup -> confirmed roster -> player page."""

from __future__ import annotations

from html import escape
from typing import Any

import streamlit as st

from components.mlb_schedule import load_today_lineups, load_today_schedule
from data.mlb_live import get_team_logo_url
from data.mlb_lineups import get_previous_day_lineup_projection


def _logo(team_id: Any, team_name: str) -> str:
    url = get_team_logo_url(int(team_id)) if team_id else None
    if url:
        return f"<img class='game-team-logo' src='{escape(url)}' alt='{escape(team_name)} logo'>"
    return "<div class='game-team-logo-fallback'>⚾</div>"


def _find_game(game_pk: Any) -> dict[str, Any] | None:
    selected = st.session_state.get("mlb_selected_game")
    if isinstance(selected, dict) and selected.get("game_pk") == game_pk:
        return selected
    for game in load_today_schedule().get("games", []):
        if game.get("game_pk") == game_pk:
            return game
    return None


def _find_lineups(game_pk: Any) -> dict[str, Any] | None:
    for game in load_today_lineups().get("games", []):
        if game.get("game_pk") == game_pk:
            return game
    return None


def _status(game: dict[str, Any]) -> str:
    group = str(game.get("status_group") or "").lower()
    if group == "live":
        return f"● LIVE · {escape(str(game.get('status') or 'In progress'))}"
    if group == "final":
        return "FINAL"
    return escape(str(game.get("start_time") or "Time TBA"))


def _team_row(game: dict[str, Any], side: str) -> str:
    name = str(game.get(f"{side}_team") or side.title())
    team_id = game.get(f"{side}_team_id")
    pitcher = str(game.get(f"{side}_probable_pitcher") or "Pitcher TBA")
    score = game.get(f"{side}_score")
    group = str(game.get("status_group") or "").lower()
    # The right column is reserved for the actual game score.
    # Pregame season records are intentionally omitted here.
    right = str(score) if group in {"live", "final"} and score is not None else ""

    return (
        "<div class='game-team-row'>"
        f"{_logo(team_id, name)}"
        "<div class='game-team-copy'>"
        f"<strong>{escape(name)}</strong>"
        f"<span>{escape(pitcher)}</span>"
        "</div>"
        f"<b>{escape(right)}</b>"
        "</div>"
    )


def _open_player(player: dict[str, Any], game: dict[str, Any]) -> None:
    ranked_lookup = st.session_state.get("mlb_ranked_player_lookup", {}) or {}
    market_lookup = st.session_state.get("mlb_player_market_context", {}) or {}
    player_id = int(player.get("player_id") or 0)
    ranked = ranked_lookup.get(player_id)

    context = dict(player)
    context["game"] = game
    context["market_context"] = list(market_lookup.get(player_id, []) or [])
    if ranked:
        context["ranking"] = ranked

    st.session_state["mlb_selected_player"] = context
    st.switch_page("pages/mlb_player.py")


def _roster_column(
    title: str,
    players: list[dict[str, Any]],
    game: dict[str, Any],
    confirmed: bool,
) -> None:
    st.markdown(f"<div class='roster-team-title'>{escape(title)}</div>", unsafe_allow_html=True)

    status_text = "CONFIRMED" if confirmed else "PROJECTED"
    status_class = "confirmed" if confirmed else "projected"
    st.markdown(
        f"<div class='lineup-status {status_class}'>{status_text}</div>",
        unsafe_allow_html=True,
    )

    if not players:
        st.caption("Lineup projection is temporarily unavailable.")
        return

    for player in players:
        order = player.get("batting_order") or player.get("projected_batting_order") or "—"
        name = str(player.get("player_name") or "Player")
        pos = str(player.get("position_abbreviation") or "")
        label = f"{order}. {name}" + (f" · {pos}" if pos else "")
        if st.button(
            label,
            key=f"open_player_{game.get('game_pk')}_{player.get('player_id')}",
            use_container_width=True,
        ):
            _open_player(player, game)


st.markdown(
    """
    <style>
    .game-page-head{
      background:linear-gradient(120deg,#101112,#121416 70%,rgba(25,217,120,.07));
      border:1.5px solid #30343a;border-radius:14px;padding:12px;margin:4px 0 13px;
    }
    .game-page-meta{
      display:flex;justify-content:space-between;gap:8px;color:#92979f;
      font-size:.70rem;font-weight:800;padding-bottom:8px;border-bottom:1px solid #2a2d31;
    }
    .game-page-meta strong{color:#19d978}
    .game-team-row{
      display:grid;grid-template-columns:52px minmax(0,1fr) 52px;
      align-items:center;gap:10px;padding:10px 0 4px;
    }
    .game-team-logo{width:48px;height:48px;object-fit:contain}
    .game-team-logo-fallback{
      width:48px;height:48px;border:1px solid #34373c;border-radius:10px;
      display:flex;align-items:center;justify-content:center;
    }
    .game-team-copy strong{display:block;color:#fff;font-size:1.05rem;font-weight:950}
    .game-team-copy span{display:block;color:#a7abb2;font-size:.75rem;margin-top:2px}
    .game-team-row>b{color:#fff;text-align:right;font-size:1.12rem}
    .roster-team-title{color:#f6c84c;font-weight:900;margin:2px 0 4px}
    .lineup-status{
      display:inline-block;margin:0 0 7px;padding:3px 7px;border-radius:999px;
      font-size:.58rem;font-weight:950;letter-spacing:.055em;
    }
    .lineup-status.confirmed{
      color:#19d978;border:1px solid rgba(25,217,120,.55);
      background:rgba(25,217,120,.08);
    }
    .lineup-status.projected{
      color:#f6c84c;border:1px solid rgba(246,200,76,.55);
      background:rgba(246,200,76,.08);
    }
    div[class*="st-key-open_player_"] button{
      background:#101112!important;color:#fff!important;border:1px solid #30343a!important;
      border-radius:9px!important;min-height:39px!important;text-align:left!important;
      justify-content:flex-start!important;font-size:.72rem!important;font-weight:800!important;
      padding:.32rem .45rem!important;
    }
    div[class*="st-key-open_player_"] button:hover{
      border-color:#19d978!important;color:#fff!important;
    }
    @media(max-width:700px){
      .game-team-row{grid-template-columns:44px minmax(0,1fr) 38px;gap:8px}
      .game-team-logo,.game-team-logo-fallback{width:40px;height:40px}
      .game-team-copy strong{font-size:.94rem}
      div[class*="st-key-open_player_"] button{font-size:.65rem!important;padding:.28rem .30rem!important}
    }
    div[class*="st-key-back_to_mlb_from_game"] button{
      background:#080909!important;color:#fff!important;border:1.5px solid #34373c!important;
      border-radius:10px!important;min-height:38px!important;font-weight:800!important;
    }
    div[class*="st-key-back_to_mlb_from_game"] button:hover{
      border-color:#d6b35c!important;color:#f6c84c!important;
    }
    @media(max-width:700px){
      div[class*="st-key-back_to_mlb_from_game"]{margin-top:-2.15rem!important;margin-bottom:.2rem!important}
    }
    </style>
    """,
    unsafe_allow_html=True,
)

if st.button("← Back to MLB", key="back_to_mlb_from_game"):
    st.switch_page("pages/mlb.py")

selected = st.session_state.get("mlb_selected_game")
if not isinstance(selected, dict) or not selected.get("game_pk"):
    st.warning("Choose a game from the MLB slate first.")
    st.page_link("pages/mlb.py", label="Return to MLB", icon="⚾")
    st.stop()

game = _find_game(selected.get("game_pk")) or selected
lineup_game = _find_lineups(game.get("game_pk"))

st.markdown("## ⚾ Game Intelligence")
st.markdown(
    f"""
    <div class="game-page-head">
      <div class="game-page-meta">
        <strong>{_status(game)}</strong>
        <span>{escape(str(game.get("venue") or "Venue TBA"))}</span>
      </div>
      {_team_row(game, "away")}
      {_team_row(game, "home")}
    </div>
    """,
    unsafe_allow_html=True,
)

st.markdown("### Starting Lineups")

lineup_data = load_today_lineups()
lineup_game = lineup_game or {
    "game_pk": game.get("game_pk"),
    "away_team": game.get("away_team"),
    "home_team": game.get("home_team"),
    "away_lineup": [],
    "home_lineup": [],
    "away_lineup_confirmed": False,
    "home_lineup_confirmed": False,
}

projection = get_previous_day_lineup_projection(
    current_lineup_data=lineup_data,
)

projected_for_game = [
    player
    for player in projection.get("projected_hitters", [])
    if player.get("game_pk") == game.get("game_pk")
]

away_projected = [
    player for player in projected_for_game
    if int(player.get("team_id") or 0) == int(game.get("away_team_id") or 0)
]
home_projected = [
    player for player in projected_for_game
    if int(player.get("team_id") or 0) == int(game.get("home_team_id") or 0)
]

away_confirmed = bool(lineup_game.get("away_lineup_confirmed"))
home_confirmed = bool(lineup_game.get("home_lineup_confirmed"))

away_players = (
    lineup_game.get("away_lineup", [])
    if away_confirmed
    else away_projected
)
home_players = (
    lineup_game.get("home_lineup", [])
    if home_confirmed
    else home_projected
)

away_col, home_col = st.columns(2, gap="small")
with away_col:
    _roster_column(
        str(lineup_game.get("away_team") or game.get("away_team") or "Away"),
        away_players,
        game,
        confirmed=away_confirmed,
    )
with home_col:
    _roster_column(
        str(lineup_game.get("home_team") or game.get("home_team") or "Home"),
        home_players,
        game,
        confirmed=home_confirmed,
    )

st.caption(
    "Confirmed lineups replace projections automatically. "
    "Projected lineups use each team's most recent confirmed batting order."
)
st.caption("Tap any lineup player to open the dedicated Player Intelligence page.")
