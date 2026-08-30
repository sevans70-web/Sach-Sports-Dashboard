"""Dedicated MLB game page: matchup -> confirmed roster -> player page."""

from __future__ import annotations

from html import escape
from typing import Any

import streamlit as st

from components.mlb_schedule import load_today_lineups, load_today_schedule
from data.mlb_live import get_team_logo_url


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
) -> None:
    st.markdown(f"<div class='roster-team-title'>{escape(title)}</div>", unsafe_allow_html=True)

    if not players:
        st.caption("Official lineup has not been posted yet.")
        return

    for player in players:
        order = player.get("batting_order") or "—"
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
    .roster-team-title{color:#f6c84c;font-weight:900;margin:2px 0 6px}
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

if not lineup_game:
    st.caption("Official lineups are not available for this game yet.")
else:
    away_col, home_col = st.columns(2, gap="small")
    with away_col:
        _roster_column(
            str(lineup_game.get("away_team") or game.get("away_team") or "Away"),
            lineup_game.get("away_lineup", []),
            game,
        )
    with home_col:
        _roster_column(
            str(lineup_game.get("home_team") or game.get("home_team") or "Home"),
            lineup_game.get("home_lineup", []),
            game,
        )

st.caption("Tap any lineup player to open the dedicated Player Intelligence page.")
