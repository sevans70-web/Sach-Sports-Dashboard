from __future__ import annotations

from datetime import datetime
from html import escape
from pathlib import Path
from zoneinfo import ZoneInfo
import json

import pandas as pd
import streamlit as st

from data.nfl_odds import get_nfl_odds_feed_status
from data.nfl_roster import load_nfl_roster
from data.nfl_schedule import load_nfl_schedule
from engines.nfl_passing_market_join import attach_live_passing_yards_lines
from engines.nfl_passing_probability import attach_passing_yards_probabilities
from engines.nfl_passing_projection import build_passing_yards_projection
from engines.nfl_passing_ranking import rank_passing_yards_top25
from engines.nfl_rushing_yards import build_rushing_yards_top25
from engines.nfl_receiving_yards import build_receiving_yards_top25
from engines.nfl_receptions import build_receptions_top25
from engines.nfl_touchdowns import build_anytime_td_top25, build_first_td_top25
from engines.nfl_additional_props import (
    build_passing_tds_top25,
    build_passing_rushing_yards_top25,
    build_rushing_receiving_yards_top25,
    build_sacks_top25,
    build_tackles_top25,
)

NFL_SEASON = 2026
NFL_BASELINE_SEASON = 2025
TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
NFL_MOVEMENT_FILE = Path("/tmp/sach_nfl_rank_movement.json")

PROP_CATALOG = {
    "Passing Yards": {"builder": "passing", "projection": "passing_yards_projection_matchup", "unit": "yards", "icon": "🏈"},
    "Passing TDs": {"builder": build_passing_tds_top25, "projection": "passing_tds_projection", "unit": "TDs", "icon": "🎯"},
    "Pass + Rush Yds": {"builder": build_passing_rushing_yards_top25, "projection": "passing_rushing_projection", "unit": "yards", "icon": "⚡"},
    "Rushing Yards": {"builder": build_rushing_yards_top25, "projection": "rushing_projection", "unit": "yards", "icon": "🏃"},
    "Rush + Rec Yds": {"builder": build_rushing_receiving_yards_top25, "projection": "rushing_receiving_projection", "unit": "yards", "icon": "🔀"},
    "Receiving Yards": {"builder": build_receiving_yards_top25, "projection": "receiving_projection", "unit": "yards", "icon": "🙌"},
    "Receptions": {"builder": build_receptions_top25, "projection": "receptions_projection", "unit": "receptions", "icon": "🧤"},
    "Anytime TD": {"builder": build_anytime_td_top25, "projection": "model_probability", "unit": "%", "icon": "🔥"},
    "First TD": {"builder": build_first_td_top25, "projection": "model_probability", "unit": "%", "icon": "1️⃣"},
    "Sacks": {"builder": build_sacks_top25, "projection": "sacks_projection", "unit": "sacks", "icon": "💥"},
    "Tackles + Assists": {"builder": build_tackles_top25, "projection": "tackles_projection", "unit": "tackles", "icon": "🛡️"},
}


def _render_html(html: str) -> None:
    clean = " ".join(line.strip() for line in html.splitlines() if line.strip())
    st.markdown(clean, unsafe_allow_html=True)


def _inject_nfl_css() -> None:
    st.markdown(
        """
        <style>
        .block-container{max-width:1180px;padding-top:0!important;padding-bottom:2.5rem!important}

        /* Pull the NFL refresh control into the same utility row as the Sport Hub. */
        div[class*="st-key-nfl_page_refresh"]{display:flex!important;justify-content:flex-end!important;align-items:center!important;width:100%!important;margin:-45px 0 4px!important;position:relative!important;z-index:20!important}
        div[class*="st-key-nfl_page_refresh"]>div{width:auto!important}
        div[class*="st-key-nfl_page_refresh"] button{width:auto!important;min-width:108px!important;height:40px!important;min-height:40px!important;padding:0 13px!important;background:#090a0b!important;color:#d6b35c!important;border:1.5px solid #d6b35c!important;border-radius:9px!important;font-size:.74rem!important;font-weight:900!important;letter-spacing:.025em!important;white-space:nowrap!important}
        .nfl-page-refresh-time{width:100%;text-align:right;color:#c2c5ca;font-size:.82rem;font-weight:700;line-height:1.25;margin:2px 0 9px;white-space:nowrap}

        .nfl-hero{margin:.1rem 0 .55rem;padding:22px 30px;border-radius:20px;background:linear-gradient(105deg,rgba(255,204,51,.28) 0%,rgba(4,5,4,.98) 44%,rgba(25,217,120,.28) 100%);border:2px solid rgba(255,204,51,.88);box-shadow:inset 0 0 24px rgba(25,217,120,.08),0 0 0 1px rgba(25,217,120,.18)}
        .nfl-hero-title{margin:0;color:#fff;font-size:2.05rem;font-weight:950;line-height:1.08}
        .nfl-hero-subtitle{margin:16px 0 0;color:#f0f0f0;font-size:1.03rem;line-height:1.5;max-width:900px}

        div[class*="st-key-nfl_games_entry"] button{width:100%!important;min-height:76px!important;padding:12px 15px!important;margin:4px 0 10px!important;text-align:left!important;justify-content:flex-start!important;border:1.5px solid rgba(214,179,92,.68)!important;border-left:5px solid #19d978!important;border-radius:13px!important;background:linear-gradient(112deg,rgba(246,200,76,.12) 0%,#0d0f10 36%,#0b0d0e 68%,rgba(25,217,120,.10) 100%)!important;color:#fff!important;font-weight:900!important;line-height:1.28!important}
        div[class*="st-key-nfl_games_entry"] button:after{content:'›';margin-left:auto;font-size:1.4rem;color:#cfd3d6}
        div[class*="st-key-nfl_games_entry"] button p{margin:0!important;font-size:.84rem!important;line-height:1.32!important}

        .nfl-snapshot-heading{margin:18px 0 9px;color:#fff;font-size:1.08rem;font-weight:950;white-space:nowrap}
        .nfl-snapshot-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .nfl-snapshot-card{min-height:98px;padding:12px 10px;border:2px solid #3a3d42;border-radius:16px;background:#111315;display:flex;flex-direction:column;justify-content:center;min-width:0}
        .nfl-snapshot-card span{color:#fff;font-size:.70rem;font-weight:900;letter-spacing:.08em}
        .nfl-snapshot-card strong{color:#fff;font-size:1.45rem;line-height:1.1;margin:5px 0}
        .nfl-snapshot-card small{color:#fff;font-size:.68rem;font-weight:650;line-height:1.15}
        .nfl-snapshot-emerald{border-color:rgba(25,217,120,.92)} .nfl-snapshot-emerald strong{color:#19d978}
        .nfl-snapshot-gold{border-color:rgba(255,204,51,.92)} .nfl-snapshot-gold strong{color:#ffcc33}

        .nfl-rankings-heading{margin:24px 0 8px}.nfl-rankings-heading strong{display:block;color:#fff;font-size:1.28rem;font-weight:950}.nfl-rankings-heading span{display:block;color:#c4c7cc;font-size:.80rem;line-height:1.35;margin-top:4px}

        /* MLB-style horizontal market rail. */
        div[data-testid="stTabs"] [data-baseweb="tab-list"]{overflow-x:auto!important;overflow-y:hidden!important;flex-wrap:nowrap!important;scrollbar-width:none!important;gap:0!important;padding-bottom:2px!important}
        div[data-testid="stTabs"] [data-baseweb="tab-list"]::-webkit-scrollbar{display:none!important}
        div[data-testid="stTabs"] button[role="tab"]{flex:0 0 auto!important;white-space:nowrap!important;background:#0d0f10!important;color:#fff!important;border:1px solid #34373c!important;padding:.45rem .78rem!important;min-height:40px!important}
        div[data-testid="stTabs"] button[role="tab"][aria-selected="true"]{color:#f6c84c!important;border-color:#d6b35c!important;background:#15130d!important}

        .nfl-rank-card{display:grid;grid-template-columns:38px 64px minmax(0,1fr) 58px;gap:9px;align-items:start;width:100%;min-height:118px;padding:11px 9px;border-left:4px solid #19d978;background:#0d0f10;color:#fff;box-sizing:border-box}
        .nfl-rank-number{text-align:center;padding-top:2px}.nfl-rank-number strong{display:block;color:#fff;font-size:.92rem;font-weight:950}.nfl-rank-movement{display:block;margin-top:7px;color:#19d978;font-size:.58rem;font-weight:900;white-space:nowrap}
        .nfl-rank-avatar{width:64px;height:64px;border-radius:50%;overflow:hidden;border:2px solid #bca147;background:#30343a;display:grid;place-items:center;font-weight:900;color:#fff}
        .nfl-rank-avatar img{width:100%;height:100%;object-fit:cover;object-position:center 24%;display:block}
        .nfl-rank-copy{min-width:0}.nfl-rank-name{display:block;color:#fff;font-size:.94rem;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nfl-rank-meta{color:#e4e6e8;font-size:.75rem;margin-top:4px}.nfl-rank-proj{color:#f6c84c;font-size:.76rem;font-weight:850;margin-top:4px}.nfl-rank-market{color:#9fa4aa;font-size:.68rem;margin-top:3px}
        .nfl-rank-score{text-align:right;padding-top:1px}.nfl-rank-score small{display:block;color:#b8bbc1;font-size:.54rem;font-weight:900;letter-spacing:.06em}.nfl-rank-score strong{display:block;color:#ffcc33;font-size:1.05rem;font-weight:950;margin-top:3px}

        div[class*="st-key-nfl_rank_wrap_"]{background:#0d0f10!important;border:1.5px solid #34383d!important;border-radius:15px!important;overflow:hidden!important;margin:0 0 9px!important;padding:0!important}
        div[class*="st-key-nfl_rank_wrap_"] [data-testid="stVerticalBlock"]{gap:.25rem!important}
        div[class*="st-key-nfl_rank_wrap_"] button{background:#080909!important;color:#fff!important;border:0!important;border-top:1px solid #2c3034!important;border-radius:0!important;min-height:38px!important;font-weight:850!important}
        .nfl-intel-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;padding:2px 10px 8px}
        .nfl-intel-metric{background:#111315;border:1px solid #30343a;border-bottom:2px solid #19d978;border-radius:8px;padding:7px 6px;min-width:0}.nfl-intel-metric span{display:block;color:#92979e;font-size:.57rem}.nfl-intel-metric strong{display:block;color:#fff;font-size:.82rem;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .nfl-why{margin:0 10px 9px;padding:9px 10px;border:1px solid rgba(214,179,92,.48);border-radius:9px;background:#101112;color:#d9dbde;font-size:.72rem;line-height:1.4}.nfl-why b{color:#f6c84c}

        div[class*="st-key-nfl_full_top25_"] button{width:100%!important;background:#080909!important;color:#fff!important;border:1.5px solid #34373c!important;border-radius:10px!important;min-height:43px!important;font-weight:850!important;margin-top:2px!important}
        div[class*="st-key-nfl_open_player_"] button{background:#111315!important;color:#19d978!important;border:1px solid #30343a!important;border-radius:8px!important;min-height:35px!important;font-weight:850!important;margin:0 10px 9px!important;width:calc(100% - 20px)!important}

        @media(max-width:700px){
          .block-container{padding-left:.85rem!important;padding-right:.85rem!important;padding-top:0!important}
          div[class*="st-key-nfl_page_refresh"]{margin-top:-43px!important;margin-bottom:4px!important}
          .nfl-page-refresh-time{font-size:.84rem;margin-bottom:8px}
          .nfl-hero{padding:16px 15px;border-radius:15px;margin-top:.05rem}.nfl-hero-title{font-size:1.55rem}.nfl-hero-subtitle{font-size:.91rem;line-height:1.45;margin-top:12px}
          .nfl-snapshot-heading{font-size:1.02rem}.nfl-snapshot-card{min-height:92px;padding:10px 7px}.nfl-snapshot-card span{font-size:.61rem}.nfl-snapshot-card strong{font-size:1.28rem}.nfl-snapshot-card small{font-size:.60rem}
          .nfl-rank-card{grid-template-columns:32px 58px minmax(0,1fr) 48px;gap:7px;padding:10px 7px;min-height:112px}.nfl-rank-avatar{width:58px;height:58px}.nfl-rank-name{font-size:.87rem}.nfl-rank-meta,.nfl-rank-proj{font-size:.69rem}.nfl-rank-score strong{font-size:.92rem}.nfl-intel-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.nfl-intel-metric{padding:6px 4px}.nfl-intel-metric span{font-size:.50rem}.nfl-intel-metric strong{font-size:.72rem}
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _active_schedule_context():
    now = datetime.now(TORONTO_TIMEZONE).replace(tzinfo=None)
    try:
        regular = load_nfl_schedule(NFL_SEASON, "REG").copy()
    except Exception:
        regular = pd.DataFrame()

    if not regular.empty:
        regular["kickoff_et"] = pd.to_datetime(regular["kickoff_et"], errors="coerce")
        first_regular = regular["kickoff_et"].dropna().min()
        if pd.notna(first_regular) and now >= first_regular - pd.Timedelta(days=7):
            weeks = sorted(pd.to_numeric(regular["week"], errors="coerce").dropna().astype(int).unique())
            for week in weeks:
                slate = regular[pd.to_numeric(regular["week"], errors="coerce") == week]
                latest = slate["kickoff_et"].dropna().max()
                if pd.notna(latest) and now <= latest + pd.Timedelta(hours=5):
                    return "REG", regular, int(week)
            return "REG", regular, int(weeks[-1]) if weeks else None

    try:
        preseason = load_nfl_schedule(NFL_SEASON, "PRE").copy()
    except Exception:
        preseason = pd.DataFrame()
    if preseason.empty:
        return "PRE", preseason, None
    preseason["kickoff_et"] = pd.to_datetime(preseason["kickoff_et"], errors="coerce")
    future = preseason[preseason["kickoff_et"] >= now]
    week = int(future.sort_values("kickoff_et").iloc[0]["week"]) if not future.empty else int(preseason["week"].max())
    return "PRE", preseason, week


def _week_games(schedule: pd.DataFrame, week: int | None) -> pd.DataFrame:
    if schedule is None or schedule.empty or week is None:
        return pd.DataFrame()
    week_series = pd.to_numeric(schedule["week"], errors="coerce")
    return schedule[week_series == int(week)].copy().sort_values("kickoff_et", na_position="last").reset_index(drop=True)


def _matchup_map(schedule: pd.DataFrame, week: int | None) -> dict[str, str]:
    result: dict[str, str] = {}
    for _, game in _week_games(schedule, week).iterrows():
        away = str(game.get("away_team", "")).upper()
        home = str(game.get("home_team", "")).upper()
        if away and home:
            result[away] = f"{away} @ {home}"
            result[home] = f"{away} @ {home}"
    return result


@st.cache_data(ttl=21600, show_spinner=False)
def _headshot_map() -> dict[str, str]:
    try:
        roster = load_nfl_roster(NFL_SEASON)
        if roster.empty:
            return {}
        return dict(zip(roster["player_id"].astype(str), roster["headshot_url"].fillna("")))
    except Exception:
        return {}


def _build_passing_top25(schedule: pd.DataFrame, week: int | None) -> pd.DataFrame:
    candidates = []
    for _, game in _week_games(schedule, week).iterrows():
        away = str(game.get("away_team", "")).upper()
        home = str(game.get("home_team", "")).upper()
        if not away or not home:
            continue
        try:
            away_qbs = build_passing_yards_projection(home, NFL_SEASON, NFL_BASELINE_SEASON)
            home_qbs = build_passing_yards_projection(away, NFL_SEASON, NFL_BASELINE_SEASON)
            qbs = pd.concat([away_qbs[away_qbs["team"] == away], home_qbs[home_qbs["team"] == home]], ignore_index=True)
            if qbs.empty:
                continue
            qbs["attempts"] = pd.to_numeric(qbs.get("attempts"), errors="coerce")
            qbs = qbs[(qbs["games_played"].fillna(0) >= 3) | (qbs["attempts"].fillna(0) >= 50)].copy()
            qbs = attach_live_passing_yards_lines(qbs)
            qbs = attach_passing_yards_probabilities(qbs)
            qbs["game"] = f"{away} @ {home}"
            candidates.append(qbs)
        except Exception:
            continue
    if not candidates:
        return pd.DataFrame()
    return rank_passing_yards_top25(pd.concat(candidates, ignore_index=True), limit=25)


def _load_movement_state() -> dict:
    try:
        return json.loads(NFL_MOVEMENT_FILE.read_text()) if NFL_MOVEMENT_FILE.exists() else {}
    except Exception:
        return {}


def _apply_movement(df: pd.DataFrame, prop: str) -> pd.DataFrame:
    if df.empty:
        return df
    state = _load_movement_state()
    previous = state.get(prop, {})
    current, labels = {}, []
    for i, (_, row) in enumerate(df.iterrows(), start=1):
        key = str(row.get("player_id") or f"{row.get('player_name')}|{row.get('team')}")
        rank = int(row.get("rank") or i)
        current[key] = rank
        old = previous.get(key)
        labels.append("NEW" if old is None else f"↑ {int(old)-rank}" if int(old) > rank else f"↓ {rank-int(old)}" if int(old) < rank else "—")
    result = df.copy()
    result["rank_movement"] = labels
    state[prop] = current
    try:
        NFL_MOVEMENT_FILE.write_text(json.dumps(state))
    except Exception:
        pass
    return result


def _build_prop(prop: str, schedule: pd.DataFrame, week: int | None) -> pd.DataFrame:
    config = PROP_CATALOG[prop]
    try:
        df = _build_passing_top25(schedule, week) if config["builder"] == "passing" else config["builder"](NFL_SEASON, NFL_BASELINE_SEASON)
    except TypeError:
        df = config["builder"]()
    except Exception:
        return pd.DataFrame()
    if df is None or df.empty:
        return pd.DataFrame()
    df = df.copy()
    if "player_name" not in df.columns and "player" in df.columns:
        df["player_name"] = df["player"]
    if "team" not in df.columns:
        for candidate in ["recent_team", "team_abbreviation", "team_name"]:
            if candidate in df.columns:
                df["team"] = df[candidate]
                break
    if "team" not in df.columns:
        df["team"] = ""
    matchups = _matchup_map(schedule, week)
    df["game"] = df["team"].astype(str).str.upper().map(matchups).fillna(df.get("game", ""))
    shots = _headshot_map()
    if "headshot_url" not in df.columns:
        df["headshot_url"] = ""
    if "player_id" in df.columns:
        df["headshot_url"] = df.apply(lambda r: r.get("headshot_url") or shots.get(str(r.get("player_id")), ""), axis=1)
    return _apply_movement(df, prop).head(25).reset_index(drop=True)


def _format_projection(row: pd.Series, prop: str) -> str:
    config = PROP_CATALOG[prop]
    value = row.get(config["projection"])
    if value is None or pd.isna(value):
        return "Projection pending"
    unit = config["unit"]
    if unit == "%":
        numeric = float(value)
        if numeric <= 1:
            numeric *= 100
        return f"Model probability {numeric:.1f}%"
    if unit in {"TDs", "sacks"}:
        return f"Projection {float(value):.2f} {unit}"
    return f"Projection {float(value):.1f} {unit}"


def _ranking_score(row: pd.Series, prop: str) -> float:
    for key in ["gi_score", "score", "model_probability"]:
        value = row.get(key)
        if value is not None and not pd.isna(value):
            numeric = float(value)
            if key == "model_probability" and numeric <= 1:
                numeric *= 100
            return min(99.9, max(0.0, numeric))
    projection = row.get(PROP_CATALOG[prop]["projection"])
    return 0.0 if projection is None or pd.isna(projection) else min(99.9, max(0.0, float(projection)))


def _first_numeric(row: pd.Series, keys: list[str]) -> tuple[str, float | None]:
    for key in keys:
        value = row.get(key)
        if value is not None and not pd.isna(value):
            try:
                return key, float(value)
            except (TypeError, ValueError):
                continue
    return "", None


def _detail_metrics(row: pd.Series, prop: str) -> list[tuple[str, str]]:
    _, l5 = _first_numeric(row, [k for k in row.index if str(k).startswith("last_5_")])
    _, l3 = _first_numeric(row, [k for k in row.index if str(k).startswith("last_3_")])
    _, season = _first_numeric(row, [
        "passing_yards_per_game", "rushing_yards_per_game", "receiving_yards_per_game",
        "receptions_per_game", "passing_tds_per_game", "passing_rushing_yards_per_game",
        "rushing_receiving_yards_per_game", "sacks_per_game", "tackles_per_game",
    ])
    line = row.get("consensus_line")
    mode = str(row.get("ranking_mode") or "Foundation")
    fmt = lambda v: "—" if v is None else f"{v:.1f}"
    return [
        ("LAST 5", fmt(l5)),
        ("LAST 3", fmt(l3)),
        ("SEASON AVG", fmt(season)),
        ("MARKET", f"{float(line):.1f}" if line is not None and not pd.isna(line) else mode),
    ]


def _why_engine(row: pd.Series, prop: str) -> str:
    parts = []
    matchup_label = str(row.get("passing_matchup_label") or "").strip()
    matchup_index = row.get("passing_matchup_index")
    if matchup_label and matchup_label.lower() not in {"nan", "none", "unknown"}:
        text = f"{matchup_label} opponent matchup"
        if matchup_index is not None and not pd.isna(matchup_index):
            text += f" ({float(matchup_index):.0f} index)"
        parts.append(text)

    metrics = _detail_metrics(row, prop)
    values = {label: value for label, value in metrics}
    if values.get("LAST 5") not in {None, "—"} and values.get("SEASON AVG") not in {None, "—"}:
        try:
            l5, season = float(values["LAST 5"]), float(values["SEASON AVG"])
            if l5 > season * 1.08:
                parts.append("recent form is running above the season baseline")
            elif l5 < season * 0.92:
                parts.append("recent form is below the season baseline")
            else:
                parts.append("recent form is tracking close to the season baseline")
        except Exception:
            pass

    line = row.get("consensus_line")
    side = str(row.get("model_side") or "").strip()
    if line is not None and not pd.isna(line):
        market_text = f"live line {float(line):.1f}"
        if side and side.lower() not in {"nan", "none", "foundation"}:
            market_text += f" with the model leaning {side}"
        parts.append(market_text)

    if not parts:
        parts.append("the current ranking blends prior-season production, recent form and this week's role/matchup data that is available")
    return "; ".join(parts[:3]) + "."


def _render_rank_header(row: pd.Series, prop: str) -> None:
    name = str(row.get("player_name") or "Player")
    team = str(row.get("team") or "")
    game = str(row.get("game") or "Matchup pending")
    photo = str(row.get("headshot_url") or "").strip()
    avatar = f'<img src="{escape(photo)}" alt="{escape(name)} headshot">' if photo else escape("".join(part[0] for part in name.split()[:2]).upper() or "NFL")
    rank = int(row.get("rank") or 0)
    movement = str(row.get("rank_movement") or "—")
    projection = _format_projection(row, prop)
    score = _ranking_score(row, prop)
    market_mode = str(row.get("ranking_mode") or "Foundation")
    _render_html(
        f"""
        <div class="nfl-rank-card">
          <div class="nfl-rank-number"><strong>#{rank}</strong><small class="nfl-rank-movement">{escape(movement)}</small></div>
          <div class="nfl-rank-avatar">{avatar}</div>
          <div class="nfl-rank-copy">
            <strong class="nfl-rank-name">{escape(name)}</strong>
            <div class="nfl-rank-meta"><b>{escape(team)}</b> · {escape(game)}</div>
            <div class="nfl-rank-proj">{escape(projection)}</div>
            <div class="nfl-rank-market">{escape(market_mode)}</div>
          </div>
          <div class="nfl-rank-score"><small>GI SCORE</small><strong>{score:.1f}</strong></div>
        </div>
        """
    )


def _open_player(row: pd.Series, prop: str) -> None:
    player = row.to_dict()
    player["selected_prop"] = prop
    st.session_state["nfl_selected_player"] = player
    st.switch_page("pages/nfl_player.py")


def _render_player_intelligence(row: pd.Series, prop: str, key_prefix: str) -> None:
    metrics = _detail_metrics(row, prop)
    metric_html = "".join(
        f'<div class="nfl-intel-metric"><span>{escape(label)}</span><strong>{escape(value)}</strong></div>'
        for label, value in metrics
    )
    _render_html(f'<div class="nfl-intel-grid">{metric_html}</div>')
    _render_html(f'<div class="nfl-why"><b>Why Engine:</b> {escape(_why_engine(row, prop))}</div>')
    if st.button("Open full player card", key=f"nfl_open_player_{key_prefix}", use_container_width=True):
        _open_player(row, prop)


def _render_ranking_list(rankings: pd.DataFrame, prop: str) -> None:
    if rankings.empty:
        st.info(f"{prop} rankings are temporarily unavailable while the data feed fills in.")
        return

    state_key = "nfl_full_" + prop.lower().replace(" ", "_").replace("+", "plus")
    show_full = bool(st.session_state.get(state_key, False))
    rows = rankings if show_full else rankings.head(5)

    for idx, row in rows.iterrows():
        player_key = str(row.get("player_id") or idx).replace("-", "_")
        intel_key = f"nfl_intel_{state_key}_{player_key}_{int(row.get('rank') or idx + 1)}"
        with st.container(border=True, key=f"nfl_rank_wrap_{state_key}_{player_key}_{idx}"):
            _render_rank_header(row, prop)
            if st.button(
                "ⓘ Hide Intelligence" if st.session_state.get(intel_key, False) else "ⓘ View Intelligence",
                key=f"{intel_key}_toggle",
                use_container_width=True,
            ):
                st.session_state[intel_key] = not st.session_state.get(intel_key, False)
                st.rerun()
            if st.session_state.get(intel_key, False):
                _render_player_intelligence(row, prop, f"{state_key}_{player_key}_{idx}")

    if len(rankings) > 5:
        label = "Show Top 5 Only" if show_full else f"View Full Top 25 · {prop}"
        if st.button(label, key=f"nfl_full_top25_{state_key}", use_container_width=True):
            st.session_state[state_key] = not show_full
            st.rerun()


def _render_rankings(schedule: pd.DataFrame, week: int | None) -> None:
    _render_html(
        """
        <div class="nfl-rankings-heading">
          <strong>🏆 Player Rankings</strong>
          <span>Market-specific intelligence · Top 5 first · swipe the markets for more</span>
        </div>
        """
    )
    labels = [f"{cfg['icon']} {prop}" for prop, cfg in PROP_CATALOG.items()]
    tabs = st.tabs(labels)
    for tab, prop in zip(tabs, PROP_CATALOG.keys()):
        with tab:
            rankings = _build_prop(prop, schedule, week)
            _render_ranking_list(rankings, prop)


def _friendly_market_status(feed: dict | None) -> str:
    if not isinstance(feed, dict):
        return "Foundation"
    text = " ".join(str(feed.get(k) or "") for k in ["mode", "provider", "status", "message"]).lower()
    if any(token in text for token in ["live", "sportsbook", "the odds api", "sportsgameodds"]):
        if "not_configured" not in text and "not configured" not in text:
            return "Live"
    return "Foundation"


def _hero_message(games: pd.DataFrame, week: int | None, now: datetime) -> str:
    if games.empty:
        return "Build the week from the strongest player signals, then open each ranking to see what is driving the board."
    kickoffs = pd.to_datetime(games.get("kickoff_et"), errors="coerce").dropna()
    if kickoffs.empty:
        return "Build the week from the strongest player signals, then open each ranking to see what is driving the board."
    naive_now = now.replace(tzinfo=None)
    first, last = kickoffs.min(), kickoffs.max()
    if naive_now < first - pd.Timedelta(days=2):
        return f"Week {week} is building now. Track the strongest early player signals, opening markets and matchup advantages before kickoff."
    if naive_now < first:
        return f"Week {week} is taking shape. Open each player to see the recent form, matchup context and market signals driving the ranking."
    if naive_now <= last + pd.Timedelta(hours=4):
        return f"Week {week} is live. Follow the board as player signals, markets and matchup context change across the slate."
    return f"Week {week} is complete. The board is ready to be graded against what actually happened before the next slate takes over."


def show() -> None:
    _inject_nfl_css()
    phase, schedule, week = _active_schedule_context()
    games = _week_games(schedule, week)
    now = datetime.now(TORONTO_TIMEZONE)

    if st.button("⟳  REFRESH", key="nfl_page_refresh", help="Refresh NFL data"):
        try:
            load_nfl_schedule.clear()
            _headshot_map.clear()
        except Exception:
            pass
        st.rerun()

    st.markdown(
        f'<div class="nfl-page-refresh-time">Updated {now.strftime("%A · %I:%M %p ET")}</div>',
        unsafe_allow_html=True,
    )

    _render_html(
        f"""
        <section class="nfl-hero">
          <h1 class="nfl-hero-title">NFL Intelligence Center</h1>
          <p class="nfl-hero-subtitle">{escape(_hero_message(games, week, now))}</p>
        </section>
        """
    )

    week_label = f"Week {week}" if week is not None else "NFL Week"
    if st.button(
        f"🏈 {week_label.upper()} NFL GAMES  ›  Open this week's slate & Game Intelligence",
        key="nfl_games_entry",
        use_container_width=True,
    ):
        st.session_state["nfl_active_phase"] = phase
        st.session_state["nfl_active_week"] = week
        st.session_state.pop("nfl_selected_game", None)
        st.switch_page("pages/nfl_games.py")

    feed = get_nfl_odds_feed_status()
    market_status = _friendly_market_status(feed)
    alert_count = 0
    _render_html(
        f"""
        <div class="nfl-snapshot-heading">This Week's NFL Snapshot</div>
        <div class="nfl-snapshot-grid">
          <div class="nfl-snapshot-card nfl-snapshot-emerald"><span>GAMES</span><strong>{len(games)}</strong><small>{escape(week_label)}</small></div>
          <div class="nfl-snapshot-card"><span>TRACKED PROPS</span><strong>{len(PROP_CATALOG)}</strong><small>{escape(market_status)}</small></div>
          <div class="nfl-snapshot-card nfl-snapshot-gold"><span>ALERTS</span><strong>{alert_count}</strong><small>No active alerts</small></div>
        </div>
        """
    )

    _render_rankings(schedule, week)

    st.divider()
    st.caption("Sach Sports Dashboard · NFL Intelligence")


show()
