import pandas as pd
import streamlit as st

from data.nfl_odds import (
    load_nfl_passing_yards_markets,
    sports_game_odds_configured,
)
from data.nfl_roster import load_nfl_roster
from data.nfl_schedule import load_nfl_schedule
from engines.nfl_passing_projection import build_passing_yards_projection

NFL_SEASON = 2026
NFL_BASELINE_SEASON = 2025


def _format_number(value, digits=1):
    if value is None or pd.isna(value):
        return "—"
    return f"{float(value):.{digits}f}"


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

    # Keep meaningful Passing Yards candidates only.
    qbs["attempts"] = pd.to_numeric(
        qbs.get("attempts"),
        errors="coerce",
    )

    qbs = qbs[
        (
            qbs["games_played"].fillna(0) >= 3
        )
        | (
            qbs["attempts"].fillna(0) >= 50
        )
    ].copy()

    return qbs.sort_values(
        "passing_yards_projection_matchup",
        ascending=False,
        na_position="last",
    ).reset_index(drop=True)


def _render_qb_card(row):
    name = row.get("player_name", "Unknown QB")
    team = row.get("team", "")
    matchup = row.get("passing_matchup_label", "Unknown")
    status = row.get("passing_data_status", "Unknown")

    st.markdown(f"### {name} · {team}")

    c1, c2, c3 = st.columns(3)

    with c1:
        st.metric(
            "2025 Pass Yds/Game",
            _format_number(
                row.get("passing_yards_per_game")
            ),
        )

    with c2:
        st.metric(
            "Last 5",
            _format_number(
                row.get("last_5_passing_yards_per_game")
            ),
        )

    with c3:
        st.metric(
            "Matchup Projection",
            _format_number(
                row.get("passing_yards_projection_matchup")
            ),
        )

    c4, c5, c6 = st.columns(3)

    with c4:
        st.caption(
            f"Last 3: "
            f"{_format_number(row.get('last_3_passing_yards_per_game'))}"
        )

    with c5:
        st.caption(
            f"Yards/Attempt: "
            f"{_format_number(row.get('season_yards_per_attempt'), 2)}"
        )

    with c6:
        completion_rate = row.get("season_completion_rate")
        completion_text = (
            "—"
            if completion_rate is None or pd.isna(completion_rate)
            else f"{float(completion_rate) * 100:.1f}%"
        )
        st.caption(
            f"Completion Rate: {completion_text}"
        )

    st.caption(
        f"Matchup: {matchup} • Data status: {status}"
    )

    st.divider()


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
            "Foundation view. Final overview design will be refined later."
        )

    with tabs[1]:
        st.subheader("Game Intelligence")

    with tabs[2]:
        st.subheader("Results")

    with tabs[3]:
        st.subheader("Games")

        season_type = st.selectbox(
            "Season Type",
            ["Preseason", "Regular Season"],
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
                schedule["week"].astype(int) == week
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

        if prop != "Passing Yards":
            st.caption(
                f"{prop} will be connected after "
                "Passing Yards is validated."
            )
            return

        st.markdown("### Passing Yards")

        if sports_game_odds_configured():
            try:
                markets = load_nfl_passing_yards_markets()
                if not markets.empty:
                    st.caption(
                        f"Live sportsbook market connected • "
                        f"{len(markets)} available player lines"
                    )
                else:
                    st.caption(
                        "Sportsbook feed connected, but no Passing Yards "
                        "markets are currently available."
                    )
            except Exception:
                st.caption(
                    "Sportsbook feed is configured but temporarily unavailable."
                )
        else:
            st.caption(
                "Sportsbook line feed not configured yet • "
                "showing historical + matchup intelligence"
            )

        try:
            schedule = load_nfl_schedule(
                NFL_SEASON,
                "PRE",
            )

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

            games = schedule[
                schedule["week"].astype(int) == week
            ].reset_index(drop=True)

            labels = [
                f'{game["away_team"]} @ '
                f'{game["home_team"]}'
                for _, game in games.iterrows()
            ]

            game_label = st.selectbox(
                "Preview Game",
                labels,
                key="nfl_passing_card_game",
            )

            game = games.iloc[
                labels.index(game_label)
            ]

            qbs = _build_game_qb_preview(game)

            st.caption(
                "Temporary intelligence cards while the final "
                "Top 25 design is being built."
            )

            if qbs.empty:
                st.info(
                    "No meaningful Passing Yards candidates are "
                    "available for this game."
                )
            else:
                for _, row in qbs.iterrows():
                    _render_qb_card(row)

        except Exception as exc:
            st.warning(
                "Passing Yards cards are temporarily unavailable."
            )
            st.caption(str(exc))


show()
