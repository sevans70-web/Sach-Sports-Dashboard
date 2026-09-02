"""Compact MLB slate cards that open a dedicated game page."""

from __future__ import annotations

from html import escape
from typing import Any

import streamlit as st

from data.mlb_live import get_team_logo_url, get_today_mlb_schedule



TEAM_ABBR = {
    "Arizona Diamondbacks":"ARI","Atlanta Braves":"ATL",
    "Baltimore Orioles":"BAL","Boston Red Sox":"BOS",
    "Chicago Cubs":"CHC","Chicago White Sox":"CWS",
    "Cincinnati Reds":"CIN","Cleveland Guardians":"CLE",
    "Colorado Rockies":"COL","Detroit Tigers":"DET",
    "Houston Astros":"HOU","Kansas City Royals":"KC",
    "Los Angeles Angels":"LAA","Los Angeles Dodgers":"LAD",
    "Miami Marlins":"MIA","Milwaukee Brewers":"MIL",
    "Minnesota Twins":"MIN","New York Mets":"NYM",
    "New York Yankees":"NYY","Oakland Athletics":"ATH",
    "Philadelphia Phillies":"PHI","Pittsburgh Pirates":"PIT",
    "San Diego Padres":"SD","San Francisco Giants":"SF",
    "Seattle Mariners":"SEA","St. Louis Cardinals":"STL",
    "Tampa Bay Rays":"TB","Texas Rangers":"TEX",
    "Toronto Blue Jays":"TOR","Washington Nationals":"WSH",
}


@st.cache_data(ttl=300, show_spinner=False)
def load_today_schedule() -> dict[str, Any]:
    return get_today_mlb_schedule()


@st.cache_data(ttl=300, show_spinner=False)
def load_today_lineups() -> dict[str, Any]:
    # Lazy import avoids Streamlit Community Cloud module-reload races during app startup.
    from data.mlb_lineups import get_mlb_lineups

    return get_mlb_lineups()


def _abbr(name: str) -> str:
    return TEAM_ABBR.get(str(name), str(name)[:3].upper())


def _logo(team_id: Any, name: str) -> str:
    url = get_team_logo_url(int(team_id)) if team_id else None
    if url:
        return (
            f"<img class='mlb-slate-logo' src='{escape(url)}' "
            f"alt='{escape(name)} logo'>"
        )
    return "<div class='mlb-slate-logo-fallback'>⚾</div>"


def _status_label(game: dict[str, Any]) -> str:
    status_group = str(game.get("status_group") or "").lower()
    if status_group == "live":
        return f"● LIVE · {escape(str(game.get('status') or 'In progress'))}"
    if status_group == "final":
        return "FINAL"
    return escape(str(game.get("start_time") or "Time TBA"))


def _score_or_record(game: dict[str, Any], side: str) -> str:
    """Show only an actual live/final game score; never a pregame season record."""
    status_group = str(game.get("status_group") or "").lower()
    if status_group in {"live", "final"}:
        score = game.get(f"{side}_score")
        return "—" if score is None else str(score)
    return ""


def _top_ranked_for_team(
    player_lookup: dict[int, dict[str, Any]],
    team_name: str,
) -> dict[str, Any] | None:
    matches = []
    for player in player_lookup.values():
        pteam = str(player.get("team") or player.get("team_name") or "")
        if pteam == team_name:
            matches.append(player)
    if not matches:
        return None
    return min(matches, key=lambda item: int(item.get("rank") or 999))


def _team_intel(player: dict[str, Any] | None) -> str:
    if not player:
        return ""
    name = str(player.get("player") or player.get("player_name") or "Player")
    rank = player.get("rank")
    score = float(player.get("score", player.get("gi_score", 0)) or 0)
    rank_text = f"#{rank}" if rank else "GI"
    return f"Lineup GI {rank_text} · {escape(name)} · {score:.1f}"


def _render_game_card(
    game: dict[str, Any],
    player_lookup: dict[int, dict[str, Any]],
) -> None:
    game_pk = game.get("game_pk")
    away = str(game.get("away_team") or "Away")
    home = str(game.get("home_team") or "Home")
    live = str(game.get("status_group") or "").lower() == "live"

    away_top = _top_ranked_for_team(player_lookup, away)
    home_top = _top_ranked_for_team(player_lookup, home)

    live_class = " mlb-live-card" if live else ""

    # Use Streamlit's HTML renderer so the card markup can never be
    # reinterpreted as Markdown/code on mobile.
    away_intel_html = f"<small>{_team_intel(away_top)}</small>" if away_top else ""
    home_intel_html = f"<small>{_team_intel(home_top)}</small>" if home_top else ""
    card_html = (
        f'<div class="mlb-slate-card{live_class}">'
        f'<div class="mlb-slate-top">'
        f'<span class="mlb-slate-status">{_status_label(game)}</span>'
        f'<span>{escape(str(game.get("venue") or "Venue TBA"))}</span>'
        f'</div>'
        f'<div class="mlb-slate-team">'
        f'{_logo(game.get("away_team_id"), away)}'
        f'<div class="mlb-slate-team-main">'
        f'<strong>{escape(away)}</strong>'
        f'<span>{escape(str(game.get("away_probable_pitcher") or "Pitcher TBA"))}</span>'
        f'{away_intel_html}'
        f'</div>'
        f'<b>{_score_or_record(game, "away")}</b>'
        f'</div>'
        f'<div class="mlb-slate-team">'
        f'{_logo(game.get("home_team_id"), home)}'
        f'<div class="mlb-slate-team-main">'
        f'<strong>{escape(home)}</strong>'
        f'<span>{escape(str(game.get("home_probable_pitcher") or "Pitcher TBA"))}</span>'
        f'{home_intel_html}'
        f'</div>'
        f'<b>{_score_or_record(game, "home")}</b>'
        f'</div>'
        f'</div>'
    )
    st.html(card_html)

    if st.button(
        f"View {_abbr(away)} @ {_abbr(home)}  →",
        key=f"mlb_open_game_{game_pk}",
        use_container_width=True,
    ):
        st.session_state["mlb_selected_game"] = game
        st.session_state["mlb_ranked_player_lookup"] = player_lookup
        st.switch_page("pages/mlb_game.py")


def render_live_mlb_schedule(
    player_lookup: dict[int, dict[str, Any]] | None = None,
    player_renderer: Any | None = None,
) -> dict[str, Any]:
    del player_renderer  # Game/player details now live on dedicated pages.
    player_lookup = player_lookup or {}

    st.markdown(
        """
        <style>
        .mlb-slate-card{
          background:linear-gradient(118deg,#101112 0%,#111315 68%,rgba(25,217,120,.055) 100%);
          border:1.5px solid #30343a;
          border-radius:13px;
          padding:10px 11px 8px;
          margin:8px 0 4px;
        }
        .mlb-live-card{border-color:#19d978;box-shadow:inset 0 0 0 1px rgba(25,217,120,.18)}
        .mlb-slate-top{
          display:flex;justify-content:space-between;gap:8px;
          color:#8f949c;font-size:.68rem;font-weight:750;
          padding-bottom:7px;border-bottom:1px solid #292c31;
        }
        .mlb-slate-status{color:#19d978!important;font-weight:900!important}
        .mlb-slate-team{
          display:grid;grid-template-columns:42px minmax(0,1fr) 44px;
          align-items:center;gap:9px;padding:8px 0 3px;
        }
        .mlb-slate-team + .mlb-slate-team{padding-top:6px}
        .mlb-slate-logo{width:38px;height:38px;object-fit:contain;display:block}
        .mlb-slate-logo-fallback{
          width:38px;height:38px;display:flex;align-items:center;justify-content:center;
          border-radius:9px;background:#080909;border:1px solid #30343a;
        }
        .mlb-slate-team-main{min-width:0}
        .mlb-slate-team-main strong{
          display:block;color:#fff;font-size:.92rem;line-height:1.12;font-weight:900;
        }
        .mlb-slate-team-main span{
          display:block;color:#a7abb2;font-size:.70rem;line-height:1.2;margin-top:2px;
        }
        .mlb-slate-team-main small{
          display:block;color:#d6b35c;font-size:.62rem;line-height:1.2;margin-top:3px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        .mlb-slate-team>b{
          color:#fff;font-size:1rem;text-align:right;font-weight:950;
        }

        div[class*="st-key-mlb_open_game_"]{margin:0 0 7px!important}
        div[class*="st-key-mlb_open_game_"] button{
          min-height:34px!important;padding:.18rem .55rem!important;
          background:#080909!important;color:#f6c84c!important;
          border:1px solid rgba(214,179,92,.58)!important;border-radius:9px!important;
          font-size:.72rem!important;font-weight:850!important;
        }

        @media(max-width:700px){
          .mlb-slate-card{padding:9px 10px 7px}
          .mlb-slate-team{grid-template-columns:38px minmax(0,1fr) 36px;gap:8px}
          .mlb-slate-logo,.mlb-slate-logo-fallback{width:34px;height:34px}
          .mlb-slate-team-main strong{font-size:.88rem}
          .mlb-slate-team-main span{font-size:.67rem}
          .mlb-slate-team-main small{font-size:.58rem}
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    schedule = load_today_schedule()
    lineup_data = load_today_lineups()
    schedule["lineup_data"] = lineup_data

    if not schedule.get("success"):
        st.error("The MLB schedule could not be loaded.")
        return schedule

    games = schedule.get("games", [])
    if not games:
        st.caption("No MLB games are scheduled for today's Toronto date.")
        return schedule


    for game in games:
        _render_game_card(game, player_lookup)

    return schedule


def schedule_summary(schedule: dict[str, Any]) -> dict[str, int]:
    games = schedule.get("games", [])
    lineup_data = schedule.get("lineup_data", {}) or {}

    live = sum(
        str(game.get("status_group", "")).lower() == "live"
        for game in games
    )
    final = sum(
        str(game.get("status_group", "")).lower() == "final"
        for game in games
    )

    confirmed = 0
    total_team_lineups = len(games) * 2
    for game in lineup_data.get("games", []):
        if game.get("away_lineup"):
            confirmed += 1
        if game.get("home_lineup"):
            confirmed += 1

    return {
        "games": len(games),
        "live": live,
        "final": final,
        "lineups_confirmed": confirmed,
        "lineups_total": total_team_lineups,
    }
