"""Mobile-first MLB schedule with in-card game expansion."""

from __future__ import annotations

from datetime import datetime
from html import escape
from typing import Any
from zoneinfo import ZoneInfo

import streamlit as st

from data.mlb_live import get_today_mlb_schedule
from data.mlb_lineups import get_mlb_lineups


TORONTO_TIMEZONE = ZoneInfo("America/Toronto")

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
    return get_mlb_lineups()


def _abbr(name: str) -> str:
    return TEAM_ABBR.get(str(name), str(name)[:3].upper())


def _score_text(score: Any) -> str:
    return "—" if score is None else str(score)


def _status_icon(status_group: str) -> str:
    normalized = str(status_group or "").strip().lower()
    if normalized == "live":
        return "🔴"
    if normalized == "final":
        return "✅"
    return "🕒"


def _selected_game_lineups(
    game_pk: Any,
    lineup_data: dict[str, Any],
) -> dict[str, Any] | None:
    for game in lineup_data.get("games", []):
        if game.get("game_pk") == game_pk:
            return game
    return None


def _render_roster_column(
    title: str,
    lineup: list[dict[str, Any]],
    player_lookup: dict[int, dict[str, Any]],
) -> None:
    st.markdown(f"**{title}**")

    if not lineup:
        st.caption("Official batting order has not been posted yet.")
        return

    for player in lineup:
        player_id = int(player.get("player_id") or 0)
        order = player.get("batting_order") or "—"
        name = str(player.get("player_name") or "Player")
        position = str(player.get("position_abbreviation") or "")

        label = f"{order}. {name}"
        if position:
            label += f" · {position}"

        if st.button(
            label,
            key=f"roster_player_{player_id}_{title}",
            use_container_width=True,
        ):
            st.session_state["selected_game_player_id"] = player_id


def _render_game_details(
    game: dict[str, Any],
    lineup_data: dict[str, Any],
    player_lookup: dict[int, dict[str, Any]],
    player_renderer: Any | None,
) -> None:
    lineup_game = _selected_game_lineups(
        game.get("game_pk"),
        lineup_data,
    )

    st.markdown(
        f"""
        <div class="mlb-expanded-game-head">
            <strong>
                {_abbr(game.get('away_team'))}
                @ {_abbr(game.get('home_team'))}
            </strong>
            <span>
                {escape(str(game.get('venue') or 'Venue TBA'))}
            </span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if not lineup_game:
        st.caption("Official lineups are not available for this game yet.")
        return

    with st.container(key=f"mlb_roster_grid_{game.get('game_pk')}"):
        away_col, home_col = st.columns(2, gap="small")

        with away_col:
            _render_roster_column(
                _abbr(str(lineup_game.get("away_team") or "Away")),
                lineup_game.get("away_lineup", []),
                player_lookup,
            )

        with home_col:
            _render_roster_column(
                _abbr(str(lineup_game.get("home_team") or "Home")),
                lineup_game.get("home_lineup", []),
                player_lookup,
            )

    selected_id = int(
        st.session_state.get("selected_game_player_id") or 0
    )
    ranked = player_lookup.get(selected_id)

    if selected_id and ranked and player_renderer:
        player_renderer(ranked)
    elif selected_id and not ranked:
        st.caption(
            "This lineup player is not currently in today's "
            "displayed Top 25 lists."
        )


def _render_game_card(
    game: dict[str, Any],
    lineup_data: dict[str, Any],
    player_lookup: dict[int, dict[str, Any]],
    player_renderer: Any | None,
) -> None:
    game_pk = game.get("game_pk")
    away = str(game.get("away_team") or "Away")
    home = str(game.get("home_team") or "Home")
    status_group = str(game.get("status_group") or "Preview")
    status = str(game.get("status") or "Status unavailable")

    if status_group.lower() in {"live", "final"}:
        matchup = (
            f"{_abbr(away)} {_score_text(game.get('away_score'))} @ "
            f"{_abbr(home)} {_score_text(game.get('home_score'))}"
        )
    else:
        matchup = f"{_abbr(away)} @ {_abbr(home)}"

    open_key = f"mlb_game_open_{game_pk}"

    if open_key not in st.session_state:
        st.session_state[open_key] = False

    with st.container(
        border=True,
        key=f"mlb_game_card_{game_pk}",
    ):
        st.markdown(
            f"<div class='mlb-game-matchup'>"
            f"{escape(matchup)}"
            f"</div>",
            unsafe_allow_html=True,
        )

        st.markdown(
            f"<div class='mlb-game-meta'>"
            f"{escape(str(game.get('start_time') or 'Time TBA'))}"
            f"</div>"
            f"<div class='mlb-game-pitchers'>"
            f"{escape(str(game.get('away_probable_pitcher') or 'TBA'))} "
            f"vs. "
            f"{escape(str(game.get('home_probable_pitcher') or 'TBA'))}"
            f"</div>"
            f"<div class='mlb-game-venue'>"
            f"{escape(str(game.get('venue') or 'Venue TBA'))}"
            f"</div>",
            unsafe_allow_html=True,
        )

        if st.button(
            "Close game"
            if st.session_state[open_key]
            else "Open game",
            key=f"toggle_game_{game_pk}",
            use_container_width=True,
        ):
            st.session_state[open_key] = not st.session_state[open_key]
            st.session_state.pop(
                "selected_game_player_id",
                None,
            )

        if st.session_state[open_key]:
            _render_game_details(
                game,
                lineup_data,
                player_lookup,
                player_renderer,
            )


def render_live_mlb_schedule(
    player_lookup: dict[int, dict[str, Any]] | None = None,
    player_renderer: Any | None = None,
) -> dict[str, Any]:
    st.markdown(
        """
        <style>
        /* True 2-across mobile game grid. Target actual Streamlit stColumn nodes. */
        div[class*="st-key-mlb_game_grid"] [data-testid="stHorizontalBlock"]{
            display:flex!important;
            flex-direction:row!important;
            flex-wrap:nowrap!important;
            gap:6px!important;
            width:100%!important;
        }
        div[class*="st-key-mlb_game_grid"] [data-testid="stColumn"]{
            flex:0 0 calc(50% - 3px)!important;
            width:calc(50% - 3px)!important;
            min-width:0!important;
            max-width:calc(50% - 3px)!important;
        }
        div[class*="st-key-mlb_game_card_"] [data-testid="stVerticalBlockBorderWrapper"]{
            background:linear-gradient(115deg,rgba(255,204,51,.07),#0c0d0e 42%,rgba(25,217,120,.05))!important;
            border:2px solid #34373c!important;
            border-radius:12px!important;
            padding:.36rem!important;
            overflow:hidden!important;
        }
        div[class*="st-key-mlb_game_card_"] [data-testid="stVerticalBlock"]{
            gap:.18rem!important;
        }
        .mlb-game-matchup{
            font-weight:900!important;
            font-size:.84rem!important;
            color:#fff!important;
            white-space:normal!important;
            line-height:1.12!important;
            overflow-wrap:anywhere!important;
        }
        .mlb-game-meta{
            color:#a7abb2!important;
            font-size:.67rem!important;
            line-height:1.12!important;
            margin-top:1px!important;
        }
        .mlb-game-pitchers{
            color:#f2f3f4!important;
            font-size:.74rem!important;
            font-weight:800!important;
            line-height:1.16!important;
            margin-top:2px!important;
            overflow-wrap:anywhere!important;
        }
        .mlb-game-venue{
            color:#d6b35c!important;
            font-size:.61rem!important;
            line-height:1.10!important;
            margin-top:1px!important;
        }

        /* Open/Close button: roughly half the game-card width. */
        div[class*="st-key-toggle_game_"]{
            display:flex!important;
            justify-content:center!important;
            margin-top:3px!important;
        }
        div[class*="st-key-toggle_game_"] button{
            width:48%!important;
            max-width:48%!important;
            min-width:72px!important;
            min-height:30px!important;
            padding:.18rem .20rem!important;
            background:#080909!important;
            color:#fff!important;
            border:2px solid #d6b35c!important;
            border-radius:8px!important;
            font-size:.62rem!important;
            font-weight:850!important;
        }

        .mlb-expanded-game-head{
            margin:5px 0 4px!important;
            padding:6px 7px!important;
            border-radius:9px!important;
            border:2px solid rgba(214,179,92,.60)!important;
            background:#080909!important;
        }
        .mlb-expanded-game-head strong{display:block;color:#fff;font-size:.78rem!important}
        .mlb-expanded-game-head span{display:block;color:#b8bbc0;font-size:.62rem!important;margin-top:1px!important}

        /* Expanded roster: force both teams to remain side-by-side on mobile. */
        div[class*="st-key-mlb_roster_grid_"] [data-testid="stHorizontalBlock"]{
            display:flex!important;
            flex-direction:row!important;
            flex-wrap:nowrap!important;
            gap:6px!important;
            width:100%!important;
        }
        div[class*="st-key-mlb_roster_grid_"] [data-testid="stColumn"]{
            flex:0 0 calc(50% - 3px)!important;
            width:calc(50% - 3px)!important;
            min-width:0!important;
            max-width:calc(50% - 3px)!important;
        }
        div[class*="st-key-roster_player_"] button{
            width:100%!important;
            max-width:100%!important;
            min-height:31px!important;
            padding:.18rem .16rem!important;
            background:#080909!important;
            color:#fff!important;
            border:2px solid rgba(25,217,120,.62)!important;
            border-radius:8px!important;
            font-size:.61rem!important;
            font-weight:800!important;
            line-height:1.10!important;
            white-space:normal!important;
        }

        @media(max-width:700px){
            div[class*="st-key-mlb_game_grid"] [data-testid="stHorizontalBlock"],
            div[class*="st-key-mlb_roster_grid_"] [data-testid="stHorizontalBlock"]{
                gap:5px!important;
            }
            div[class*="st-key-mlb_game_grid"] [data-testid="stColumn"],
            div[class*="st-key-mlb_roster_grid_"] [data-testid="stColumn"]{
                flex-basis:calc(50% - 2.5px)!important;
                width:calc(50% - 2.5px)!important;
                max-width:calc(50% - 2.5px)!important;
            }
            .mlb-game-matchup{font-size:.78rem!important}
            .mlb-game-pitchers{font-size:.70rem!important}
            div[class*="st-key-toggle_game_"] button{width:50%!important;max-width:50%!important}
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    schedule = load_today_schedule()
    lineup_data = load_today_lineups()
    player_lookup = player_lookup or {}

    st.subheader("Today's MLB Games")

    refresh_col, updated_col = st.columns([1, 2])

    with refresh_col:
        if st.button(
            "Refresh",
            key="refresh_live_mlb_schedule",
            use_container_width=True,
        ):
            load_today_schedule.clear()
            load_today_lineups.clear()
            st.rerun()

    with updated_col:
        fetched_at = schedule.get("fetched_at")
        if fetched_at:
            try:
                dt = datetime.fromisoformat(
                    str(fetched_at)
                ).astimezone(TORONTO_TIMEZONE)
                st.caption(
                    f"Updated {dt.strftime('%I:%M %p ET')}"
                )
            except ValueError:
                pass

    if not schedule.get("success"):
        st.error("The MLB schedule could not be loaded.")
        return schedule

    games = schedule.get("games", [])

    if not games:
        st.caption(
            "No MLB games are scheduled for today's Toronto date."
        )
        return schedule

    with st.container(key="mlb_game_grid"):
        for start in range(0, len(games), 2):
            columns = st.columns(2, gap="small")

            for offset, game in enumerate(
                games[start:start + 2]
            ):
                with columns[offset]:
                    _render_game_card(
                        game,
                        lineup_data,
                        player_lookup,
                        player_renderer,
                    )

    schedule["lineup_data"] = lineup_data
    return schedule


def schedule_summary(
    schedule: dict[str, Any],
) -> dict[str, int]:
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
    upcoming = sum(
        str(game.get("status_group", "")).lower() == "preview"
        for game in games
    )

    confirmed = 0

    for game in lineup_data.get("games", []):
        confirmed += int(
            bool(game.get("away_lineup_confirmed"))
        )
        confirmed += int(
            bool(game.get("home_lineup_confirmed"))
        )

    return {
        "games": len(games),
        "live": live,
        "final": final,
        "upcoming": upcoming,
        "confirmed_teams": confirmed,
        "total_teams": len(games) * 2,
    }
