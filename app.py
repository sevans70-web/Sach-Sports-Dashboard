import streamlit as st
import pandas as pd
import requests
# LIVE MLB SCHEDULE DATA


@st.cache_data(ttl=3600)
def get_mlb_schedule():
    url = "https://statsapi.mlb.com/api/v1/schedule?sportId=1"
    
    try:
        response = requests.get(url)
        data = response.json()

        games = []

        for date in data.get("dates", []):
            for game in date.get("games", []):
                away_team = game["teams"]["away"]["team"]["name"]
                home_team = game["teams"]["home"]["team"]["name"]

                games.append({
                    "Away Team": away_team,
                    "Home Team": home_team
                })

        return pd.DataFrame(games)

    except Exception:
        return pd.DataFrame({
            "Away Team": ["Data Unavailable"],
            "Home Team": ["Please Try Again"]
        })
@st.cache_data(ttl=3600)
def get_mlb_hitting_stats():
    url = "https://statsapi.mlb.com/api/v1/stats?stats=season&group=hitting&playerPool=ALL&sportIds=1&limit=10"

    try:
        response = requests.get(url)
        data = response.json()

        players = []

        for player in data["stats"][0]["splits"]:
            players.append({
                "Player": player["player"]["fullName"],
                "Team": player["team"]["name"],
                "HR": player["stat"].get("homeRuns", 0),
                "Hits": player["stat"].get("hits", 0),
                "RBI": player["stat"].get("rbi", 0),
                "AVG": player["stat"].get("avg", "N/A")
            })

        return pd.DataFrame(players)

    except Exception:
        return pd.DataFrame({
            "Player": ["Data Unavailable"],
            "Team": ["Try Again"],
            "HR": [0],
            "Hits": [0],
            "RBI": [0],
            "AVG": ["N/A"]
        })
    url = "https://statsapi.mlb.com/api/v1/schedule?sportId=1"
    
    try:
        response = requests.get(url)
        data = response.json()

        games = []

        for date in data.get("dates", []):
            for game in date.get("games", []):
                away_team = game["teams"]["away"]["team"]["name"]
                home_team = game["teams"]["home"]["team"]["name"]

                games.append({
                    "Away Team": away_team,
                    "Home Team": home_team
                })

        return pd.DataFrame(games)

    except Exception:
        return pd.DataFrame({
            "Away Team": ["Data Unavailable"],
            "Home Team": ["Please Try Again"]
        }) 
@st.cache_data(ttl=3600)
def get_live_hr_leaders():
    url = "https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=homeRuns&statGroup=hitting&season=2026&limit=10&sportId=1"

    try:
        response = requests.get(url)
        data = response.json()

        leaders = []

        for leader in data["leagueLeaders"][0]["leaders"]:
            leaders.append({
                "Rank": leader["rank"],
                "Player": leader["person"]["fullName"],
                "HR": leader["value"]
            })

        return pd.DataFrame(leaders)

    except Exception:
        return pd.DataFrame({
            "Rank": ["N/A"],
            "Player": ["Data Unavailable"],
            "HR": ["N/A"]
        })
@st.cache_data(ttl=3600)
def get_live_hits_leaders():
    url = "https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=hits&statGroup=hitting&season=2026&limit=10&sportId=1"

    try:
        response = requests.get(url)
        data = response.json()

        leaders = []

        for leader in data["leagueLeaders"][0]["leaders"]:
            leaders.append({
                "Rank": leader["rank"],
                "Player": leader["person"]["fullName"],
                "Hits": leader["value"]
            })

        return pd.DataFrame(leaders)

    except Exception:
        return pd.DataFrame({
            "Rank": ["N/A"],
            "Player": ["Data Unavailable"],
            "Hits": ["N/A"]
        })   
@st.cache_data(ttl=3600)
def get_live_tb_leaders():
    url = "https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=totalBases&statGroup=hitting&season=2026&limit=10&sportId=1"

    try:
        response = requests.get(url)
        data = response.json()

        leaders = []

        for leader in data["leagueLeaders"][0]["leaders"]:
            leaders.append({
                "Rank": leader["rank"],
                "Player": leader["person"]["fullName"],
                "Total Bases": leader["value"]
            })

        return pd.DataFrame(leaders)

    except Exception:
        return pd.DataFrame({
            "Rank": ["N/A"],
            "Player": ["Data Unavailable"],
            "Total Bases": ["N/A"]
        })     
st.set_page_config(page_title="Sach Sports Dashboard", layout="wide")
st.title("⚾ Sach Sports Dashboard")
st.subheader("Version 16 - Added live total bases leaders function")
st.write("Last Updated: June 24, 2026")
st.header("⚾ Today's MLB Schedule")

mlb_schedule = get_mlb_schedule()

if not mlb_schedule.empty:
    st.dataframe(mlb_schedule, use_container_width=True)
else:
    st.warning("No MLB games found today.")

st.divider()
st.header("📊 Live MLB Player Stats")

live_stats = get_mlb_hitting_stats()

if not live_stats.empty:
    st.dataframe(live_stats, use_container_width=True)
else:
    st.warning("No player stats found.")
st.divider()

st.header("🏆 Live League Leaders")
st.divider()
hr_leaders = get_live_hr_leaders()

st.header("💣 Live HR Leaders")

st.dataframe(hr_leaders, use_container_width=True)
st.divider()

st.header("🔥 Live Hits Leaders")

hits_leaders = get_live_hits_leaders()

if not hits_leaders.empty:
    st.dataframe(hits_leaders, use_container_width=True)
else:
    st.warning("No hits leaders found.")

st.divider()
st.header("⚾ Live Total Bases Leaders")

tb_leaders = get_live_tb_leaders()

if not tb_leaders.empty:
    st.dataframe(tb_leaders, use_container_width=True)
else:
    st.warning("No total bases leaders found.")

st.divider()
leaders_data = pd.DataFrame({
    "Player": [
        "Aaron Judge",
        "Shohei Ohtani",
        "Luis Arraez",
        "Kyle Schwarber",
        "Juan Soto"
    ],
    "HR": [29, 27, 12, 23, 18],
    "Hits": [88, 82, 108, 75, 79],
    "TB": [202, 198, 145, 181, 160]
})

st.dataframe(leaders_data, use_container_width=True)
st.header("⭐ Best Overall Play")

st.success("""
🏆 Aaron Judge

HRR Rating: 96

Confidence: HIGH

Reason:
• Elite power profile
• Top HR projection today
• Strong matchup
""")

st.divider()
st.header("📈 Trending Players")

trend_data = pd.DataFrame({
    "Player": [
        "Aaron Judge",
        "Shohei Ohtani",
        "Luis Arraez",
        "Juan Soto",
        "Kyle Schwarber"
    ],

    "Trend": [
        "🔥 Hot",
        "🔥 Hot",
        "📈 Rising",
        "📈 Rising",
        "➡️ Stable"
    ],

    "Notes": [
        "HR surge",
        "Multi-category production",
        "Contact streak",
        "Improving plate discipline",
        "Consistent power"
    ]
})

st.dataframe(trend_data, use_container_width=True)

st.divider()
st.divider()

st.header("🎯 Confidence Rankings")

confidence_data = pd.DataFrame({
    "Player": [
        "Aaron Judge",
        "Shohei Ohtani",
        "Luis Arraez",
        "Juan Soto",
        "Kyle Schwarber"
    ],
    "Tier": [
        "A+",
        "A",
        "A",
        "B+",
        "B"
    ],
    "Confidence Score": [
        96,
        93,
        94,
        85,
        89
    ]
})

st.dataframe(confidence_data, use_container_width=True)
st.divider()

# TODAY'S TOP OPPORTUNITIES

col1, col2, col3 = st.columns(3)

with col1:
    st.metric(
        label="💣 Best HR Opportunity",
        value="Aaron Judge",
        delta="29 HR"
    )

with col2:
    st.metric(
        label="🔥 Best Hits Opportunity",
        value="Luis Arraez",
        delta="108 Hits"
    )

with col3:
    st.metric(
        label="⚾ Best TB Opportunity",
        value="Shohei Ohtani",
        delta="202 TB"
    )

st.divider()
st.header("🚨 Best Bets Today")

col1, col2, col3 = st.columns(3)

with col1:
    st.success("💣 HR Play\n\nAaron Judge\n\nHRR Rating: 96")

with col2:
    st.success("🔥 Hits Play\n\nLuis Arraez\n\nHits Rating: 94")

with col3:
    st.success("⚾ TB Play\n\nShohei Ohtani\n\nTB Rating: 93")

st.divider()
st.divider()

st.header("🩺 Injury Watch")

injury_data = pd.DataFrame({
    "Player": [
        "Mike Trout",
        "Yordan Alvarez",
        "Bryce Harper",
        "Fernando Tatis Jr.",
        "Corey Seager"
    ],
    "Status": [
        "Day-to-Day",
        "Questionable",
        "Healthy",
        "Healthy",
        "Day-to-Day"
    ],
    "Impact": [
        "High",
        "Medium",
        "None",
        "None",
        "High"
    ],
    "Research Note": [
        "Monitor lineup status",
        "Check pre-game update",
        "No injury concern",
        "Full go",
        "Could affect TB confidence"
    ]
})

st.dataframe(injury_data, use_container_width=True)
# HR WATCHLIST
st.divider()
st.divider()

st.header("📰 Sports News Watch")

news_data = pd.DataFrame({
    "Time": [
        "Today",
        "Today",
        "Today",
        "Yesterday",
        "This Week"
    ],
    "Type": [
        "Lineup",
        "Injury",
        "Contract",
        "Performance",
        "Market"
    ],
    "Player": [
        "Aaron Judge",
        "Mike Trout",
        "Shohei Ohtani",
        "Luis Arraez",
        "Juan Soto"
    ],
    "News": [
        "Monitor batting order before lock",
        "Day-to-day status needs update",
        "Reached 200 TB milestone",
        "Moved into top hits target",
        "HR rating trending upward"
    ],
    "Impact": [
        "High",
        "High",
        "Medium",
        "Medium",
        "Medium"
    ]
})

st.dataframe(news_data, use_container_width=True)
st.header("📈 Daily Movers")

movers_data = pd.DataFrame({
    "Player": [
        "Aaron Judge",
        "Kyle Schwarber",
        "Juan Soto",
        "Shohei Ohtani",
        "Luis Arraez"
    ],
    "Market": [
        "HR",
        "HR",
        "HR",
        "Total Bases",
        "Hits"
    ],
    "Movement": [
        "+4 HRR",
        "+3 HRR",
        "+3 HRR",
        "+2 TB Rating",
        "+1 Hits Rank"
    ],
    "Reason": [
        "Power profile improving",
        "Better matchup",
        "Recent form trending up",
        "Extra-base production rising",
        "Moved to top contact spot"
    ]
})
st.divider()

st.header("💰 Contract Incentive Watch")

contract_data = pd.DataFrame({
    "Player": [
        "Aaron Judge",
        "Shohei Ohtani",
        "Juan Soto",
        "Kyle Schwarber",
        "Luis Arraez"
    ],

    "Bonus Target": [
        "30 HR Milestone",
        "200 TB Milestone",
        "100 RBI Milestone",
        "35 HR Milestone",
        "200 Hits Milestone"
    ],

    "Current Progress": [
        "29 HR",
        "202 TB",
        "87 RBI",
        "28 HR",
        "108 Hits"
    ],

    "Status": [
        "🔥 Close",
        "✅ Reached",
        "📈 Tracking",
        "📈 Tracking",
        "📈 Tracking"
    ]
})

st.dataframe(contract_data, use_container_width=True)
st.dataframe(movers_data, use_container_width=True)
st.header("💣 HR Opportunities")
hr_data = pd.DataFrame({
    "Player": [
        "Aaron Judge",
        "Shohei Ohtani",
        "Kyle Schwarber",
        "Pete Alonso",
        "Juan Soto"
    ],

    "HRR Rating": [
        96,
        93,
        89,
        87,
        85
    ],

    "Confidence": [
        "High",
        "High",
        "Medium",
        "Medium",
        "Medium"
    ],

    "Reason": [
        "Elite power",
        "Hot streak",
        "Fly-ball profile",
        "Power matchup",
        "Strong recent form"
    ]
})

st.dataframe(hr_data, use_container_width=True)

# HITS WATCHLIST

st.header("🔥 Hits Opportunities")

hits_data = pd.DataFrame({
    "Player": [
        "Luis Arraez",
        "Bobby Witt Jr.",
        "Freddie Freeman",
        "Mookie Betts",
        "Jose Altuve"
    ],
    "Confidence": [
        "High",
        "High",
        "Medium",
        "Medium",
        "Medium"
    ],
    "Reason": [
        "Elite contact",
        "Consistent form",
        "Strong matchup",
        "High OBP",
        "Reliable hitter"
    ]
})

st.dataframe(hits_data, use_container_width=True)

# TOTAL BASES WATCHLIST

st.header("⚾ Total Bases Opportunities")

tb_data = pd.DataFrame({
    "Player": [
        "Shohei Ohtani",
        "Aaron Judge",
        "Bobby Witt Jr.",
        "Juan Soto",
        "Freddie Freeman"
    ],
    "Confidence": [
        "High",
        "High",
        "Medium",
        "Medium",
        "Medium"
    ],
    "Reason": [
        "Power + speed",
        "Extra-base potential",
        "Hot bat",
        "Gap power",
        "Consistent production"
    ]
})

st.dataframe(tb_data, use_container_width=True)

st.divider()
st.divider()

st.header("🔄 What Changed Today")

changes_data = pd.DataFrame({
    "Player": [
        "Aaron Judge",
        "Luis Arraez",
        "Shohei Ohtani",
        "Kyle Schwarber",
        "Juan Soto"
    ],
    "Yesterday": [
        "HRR 94",
        "Hits Rank #2",
        "TB Rank #2",
        "HRR 86",
        "HRR 82"
    ],
    "Today": [
        "HRR 96",
        "Hits Rank #1",
        "TB Rank #1",
        "HRR 89",
        "HRR 85"
    ],
    "Change": [
        "+2",
        "↑",
        "↑",
        "+3",
        "+3"
]
})

st.dataframe(changes_data, use_container_width=True)
st.header("📝 Research Notes")

st.info("""
📊 TODAY'S RESEARCH SUMMARY

• Aaron Judge leads today's HR board (HRR 96)
• Luis Arraez remains the strongest contact hitter
• Shohei Ohtani projects best for Total Bases
• HR market grades stronger than Hits today
• Two High Confidence HR opportunities identified

COMING SOON

• Daily projections
• Odds integration
• Trending players
• Injury tracking
• HRR Research Ratings
• What Changed Today
""")
