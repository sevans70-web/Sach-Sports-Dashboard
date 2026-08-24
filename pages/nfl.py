import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st

from data.nfl_odds import sports_game_odds_configured, get_nfl_odds_feed_status
from data.nfl_schedule import load_nfl_schedule
from data.nfl_roster import load_nfl_roster
from engines.nfl_passing_market_join import attach_live_passing_yards_lines
from engines.nfl_passing_probability import attach_passing_yards_probabilities
from engines.nfl_passing_ranking import rank_passing_yards_top25
from engines.nfl_passing_projection import build_passing_yards_projection
from engines.nfl_rushing_yards import build_rushing_yards_top25
from engines.nfl_receiving_yards import build_receiving_yards_top25
from engines.nfl_receptions import build_receptions_top25
from engines.nfl_touchdowns import build_anytime_td_top25, build_first_td_top25

NFL_SEASON = 2026
NFL_BASELINE_SEASON = 2025


TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
NFL_MOVEMENT_FILE = Path("/tmp/sach_nfl_rank_movement.json")


def _active_schedule_context():
    """Return the active NFL phase, schedule and week without a regular-season selector."""
    now = datetime.now(TORONTO_TIMEZONE).replace(tzinfo=None)

    try:
        regular = load_nfl_schedule(NFL_SEASON, "REG")
    except Exception:
        regular = pd.DataFrame()

    if not regular.empty:
        regular = regular.copy()
        regular["kickoff_et"] = pd.to_datetime(regular["kickoff_et"], errors="coerce")
        future = regular[regular["kickoff_et"] >= now]
        started = regular[regular["kickoff_et"] < now]

        # Once the regular season reaches its opening week, live props follow
        # the current regular-season slate automatically.
        first_regular = regular["kickoff_et"].dropna().min()
        if pd.notna(first_regular) and now >= first_regular - pd.Timedelta(days=2):
            if not future.empty:
                week = int(future.sort_values("kickoff_et").iloc[0]["week"])
            elif not started.empty:
                week = int(started.sort_values("kickoff_et").iloc[-1]["week"])
            else:
                week = int(regular["week"].min())
            return "REG", regular, week

    try:
        preseason = load_nfl_schedule(NFL_SEASON, "PRE")
    except Exception:
        preseason = pd.DataFrame()

    if preseason.empty:
        return "PRE", preseason, None

    preseason = preseason.copy()
    preseason["kickoff_et"] = pd.to_datetime(preseason["kickoff_et"], errors="coerce")
    future = preseason[preseason["kickoff_et"] >= now]
    if not future.empty:
        week = int(future.sort_values("kickoff_et").iloc[0]["week"])
    else:
        week = int(preseason["week"].max())
    return "PRE", preseason, week


def _matchup_map(schedule, week):
    if schedule is None or schedule.empty or week is None:
        return {}
    games = schedule[pd.to_numeric(schedule["week"], errors="coerce") == int(week)]
    result = {}
    for _, game in games.iterrows():
        away = str(game.get("away_team", "")).upper()
        home = str(game.get("home_team", "")).upper()
        if away and home:
            result[away] = f"{away} @ {home}"
            result[home] = f"{away} @ {home}"
    return result


@st.cache_data(ttl=21600, show_spinner=False)
def _headshot_map():
    try:
        roster = load_nfl_roster(NFL_SEASON)
        return dict(zip(roster["player_id"].astype(str), roster["headshot_url"]))
    except Exception:
        return {}


def _why_engine(row, projection_column, td=False):
    mode = str(row.get("ranking_mode", "Foundation"))
    if td:
        probability = row.get("model_probability")
        if probability is not None and not pd.isna(probability):
            base = f"Projected scoring probability: {float(probability):.1f}%."
        else:
            base = "Ranked from prior scoring rate and recent touchdown form."
        if mode == "Live market" and pd.notna(row.get("sportsbook_implied_probability")):
            return base + " Live sportsbook probability is included in the ranking."
        return base + " Foundation mode is active until a live scorer market is posted."

    projection = row.get(projection_column)
    if projection is not None and not pd.isna(projection):
        base = f"Model projection: {float(projection):.1f}."
    else:
        base = "Ranked from prior-season production and recent form."
    if mode == "Live market" and pd.notna(row.get("consensus_line")):
        return base + f" Compared with a live line of {float(row.get('consensus_line')):.1f}."
    return base + " Foundation mode is active until a live sportsbook line is posted."


def _load_movement_state():
    try:
        if NFL_MOVEMENT_FILE.exists():
            return json.loads(NFL_MOVEMENT_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _apply_rank_movement(df, category):
    """Persist previous ranks across normal Streamlit reruns and show movement."""
    if df is None or df.empty:
        return df
    state = _load_movement_state()
    previous = state.get(category, {})
    current = {}
    movement = []
    for _, row in df.iterrows():
        key = str(row.get("player_id") or f"{row.get('player_name')}|{row.get('team')}")
        rank = int(row.get("rank", 0))
        current[key] = rank
        old = previous.get(key)
        if old is None:
            movement.append("NEW")
        elif int(old) > rank:
            movement.append(f"↑ {int(old) - rank}")
        elif int(old) < rank:
            movement.append(f"↓ {rank - int(old)}")
        else:
            movement.append("—")
    df = df.copy()
    df["rank_movement"] = movement
    state[category] = current
    try:
        NFL_MOVEMENT_FILE.write_text(json.dumps(state), encoding="utf-8")
    except Exception:
        pass
    return df


def _enrich_top25(df, category, schedule=None, week=None):
    if df is None or df.empty:
        return df
    df = df.copy()
    matchups = _matchup_map(schedule, week)
    if "game" not in df.columns:
        df["game"] = df.get("team", pd.Series("", index=df.index)).map(matchups).fillna("")
    else:
        fallback = df.get("team", pd.Series("", index=df.index)).map(matchups).fillna("")
        df["game"] = df["game"].fillna("").where(df["game"].fillna("").ne(""), fallback)
    shots = _headshot_map()
    if "headshot_url" not in df.columns:
        df["headshot_url"] = df.get("player_id", pd.Series("", index=df.index)).astype(str).map(shots)
    else:
        fallback = df.get("player_id", pd.Series("", index=df.index)).astype(str).map(shots)
        df["headshot_url"] = df["headshot_url"].where(df["headshot_url"].notna(), fallback)
    return _apply_rank_movement(df, category)


def _format_number(value, digits=1):
    if value is None or pd.isna(value):
        return "—"
    return f"{float(value):.{digits}f}"


def _render_sportsbook_feed_status():
    feed = get_nfl_odds_feed_status()
    message = (
        feed.get("message")
        or "Sportsbook market status unavailable."
    )
    status = feed.get("status")

    if status == "live":
        st.caption(message)
    elif status == "stale":
        st.warning(message)
    elif status in {"quota_exhausted", "rate_limited"}:
        st.info(message)
    elif status == "not_configured":
        st.info(message)
    else:
        st.caption(message)


def _build_game_qb_preview(game):
    away_team = str(game["away_team"]).upper()
    home_team = str(game["home_team"]).upper()

    away = build_passing_yards_projection(
        home_team,
        NFL_SEASON,
        NFL_BASELINE_SEASON,
    )
    away = away[away["team"] == away_team].copy()

    home = build_passing_yards_projection(
        away_team,
        NFL_SEASON,
        NFL_BASELINE_SEASON,
    )
    home = home[home["team"] == home_team].copy()

    qbs = pd.concat([away, home], ignore_index=True)

    if qbs.empty:
        return qbs

    qbs["attempts"] = pd.to_numeric(
        qbs.get("attempts"),
        errors="coerce",
    )

    qbs = qbs[
        (qbs["games_played"].fillna(0) >= 3)
        | (qbs["attempts"].fillna(0) >= 50)
    ].copy()

    if sports_game_odds_configured():
        qbs = attach_live_passing_yards_lines(qbs)
        qbs = attach_passing_yards_probabilities(qbs)
    else:
        qbs["market_match_status"] = "API not configured"
        qbs["consensus_line"] = pd.NA
        qbs["projection_edge_yards"] = pd.NA
        qbs["over_probability"] = pd.NA
        qbs["under_probability"] = pd.NA
        qbs["model_probability"] = pd.NA
        qbs["model_side"] = "NO PLAY"

    return qbs.sort_values(
        "model_probability",
        ascending=False,
        na_position="last",
    ).reset_index(drop=True)


def _build_week_top25(schedule, week):
    games = schedule[
        schedule["week"].astype(int) == int(week)
    ].reset_index(drop=True)

    candidates = []

    for _, game in games.iterrows():
        try:
            game_qbs = _build_game_qb_preview(game)

            if game_qbs is None or game_qbs.empty:
                continue

            game_qbs = game_qbs.copy()
            game_qbs["game"] = (
                str(game["away_team"]).upper()
                + " @ "
                + str(game["home_team"]).upper()
            )
            candidates.append(game_qbs)

        except Exception:
            continue

    if not candidates:
        return pd.DataFrame()

    slate = pd.concat(
        candidates,
        ignore_index=True,
    )

    return rank_passing_yards_top25(
        slate,
        limit=25,
    )


def _render_top25_card(row, projection_column):
    rank = int(row.get("rank", 0))
    name = row.get("player_name", "Unknown")
    team = row.get("team", "")
    game = row.get("game", "")
    mode = str(row.get("ranking_mode", "Foundation"))
    movement = row.get("rank_movement", "—")
    headshot = row.get("headshot_url")

    if headshot and not pd.isna(headshot):
        c_photo, c_title = st.columns([1, 4])
        with c_photo:
            st.image(headshot, width=76)
        with c_title:
            st.markdown(f"### #{rank} · {name}")
            st.caption(f"{team} • {movement}" + (f" • {game}" if game else ""))
    else:
        st.markdown(f"### #{rank} · {name} · {team}")
        st.caption(f"{movement}" + (f" • {game}" if game else ""))

    projection = _format_number(row.get(projection_column))

    if mode == "Live market" and pd.notna(row.get("consensus_line")):
        probability = row.get("model_probability")
        probability_text = "—" if probability is None or pd.isna(probability) else f"{float(probability):.1f}%"
        edge = row.get("projection_edge_yards")
        edge_text = "—" if edge is None or pd.isna(edge) else (f"+{float(edge):.1f}" if float(edge) > 0 else f"{float(edge):.1f}")
        c1, c2 = st.columns(2)
        with c1:
            st.metric("Model Side", row.get("model_side", "—"))
            st.metric("Probability", probability_text)
        with c2:
            st.metric("Sportsbook Line", _format_number(row.get("consensus_line")))
            st.metric("Projection", projection)
        st.metric("Model Edge", edge_text)
    else:
        c1, c2 = st.columns(2)
        with c1:
            st.metric("Ranking Mode", "Foundation")
        with c2:
            st.metric("Projection", projection)

    st.caption("Why Engine • " + _why_engine(row, projection_column))
    st.divider()

def _render_passing(schedule):
    st.markdown("### Passing Yards")

    _render_sportsbook_feed_status()

    weeks = sorted(
        schedule["week"]
        .dropna()
        .astype(int)
        .unique()
    )

    phase, active_schedule, active_week = _active_schedule_context()
    if phase == "REG":
        schedule = active_schedule
        week = active_week
        st.caption(f"Regular Season • Week {week} • selected automatically")
    else:
        default_index = weeks.index(active_week) if active_week in weeks else max(len(weeks) - 1, 0)
        week = st.selectbox(
            "Preview Week",
            weeks,
            index=default_index,
            key="nfl_passing_card_week",
        )

    st.markdown(
        "## Top 25 Passing Yards"
    )
    st.caption(
        "Live slate ranking • model probability first • "
        "projection edge used as the tiebreaker"
    )

    top25 = _build_week_top25(schedule, week)
    top25 = _enrich_top25(top25, "Passing Yards", schedule, week)

    if top25.empty:
        st.info(
            "No valid Passing Yards Top 25 candidates "
            "are available for this slate yet."
        )
    else:
        for _, row in top25.iterrows():
            _render_top25_card(
                row,
                "passing_yards_projection_matchup",
            )


def _render_rushing():
    st.markdown("### Rushing Yards")

    _render_sportsbook_feed_status()

    st.markdown(
        "## Top 25 Rushing Yards"
    )
    st.caption(
        "Foundation ranking • 2025 rushing baseline + "
        "recent form + live sportsbook line"
    )

    try:
        top25 = build_rushing_yards_top25(NFL_SEASON, NFL_BASELINE_SEASON)
        _, active_schedule, active_week = _active_schedule_context()
        top25 = _enrich_top25(top25, "Rushing Yards", active_schedule, active_week)

        if top25.empty:
            st.info(
                "No valid live Rushing Yards candidates "
                "are available right now."
            )
        else:
            for _, row in top25.iterrows():
                _render_top25_card(
                    row,
                    "rushing_projection",
                )

    except Exception as exc:
        st.warning(
            "Rushing Yards Top 25 is temporarily unavailable."
        )
        st.caption(str(exc))


def _render_receiving():
    st.markdown("### Receiving Yards")

    _render_sportsbook_feed_status()

    st.markdown("## Top 25 Receiving Yards")
    st.caption(
        "Foundation ranking • 2025 receiving baseline + "
        "recent form + live sportsbook line"
    )

    try:
        top25 = build_receiving_yards_top25(NFL_SEASON, NFL_BASELINE_SEASON)
        _, active_schedule, active_week = _active_schedule_context()
        top25 = _enrich_top25(top25, "Receiving Yards", active_schedule, active_week)

        if top25.empty:
            st.info(
                "No valid live Receiving Yards candidates "
                "are available right now."
            )
        else:
            for _, row in top25.iterrows():
                _render_top25_card(row, "receiving_projection")

    except Exception as exc:
        st.warning(
            "Receiving Yards Top 25 is temporarily unavailable."
        )
        st.caption(str(exc))


def _render_receptions():
    st.markdown("### Receptions")

    _render_sportsbook_feed_status()

    st.markdown("## Top 25 Receptions")
    st.caption(
        "Foundation ranking • 2025 reception baseline + "
        "recent form + live sportsbook line"
    )

    try:
        top25 = build_receptions_top25(NFL_SEASON, NFL_BASELINE_SEASON)
        _, active_schedule, active_week = _active_schedule_context()
        top25 = _enrich_top25(top25, "Receptions", active_schedule, active_week)

        if top25.empty:
            st.info(
                "No valid live Receptions candidates "
                "are available right now."
            )
        else:
            for _, row in top25.iterrows():
                _render_top25_card(row, "receptions_projection")

    except Exception as exc:
        st.warning(
            "Receptions Top 25 is temporarily unavailable."
        )
        st.caption(str(exc))



def _render_td_card(row):
    rank = int(row.get("rank", 0))
    name = row.get("player_name", "Unknown")
    team = row.get("team", "")
    game = row.get("game", "")
    movement = row.get("rank_movement", "—")
    mode = str(row.get("ranking_mode", "Foundation"))
    headshot = row.get("headshot_url")
    probability = row.get("model_probability")
    probability_text = "—" if probability is None or pd.isna(probability) else f"{float(probability):.1f}%"

    if headshot and not pd.isna(headshot):
        c_photo, c_title = st.columns([1, 4])
        with c_photo:
            st.image(headshot, width=76)
        with c_title:
            st.markdown(f"### #{rank} · {name}")
            st.caption(f"{team} • {movement}" + (f" • {game}" if game else ""))
    else:
        st.markdown(f"### #{rank} · {name} · {team}")
        st.caption(f"{movement}" + (f" • {game}" if game else ""))

    if mode == "Live market" and pd.notna(row.get("sportsbook_implied_probability")):
        sportsbook_probability = row.get("sportsbook_implied_probability")
        sportsbook_probability_text = f"{float(sportsbook_probability):.1f}%"
        edge = row.get("probability_edge")
        edge_text = "—" if edge is None or pd.isna(edge) else (f"+{float(edge):.1f} pp" if float(edge) > 0 else f"{float(edge):.1f} pp")
        c1, c2 = st.columns(2)
        with c1:
            st.metric("Model Probability", probability_text)
            st.metric("Sportsbook Odds", str(row.get("consensus_odds") or "—"))
        with c2:
            st.metric("Sportsbook Implied", sportsbook_probability_text)
            st.metric("Model Edge", edge_text)
    else:
        c1, c2 = st.columns(2)
        with c1:
            st.metric("Ranking Mode", "Foundation")
        with c2:
            st.metric("Model Probability", probability_text)

    st.caption("Why Engine • " + _why_engine(row, "", td=True))
    st.divider()

def _render_touchdowns(first_td=False):
    title = "First TD" if first_td else "Anytime TD"
    st.markdown(f"### {title}")

    _render_sportsbook_feed_status()

    heading = "Top 25 First TD" if first_td else "Top 25 Anytime TD"
    st.markdown(f"## {heading}")
    st.caption(
        "Foundation ranking • prior scoring rate + recent TD form + "
        "live sportsbook scorer market"
    )

    try:
        top25 = (
            build_first_td_top25(NFL_SEASON, NFL_BASELINE_SEASON)
            if first_td
            else build_anytime_td_top25(NFL_SEASON, NFL_BASELINE_SEASON)
        )
        _, active_schedule, active_week = _active_schedule_context()
        top25 = _enrich_top25(top25, title, active_schedule, active_week)

        if top25.empty:
            st.info(
                f"No valid {title} foundation candidates are available right now."
            )
        else:
            for _, row in top25.iterrows():
                _render_td_card(row)

    except Exception as exc:
        st.warning(f"{title} Top 25 is temporarily unavailable.")
        st.caption(str(exc))


def _inject_nfl_mobile_css():
    st.markdown(
        """
        <style>
        :root {
            --nfl-panel: #172235;
            --nfl-panel-2: #1d2b42;
            --nfl-border: #314766;
            --nfl-text-soft: #aebbd0;
        }

        .nfl-hero {
            border: 1px solid var(--nfl-border);
            border-radius: 18px;
            padding: 1rem 1.05rem;
            background: linear-gradient(135deg, #172235 0%, #1d2b42 100%);
            margin-bottom: 0.85rem;
        }

        .nfl-hero-title {
            font-size: 1.28rem;
            font-weight: 800;
            margin-bottom: 0.2rem;
        }

        .nfl-soft {
            color: var(--nfl-text-soft);
            font-size: 0.9rem;
        }

        .nfl-section-label {
            font-size: 1.02rem;
            font-weight: 800;
            margin: 1rem 0 0.45rem 0;
        }

        @media (max-width: 700px) {
            div[data-testid="stMetric"] {
                padding: 0.35rem 0.45rem;
            }
            div[data-testid="stMetricLabel"] {
                font-size: 0.76rem;
            }
            div[data-testid="stMetricValue"] {
                font-size: 1.08rem;
            }
            div[data-testid="stImage"] img {
                border-radius: 12px;
            }
            .stTabs [data-baseweb="tab-list"] {
                gap: 0.15rem;
                overflow-x: auto;
            }
            .stTabs [data-baseweb="tab"] {
                padding-left: 0.55rem;
                padding-right: 0.55rem;
                white-space: nowrap;
            }
            .nfl-hero {
                padding: 0.85rem;
                border-radius: 15px;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

def _active_week_games():
    phase, schedule, week = _active_schedule_context()
    if schedule is None or schedule.empty or week is None:
        return phase, schedule, week, pd.DataFrame()
    games = schedule[
        pd.to_numeric(schedule["week"], errors="coerce") == int(week)
    ].copy()
    games = games.sort_values("kickoff_et", na_position="last").reset_index(drop=True)
    return phase, schedule, week, games


def _render_intelligence_center():
    """NFL landing workspace: slate + matchup intelligence + prop pulse."""
    st.markdown(
        """
        <div class="nfl-hero">
            <div class="nfl-hero-title">🏈 NFL Intelligence Center</div>
            <div class="nfl-soft">
                Active slate • matchup intelligence • prop pulse • sportsbook status
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    try:
        phase, schedule, week, games = _active_week_games()
        phase_label = "Regular Season" if phase == "REG" else "Preseason"

        feed = get_nfl_odds_feed_status()
        provider = feed.get("provider") or "Foundation"

        c1, c2, c3 = st.columns(3)
        c1.metric("Active Week", f"{phase_label} {week}" if week is not None else phase_label)
        c2.metric("Games", len(games))
        c3.metric("Prop Mode", "Live" if feed.get("status") == "live" else "Foundation")

        st.caption(
            f"Sportsbook source: {provider}. "
            "Foundation rankings remain available when live player-prop markets are not posted."
        )

        if games.empty:
            st.info("No NFL games are available for the active slate.")
            return

        st.markdown('<div class="nfl-section-label">🔥 Matchup Intelligence</div>', unsafe_allow_html=True)

        labels = [
            f"{str(g.get('away_team', '')).upper()} @ {str(g.get('home_team', '')).upper()}"
            for _, g in games.iterrows()
        ]
        selected = st.selectbox(
            "Select Matchup",
            labels,
            key=f"nfl_center_matchup_{phase}_{week}",
        )
        game = games.iloc[labels.index(selected)]

        kickoff = pd.to_datetime(game.get("kickoff_et"), errors="coerce")
        kickoff_text = kickoff.strftime("%a %b %d • %I:%M %p") if pd.notna(kickoff) else "Time TBD"
        st.caption(f"{kickoff_text} • {game.get('status', 'Scheduled')}")

        qbs = _build_game_qb_preview(game)
        if qbs is not None and not qbs.empty:
            for _, row in qbs.head(2).iterrows():
                name = row.get("player_name", "Unknown QB")
                team = row.get("team", "")
                projection = _format_number(row.get("passing_yards_projection_matchup"))
                baseline = _format_number(row.get("passing_yards_per_game"))
                recent3 = _format_number(row.get("last_3_passing_yards_per_game"))

                st.markdown(f"**{name} · {team}**")
                q1, q2, q3 = st.columns(3)
                q1.metric("2025 Y/G", baseline)
                q2.metric("Projection", projection)
                q3.metric("Last 3", recent3)

                if pd.notna(row.get("consensus_line")):
                    st.caption(
                        f"Live line {_format_number(row.get('consensus_line'))} • "
                        f"Model side {row.get('model_side', '—')}"
                    )
        else:
            st.caption("Qualified matchup intelligence will appear here as the slate data fills in.")

        st.markdown('<div class="nfl-section-label">🎯 Prop Pulse</div>', unsafe_allow_html=True)
        try:
            passing = _build_week_top25(schedule, week)
            if passing is not None and not passing.empty:
                passing = _enrich_top25(passing.head(3), "center_passing", schedule, week)
                for _, row in passing.iterrows():
                    st.markdown(
                        f"**#{int(row.get('rank', 0))} {row.get('player_name', '')} · "
                        f"{row.get('team', '')}**"
                    )
                    st.caption(
                        f"{row.get('game', '')} • Projection "
                        f"{_format_number(row.get('passing_yards_projection_matchup'))} passing yards"
                    )
            else:
                st.caption("Passing-yard prop pulse will populate when qualified players are available.")
        except Exception:
            st.caption("Prop pulse is temporarily unavailable.")

        st.markdown('<div class="nfl-section-label">📅 Active Slate</div>', unsafe_allow_html=True)
        for _, slate_game in games.iterrows():
            slate_kickoff = pd.to_datetime(slate_game.get("kickoff_et"), errors="coerce")
            slate_time = slate_kickoff.strftime("%a %b %d • %I:%M %p") if pd.notna(slate_kickoff) else "Time TBD"
            st.markdown(
                f"**{slate_game.get('away_team', '')} @ {slate_game.get('home_team', '')}**"
            )
            st.caption(f"{slate_time} • {slate_game.get('status', 'Scheduled')}")
    except Exception as exc:
        st.warning("NFL Intelligence Center is temporarily unavailable.")
        st.caption(str(exc))

def _render_game_intelligence():
    st.subheader("Game Intelligence")
    st.caption("Matchup-level quarterback intelligence for the active NFL slate.")

    try:
        phase, _, week, games = _active_week_games()
        if games.empty:
            st.info("No active NFL games are available for matchup analysis.")
            return

        labels = [
            f"{str(g.get('away_team', '')).upper()} @ {str(g.get('home_team', '')).upper()}"
            for _, g in games.iterrows()
        ]
        selected = st.selectbox(
            "Select Matchup",
            labels,
            key=f"nfl_gi_matchup_{phase}_{week}",
        )
        game = games.iloc[labels.index(selected)]
        qbs = _build_game_qb_preview(game)

        if qbs is None or qbs.empty:
            st.info("No qualified quarterback intelligence is available for this matchup yet.")
            return

        for _, row in qbs.iterrows():
            name = row.get("player_name", "Unknown QB")
            team = row.get("team", "")
            projection = _format_number(row.get("passing_yards_projection_matchup"))
            baseline = _format_number(row.get("passing_yards_per_game"))
            recent3 = _format_number(row.get("last_3_passing_yards_per_game"))
            matchup = row.get("passing_matchup_label", "Unknown")

            st.markdown(f"### {name} · {team}")
            c1, c2, c3 = st.columns(3)
            c1.metric("2025 Yds/Game", baseline)
            c2.metric("Matchup Projection", projection)
            c3.metric("Last 3", recent3)

            if pd.notna(row.get("consensus_line")):
                c4, c5, c6 = st.columns(3)
                c4.metric("Sportsbook Line", _format_number(row.get("consensus_line")))
                c5.metric("Model Side", str(row.get("model_side", "—")))
                prob = row.get("model_probability")
                c6.metric("Probability", "—" if pd.isna(prob) else f"{float(prob):.1f}%")

            st.caption(f"Matchup: {matchup}")
            st.divider()
    except Exception as exc:
        st.warning("Game Intelligence is temporarily unavailable.")
        st.caption(str(exc))


def _render_games_results():
    st.subheader("Games / Results")
    st.caption("Schedule, game status, final scores, and prediction-performance home.")

    season_type = st.selectbox(
        "Season Type",
        ["Preseason", "Regular Season"],
        key="nfl_games_results_season_type",
    )
    game_type = "PRE" if season_type == "Preseason" else "REG"

    try:
        schedule = load_nfl_schedule(NFL_SEASON, game_type)
        if schedule.empty:
            st.info("No NFL schedule is available for this season type.")
            return

        weeks = sorted(pd.to_numeric(schedule["week"], errors="coerce").dropna().astype(int).unique())
        _, _, active_week = _active_schedule_context()
        default_index = weeks.index(active_week) if active_week in weeks else 0

        week = st.selectbox(
            "Select Week",
            weeks,
            index=default_index,
            key=f"nfl_games_results_week_{game_type}",
        )

        games = schedule[
            pd.to_numeric(schedule["week"], errors="coerce") == int(week)
        ].copy()
        games = games.sort_values("kickoff_et", na_position="last")

        completed_count = 0
        for _, game in games.iterrows():
            kickoff = pd.to_datetime(game.get("kickoff_et"), errors="coerce")
            kickoff_text = kickoff.strftime("%a %b %d • %I:%M %p") if pd.notna(kickoff) else "Time TBD"
            away = game.get("away_team", "")
            home = game.get("home_team", "")
            status = str(game.get("status", "Scheduled"))

            st.markdown(f"### {away} @ {home}")

            if status.lower() == "final":
                completed_count += 1
                away_score = game.get("away_score")
                home_score = game.get("home_score")
                if pd.notna(away_score) and pd.notna(home_score):
                    st.metric(
                        "Final",
                        f"{away} {int(away_score)} — {home} {int(home_score)}",
                    )

            st.caption(f"{kickoff_text} • {status}")
            st.divider()

        st.markdown("### 📈 Prediction Performance")
        if completed_count == 0:
            st.info(
                "Prediction grading will appear here after games are final. "
                "This section is reserved for our model results—not duplicate NFL scores."
            )
        else:
            st.info(
                "Final games are available. Prop-level grading will populate as "
                "the prediction-history tracker records completed NFL predictions."
            )
    except Exception as exc:
        st.warning("NFL Games / Results is temporarily unavailable.")
        st.caption(str(exc))

def show():
    _inject_nfl_mobile_css()
    st.title("🏈 NFL")

    st.caption(
        "Intelligence Center • Player Props • Games & Results"
    )

    tabs = st.tabs(
        [
            "🏈 Intelligence Center",
            "🎯 Player Props",
            "🎮 Games / Results",
        ]
    )

    with tabs[0]:
        _render_intelligence_center()

    with tabs[1]:
        st.subheader("Player Props")

        prop = st.selectbox(
            "Select Prop",
            [
                "Passing Yards",
                "Rushing Yards",
                "Receiving Yards",
                "Receptions",
                "Anytime TD",
                "First TD",
            ],
            key="nfl_prop_selector",
        )

        try:
            _, schedule, _ = _active_schedule_context()
        except Exception:
            schedule = pd.DataFrame()

        if prop == "Passing Yards":
            if schedule.empty:
                st.info(
                    "NFL schedule is temporarily unavailable."
                )
            else:
                _render_passing(
                    schedule
                )

        elif prop == "Rushing Yards":
            _render_rushing()

        elif prop == "Receiving Yards":
            _render_receiving()

        elif prop == "Receptions":
            _render_receptions()

        elif prop == "Anytime TD":
            _render_touchdowns(first_td=False)

        elif prop == "First TD":
            _render_touchdowns(first_td=True)


    with tabs[2]:
        _render_games_results()


show()
