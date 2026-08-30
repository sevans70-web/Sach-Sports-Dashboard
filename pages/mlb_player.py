"""Dedicated MLB Player Intelligence page."""

from __future__ import annotations

from html import escape
from typing import Any

import streamlit as st

from data.mlb_player_profile import (
    get_batter_vs_pitcher_history,
    get_player_bio,
    get_player_game_log,
    get_spring_training_hitting,
    summarize_game_log,
)
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
        f"<div class='player-profile-photo'><img src='{escape(image)}' alt='{escape(name)} headshot'></div>"
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


def _market_context_grid(player: dict[str, Any]) -> None:
    markets = list(player.get("market_context") or [])
    if not markets:
        return

    markets.sort(
        key=lambda item: float(
            item.get("gi_score", item.get("score", 0)) or 0
        ),
        reverse=True,
    )

    cards = []
    for market in markets[:6]:
        category = escape(str(market.get("category") or "Market"))
        rank = escape(str(market.get("rank") or "—"))
        gi = float(market.get("gi_score", market.get("score", 0)) or 0)
        cards.append(
            "<div class='player-market-chip'>"
            f"<strong>{category}</strong>"
            f"<span>#{rank} · GI {gi:.1f}</span>"
            "</div>"
        )

    st.markdown(
        "<div class='player-market-grid'>" + "".join(cards) + "</div>",
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
      width:72px;height:72px;border-radius:13px;overflow:hidden;
      background:#080909;border:2px solid rgba(214,179,92,.82);
    }
    .player-profile-photo img{
      width:100%;height:100%;display:block;object-fit:cover;object-position:center 18%;
      transform:scale(1.24);transform-origin:center 22%;
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
    .player-market-grid{
      display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin:7px 0 11px;
    }
    .player-market-chip{
      background:#0c0e0f;border:1px solid #30343a;border-radius:9px;padding:7px 8px;min-width:0;
    }
    .player-market-chip strong{display:block;color:#fff;font-size:.72rem;line-height:1.15}
    .player-market-chip span{display:block;color:#19d978;font-size:.67rem;font-weight:850;margin-top:3px}
    .player-window-note{color:#a7abb2;font-size:.70rem;margin:1px 0 7px}
    .player-profile-grid{
      display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:8px 0;
    }
    .player-profile-metric{
      min-width:0;background:linear-gradient(145deg,#111315,#0d0f10);
      border:1.5px solid rgba(214,179,92,.62);border-left:3px solid #19d978;border-radius:10px;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.025);
      min-height:68px;padding:7px 6px;display:flex;flex-direction:column;justify-content:center;
    }
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

    .player-bvp-card,.player-intel-card{
      background:#101112;border:1.5px solid #34373c;border-radius:11px;padding:10px 11px;margin-top:9px;
    }
    .player-bvp-card h4,.player-intel-card h4{margin:0 0 6px;color:#f6c84c;font-size:.92rem}
    .player-bvp-grid{
      display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:7px;
    }
    .player-bvp-stat{
      background:linear-gradient(145deg,#111315,#090b0c);
      border:1.5px solid rgba(214,179,92,.62);border-bottom:2px solid #19d978;
      border-radius:8px;padding:7px 5px;min-width:0;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.025);
    }
    .player-bvp-stat span{display:block;color:#90959d;font-size:.55rem}
    .player-bvp-stat strong{display:block;color:#fff;font-size:.82rem;margin-top:2px}
    .player-intel-point{
      color:#d9dbde;font-size:.75rem;line-height:1.38;padding:6px 0;border-bottom:1px solid #272a2f;
    }
    .player-intel-point:last-child{border-bottom:0}
    .player-intel-point b{color:#19d978}
    div[class*="st-key-back_to_mlb_game"] button{
      background:#080909!important;color:#fff!important;border:1.5px solid #34373c!important;
      border-radius:10px!important;min-height:38px!important;
    }

    @media(max-width:700px){
      div[class*="st-key-back_to_mlb_game"]{margin-top:-2.15rem!important;margin-bottom:.15rem!important}
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
_market_context_grid(player)

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
pitcher_id = int(player.get("opposing_probable_pitcher_id") or 0)
hand = str(
    player.get("opposing_pitcher_hand_description")
    or player.get("opposing_pitcher_hand")
    or ""
)
venue = str(game.get("venue") or player.get("venue") or "Venue TBA")



# Batter vs. pitcher history.
bvp = get_batter_vs_pitcher_history(
    int(player["player_id"]),
    pitcher_id,
) if pitcher_id else {}

if bvp:
    st.markdown(
        "<div class='player-bvp-card'>"
        f"<h4>⚔️ Head-to-Head vs. {escape(pitcher)}</h4>"
        "<div class='player-bvp-grid'>"
        + _metric("PA", _fmt_num(bvp.get("plate_appearances")))
        .replace("player-profile-metric", "player-bvp-stat")
        + _metric("Hits", _fmt_num(bvp.get("hits")))
        .replace("player-profile-metric", "player-bvp-stat")
        + _metric("HR", _fmt_num(bvp.get("home_runs")))
        .replace("player-profile-metric", "player-bvp-stat")
        + _metric("AVG", _fmt_rate(bvp.get("avg")))
        .replace("player-profile-metric", "player-bvp-stat")
        + "</div></div>",
        unsafe_allow_html=True,
    )
else:
    st.markdown(
        f"<div class='player-bvp-card'><h4>⚔️ Head-to-Head vs. {escape(pitcher)}</h4>"
        "<div class='player-intel-point'>No prior MLB batter-vs-pitcher sample is available. "
        "That means today's evaluation should lean more heavily on current form, handedness, "
        "pitch profile and contact quality.</div></div>",
        unsafe_allow_html=True,
    )

# Build educational Today's Intelligence.
l5 = summarize_game_log(game_log, "L5") if game_log else {}
l10 = summarize_game_log(game_log, "L10") if game_log else {}
ranking = player.get("ranking") if isinstance(player.get("ranking"), dict) else {}
bio = get_player_bio(int(player["player_id"]))
spring = {}
season_pa = int((summarize_game_log(game_log, "Season") if game_log else {}).get("plate_appearances") or 0)
if 0 < season_pa <= 130:
    spring = get_spring_training_hitting(int(player["player_id"]))

intel_points = []

if l5.get("games"):
    intel_points.append(
        f"<b>Recent form:</b> Over the last five games, {escape(str(player.get('player_name') or 'This hitter'))} "
        f"is batting {_fmt_rate(l5.get('avg'))} with {_fmt_num(l5.get('home_runs'))} HR and "
        f"{_fmt_num(l5.get('total_bases'))} total bases. This tells you whether today's ranking is "
        "being supported by current production rather than season reputation alone."
    )

if ranking:
    category = escape(str(ranking.get("category") or "market"))
    gi = float(ranking.get("gi_score", ranking.get("score", 0)) or 0)
    rank = ranking.get("rank") or "—"
    intel_points.append(
        f"<b>GI context:</b> The player is currently #{escape(str(rank))} in {category} with a GI score of {gi:.1f}. "
        "GI blends performance, matchup, lineup position, park/weather and sample reliability rather than using one stat in isolation."
    )

if bvp:
    pa = int(bvp.get("plate_appearances") or 0)
    intel_points.append(
        f"<b>Pitcher history:</b> {int(bvp.get('hits') or 0)} hits and {int(bvp.get('home_runs') or 0)} HR "
        f"in {pa} PA against {escape(pitcher)}. "
        + (
            "That is useful matchup evidence, but the sample is small enough that it should not outweigh broader indicators."
            if pa < 15 else
            "The sample is large enough to be meaningful context, though current form and pitch mix still matter."
        )
    )
else:
    intel_points.append(
        f"<b>Pitcher matchup:</b> There is no usable head-to-head sample against {escape(pitcher)}, "
        "so the model should rely more on handedness, recent form and the pitcher/hitter skill profiles."
    )

order = player.get("batting_order")
if order:
    intel_points.append(
        f"<b>Opportunity:</b> Batting #{int(order)} shapes expected plate appearances. "
        + (
            "A top-of-order slot increases the chance of getting an extra trip to the plate."
            if int(order) <= 3 else
            "This lineup position gives fewer expected plate appearances than the top of the order, so opportunity is slightly lower."
        )
    )

if spring.get("at_bats"):
    intel_points.append(
        f"<b>Limited-sample context:</b> In Spring Training, the player had "
        f"{int(spring.get('hits') or 0)} hits and {int(spring.get('home_runs') or 0)} HR in "
        f"{int(spring.get('at_bats') or 0)} AB. Spring results are not equal to regular-season MLB results, "
        "but they help add context when the MLB sample is still small."
    )

st.markdown(
    "<div class='player-intel-card'><h4>🧠 Today's Intelligence</h4>"
    + "".join(f"<div class='player-intel-point'>{point}</div>" for point in intel_points[:5])
    + "</div>",
    unsafe_allow_html=True,
)

