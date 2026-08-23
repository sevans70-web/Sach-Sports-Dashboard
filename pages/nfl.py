import pandas as pd
import streamlit as st

from data.nfl_odds import sports_game_odds_configured
from data.nfl_schedule import load_nfl_schedule
from engines.nfl_passing_market_join import (
    attach_live_passing_yards_lines,
)
from engines.nfl_passing_projection import (
    build_passing_yards_projection,
)

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
    away = away[
        away["team"] == away_team
    ].copy()

    home = build_passing_yards_projection(
        away_team,
        NFL_SEASON,
        NFL_BASELINE_SEASON,
    )
    home = home[
        home["team"] == home_team
    ].copy()

    qbs = pd.concat(
        [away, home],
        ignore_index=True,
    )

    if qbs.empty:
        return qbs

    qbs["attempts"] = pd.to_numeric(
        qbs.get("attempts"),
        errors="coerce",
    )

    # Temporary meaningful-sample filter.
    qbs = qbs[
        (qbs["games_played"].fillna(0) >= 3)
        | (qbs["attempts"].fillna(0) >= 50)
    ].copy()

    if sports_game_odds_configured():
        qbs = attach_live_passing_yards_lines(
            qbs
        )
    else:
        qbs["market_match_status"] = "API not configured"
        qbs["consensus_line"] = pd.NA
        qbs["best_over_line"] = pd.NA
        qbs["best_over_book"] = None
        qbs["best_over_odds"] = None
        qbs["books_available"] = 0
        qbs["projection_edge_yards"] = pd.NA

    return qbs.sort_values(
        "passing_yards_projection_matchup",
        ascending=False,
        na_position="last",
    ).reset_index(drop=True)


def _render_qb_card(row):
    name = row.get(
        "player_name",
        "Unknown QB",
    )
    team = row.get(
        "team",
        "",
    )

    st.markdown(
        f"### {name} · {team}"
    )

    c1, c2, c3, c4 = st.columns(4)

    with c1:
        st.metric(
            "2025 Pass Yds/Game",
            _format_number(
                row.get(
                    "passing_yards_per_game"
                )
            ),
        )

    with c2:
        st.metric(
            "Matchup Projection",
            _format_number(
                row.get(
                    "passing_yards_projection_matchup"
                )
            ),
        )

    with c3:
        st.metric(
            "Sportsbook Line",
            _format_number(
                row.get(
                    "consensus_line"
                )
            ),
        )

    with c4:
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

        st.metric(
            "Model Edge",
            edge_text,
        )

    c5, c6, c7 = st.columns(3)

    with c5:
        st.caption(
            "Last 5: "
            + _format_number(
                row.get(
                    "last_5_passing_yards_per_game"
                )
            )
        )

    with c6:
        st.caption(
            "Last 3: "
            + _format_number(
                row.get(
                    "last_3_passing_yards_per_game"
                )
            )
        )

    with c7:
        st.caption(
            "Yards/Attempt: "
            + _format_number(
                row.get(
                    "season_yards_per_attempt"
                ),
                2,
            )
        )

    market_status = row.get(
        "market_match_status",
        "No live market",
    )

    books = row.get(
        "books_available",
        0,
    )

    matchup = row.get(
        "passing_matchup_label",
        "Unknown",
    )

    st.caption(
        f"Matchup: {matchup} • "
        f"Market: {market_status} • "
        f"Books: {int(books or 0)}"
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
        st.subheader(
            "NFL Overview"
        )
        st.caption(
            "Foundation view. Final overview design will be refined later."
        )

    with tabs[1]:
        st.subheader(
            "Game Intelligence"
        )

    with tabs[2]:
        st.subheader(
            "Results"
        )

    with tabs[3]:
        st.subheader(
            "Games"
        )

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
                schedule[
                    "week"
                ]
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
            st.caption(
                str(exc)
            )

    with tabs[4]:
        st.subheader(
            "Player Props"
        )

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

        st.markdown(
            "### Passing Yards"
        )

        if sports_game_odds_configured():
            st.caption(
                "Live sportsbook market connected."
            )
        else:
            st.caption(
                "Sportsbook line feed not configured yet."
            )

        try:
            schedule = load_nfl_schedule(
                NFL_SEASON,
                "PRE",
            )

            weeks = sorted(
                schedule[
                    "week"
                ]
                .dropna()
                .astype(int)
                .unique()
            )

            week = st.selectbox(
                "Preview Week",
                weeks,
                index=max(
                    len(weeks) - 1,
                    0,
                ),
                key="nfl_passing_card_week",
            )

            games = schedule[
                schedule["week"].astype(int)
                == week
            ].reset_index(
                drop=True
            )

            labels = [
                f'{game["away_team"]} @ '
                f'{game["home_team"]}'
                for _, game
                in games.iterrows()
            ]

            game_label = st.selectbox(
                "Preview Game",
                labels,
                key="nfl_passing_card_game",
            )

            game = games.iloc[
                labels.index(
                    game_label
                )
            ]

            qbs = _build_game_qb_preview(
                game
            )

            st.caption(
                "Temporary intelligence cards while the final "
                "Top 25 design is being built."
            )

            if qbs.empty:
                st.info(
                    "No meaningful Passing Yards candidates "
                    "are available for this game."
                )
            else:
                for _, row in qbs.iterrows():
                    _render_qb_card(
                        row
                    )

        except Exception as exc:
            st.warning(
                "Passing Yards cards are temporarily unavailable."
            )
            st.caption(
                str(exc)
            )


show()
