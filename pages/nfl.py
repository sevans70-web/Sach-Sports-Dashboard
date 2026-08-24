import pandas as pd
import streamlit as st

from data.nfl_odds import sports_game_odds_configured, get_nfl_odds_feed_status
from data.nfl_schedule import load_nfl_schedule
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
    side = row.get("model_side", "—")

    probability = row.get("model_probability")
    probability_text = (
        "—"
        if probability is None or pd.isna(probability)
        else f"{float(probability):.1f}%"
    )

    projection = _format_number(
        row.get(projection_column)
    )
    line = _format_number(
        row.get("consensus_line")
    )

    edge = row.get(
        "projection_edge_yards"
    )
    edge_text = (
        "—"
        if edge is None or pd.isna(edge)
        else (
            f"+{float(edge):.1f}"
            if float(edge) > 0
            else f"{float(edge):.1f}"
        )
    )

    st.markdown(
        f"### #{rank} · {name} · {team}"
    )

    if game:
        st.caption(game)

    c1, c2 = st.columns(2)

    with c1:
        st.metric(
            "Model Side",
            side,
        )
        st.metric(
            "Probability",
            probability_text,
        )

    with c2:
        st.metric(
            "Sportsbook Line",
            line,
        )
        st.metric(
            "Projection",
            projection,
        )

    st.metric(
        "Model Edge",
        edge_text,
    )

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

    week = st.selectbox(
        "Preview Week",
        weeks,
        index=max(len(weeks) - 1, 0),
        key="nfl_passing_card_week",
    )

    st.markdown(
        "## Top 25 Passing Yards"
    )
    st.caption(
        "Live slate ranking • model probability first • "
        "projection edge used as the tiebreaker"
    )

    top25 = _build_week_top25(
        schedule,
        week,
    )

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
        top25 = build_rushing_yards_top25(
            NFL_SEASON,
            NFL_BASELINE_SEASON,
        )

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
        top25 = build_receiving_yards_top25(
            NFL_SEASON,
            NFL_BASELINE_SEASON,
        )

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
        top25 = build_receptions_top25(
            NFL_SEASON,
            NFL_BASELINE_SEASON,
        )

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
    probability = row.get("model_probability")
    probability_text = (
        "—"
        if probability is None or pd.isna(probability)
        else f"{float(probability):.1f}%"
    )

    sportsbook_probability = row.get("sportsbook_implied_probability")
    sportsbook_probability_text = (
        "—"
        if sportsbook_probability is None or pd.isna(sportsbook_probability)
        else f"{float(sportsbook_probability):.1f}%"
    )

    edge = row.get("probability_edge")
    edge_text = (
        "—"
        if edge is None or pd.isna(edge)
        else (
            f"+{float(edge):.1f} pp"
            if float(edge) > 0
            else f"{float(edge):.1f} pp"
        )
    )

    st.markdown(f"### #{rank} · {name} · {team}")

    c1, c2 = st.columns(2)
    with c1:
        st.metric("Model Probability", probability_text)
        st.metric("Sportsbook Odds", str(row.get("consensus_odds") or "—"))
    with c2:
        st.metric("Sportsbook Implied", sportsbook_probability_text)
        st.metric("Model Edge", edge_text)

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

        if top25.empty:
            st.info(
                f"No valid live {title} candidates are available right now."
            )
        else:
            for _, row in top25.iterrows():
                _render_td_card(row)

    except Exception as exc:
        st.warning(f"{title} Top 25 is temporarily unavailable.")
        st.caption(str(exc))

def show():
    st.title("🏈 NFL")

    st.caption(
        "Player Prop Intelligence • Matchup Analysis • "
        "Predictions • Performance Tracking"
    )

    tabs = st.tabs(
        [
            "🏈 Overview",
            "🧠 Game Intelligence",
            "📈 Results",
            "🎮 Games",
            "🎯 Player Props",
        ]
    )

    with tabs[0]:
        st.subheader("NFL Overview")
        st.caption(
            "Foundation view. Final overview design "
            "will be refined later."
        )

    with tabs[1]:
        st.subheader("Game Intelligence")

    with tabs[2]:
        st.subheader("Results")

    with tabs[3]:
        st.subheader("Games")

        season_type = st.selectbox(
            "Season Type",
            [
                "Preseason",
                "Regular Season",
            ],
            key="nfl_season_type_selector",
        )

        game_type = (
            "PRE"
            if season_type == "Preseason"
            else "REG"
        )

        try:
            schedule = load_nfl_schedule(
                NFL_SEASON,
                game_type,
            )

            weeks = sorted(
                schedule["week"]
                .dropna()
                .astype(int)
                .unique()
            )

            week = st.selectbox(
                "Select Week",
                weeks,
                key=f"nfl_week_selector_{game_type}",
            )

            for _, game in schedule[
                schedule["week"].astype(int)
                == week
            ].iterrows():
                st.markdown(
                    f'**{game["away_team"]} @ '
                    f'{game["home_team"]}**'
                )
                st.caption(
                    f'{game["kickoff_et"]} • '
                    f'{game["status"]}'
                )
                st.divider()

        except Exception as exc:
            st.warning(
                "NFL schedule data is temporarily unavailable."
            )
            st.caption(str(exc))

    with tabs[4]:
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
            schedule = load_nfl_schedule(
                NFL_SEASON,
                "PRE",
            )
        except Exception:
            schedule = pd.DataFrame()

        if prop == "Passing Yards":
            if schedule.empty:
                st.info(
                    "NFL preseason schedule is temporarily unavailable."
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


show()
