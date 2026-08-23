import pandas as pd
import streamlit as st
from data.nfl_odds import load_nfl_passing_yards_markets, sports_game_odds_configured
from data.nfl_roster import get_team_skill_players, load_nfl_roster
from data.nfl_schedule import load_nfl_schedule
from engines.nfl_passing_projection import build_passing_yards_projection

NFL_SEASON=2026
NFL_BASELINE_SEASON=2025

def show():
    st.title("🏈 NFL")
    st.caption("Player Prop Intelligence • Matchup Analysis • Predictions • Performance Tracking")
    tabs=st.tabs(["🏈 Overview","🧠 Game Intelligence","📈 Results","🎮 Games","🎯 Player Props"])

    with tabs[0]:
        st.subheader("NFL Overview")
        try:
            roster=load_nfl_roster(NFL_SEASON)
            st.caption(f"{NFL_SEASON} roster data connected • {roster['player_id'].nunique()} unique players")
            teams=sorted(roster["team"].dropna().astype(str).unique())
            team=st.selectbox("Roster Check",teams,key="nfl_roster_team_selector")
            players=get_team_skill_players(team,NFL_SEASON)
            st.dataframe(players[["player_name","position","status","depth_chart_position","player_id"]],use_container_width=True,hide_index=True)
        except Exception as exc:
            st.warning("NFL roster data is temporarily unavailable.")
            st.caption(str(exc))

    with tabs[1]:
        st.subheader("Game Intelligence")
    with tabs[2]:
        st.subheader("Results")
    with tabs[3]:
        st.subheader("Games")
        season_type=st.selectbox("Season Type",["Preseason","Regular Season"],key="nfl_season_type_selector")
        game_type="PRE" if season_type=="Preseason" else "REG"
        try:
            schedule=load_nfl_schedule(NFL_SEASON,game_type)
            weeks=sorted(schedule["week"].dropna().astype(int).unique())
            week=st.selectbox("Select Week",weeks,key=f"nfl_week_selector_{game_type}")
            for _,g in schedule[schedule["week"].astype(int)==week].iterrows():
                st.markdown(f'**{g["away_team"]} @ {g["home_team"]}**')
                st.caption(f'{g["kickoff_et"]} • {g["status"]}')
                st.divider()
        except Exception as exc:
            st.warning("NFL schedule data is temporarily unavailable.")
            st.caption(str(exc))

    with tabs[4]:
        st.subheader("Player Props")
        prop=st.selectbox("Select Prop",["Passing Yards","Rushing Yards","Receiving Yards","Receptions","Anytime TD","First TD"],key="nfl_prop_selector")
        if prop!="Passing Yards":
            st.caption(f"{prop} will be connected after Passing Yards is validated.")
        else:
            st.markdown("### Live Passing Yards Market")
            if not sports_game_odds_configured():
                st.info("SportsGameOdds API key is not configured yet. Historical data remains available below.")
            else:
                try:
                    markets=load_nfl_passing_yards_markets()
                    if markets.empty:
                        st.info("No NFL Passing Yards markets are currently available.")
                    else:
                        st.dataframe(
                            markets[["player_name","matchup","consensus_line","best_over_line","best_over_book","best_over_odds","books_available"]],
                            use_container_width=True,hide_index=True
                        )
                except Exception as exc:
                    st.warning("Live NFL Passing Yards market is temporarily unavailable.")
                    st.caption(str(exc))

            st.markdown("### Historical + Matchup Preview")
            try:
                schedule=load_nfl_schedule(NFL_SEASON,"PRE")
                weeks=sorted(schedule["week"].dropna().astype(int).unique())
                week=st.selectbox("Preview Week",weeks,index=max(len(weeks)-1,0),key="nfl_passing_preview_week")
                games=schedule[schedule["week"].astype(int)==week].reset_index(drop=True)
                labels=[f'{g["away_team"]} @ {g["home_team"]}' for _,g in games.iterrows()]
                label=st.selectbox("Preview Game",labels,key="nfl_passing_preview_game")
                game=games.iloc[labels.index(label)]

                away=build_passing_yards_projection(str(game["home_team"]).upper(),NFL_SEASON,NFL_BASELINE_SEASON)
                away=away[away["team"]==str(game["away_team"]).upper()].copy()
                home=build_passing_yards_projection(str(game["away_team"]).upper(),NFL_SEASON,NFL_BASELINE_SEASON)
                home=home[home["team"]==str(game["home_team"]).upper()].copy()
                preview=pd.concat([away,home],ignore_index=True)

                cols=[c for c in ["player_name","team","baseline_team","games_played","passing_yards_per_game","last_5_passing_yards_per_game","last_3_passing_yards_per_game","season_yards_per_attempt","season_completion_rate","passing_matchup_label","passing_yards_projection_matchup","passing_data_status"] if c in preview.columns]
                if preview.empty:
                    st.info("No Passing Yards baseline data is available for the selected game.")
                else:
                    st.dataframe(preview[cols],use_container_width=True,hide_index=True)
            except Exception as exc:
                st.warning("Passing Yards historical preview is temporarily unavailable.")
                st.caption(str(exc))

show()
