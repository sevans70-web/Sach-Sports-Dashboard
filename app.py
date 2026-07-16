import streamlit as st
import pandas as pd
import requests
from datetime import datetime
from zoneinfo import ZoneInfo
# LIVE MLB SCHEDULE DATA
st.set_page_config(page_title="Game Intelligence", layout="wide")
# ==========================================
# Sprint 2.5 - Ticket #009
# Game Intelligence Theme Engine
# ==========================================

st.markdown(
    """
    <style>
  .stApp {
    background: linear-gradient(
        180deg,
        #0B1E35 0%,
        #102B46 35%,
        #173C5E 70%,
        #1B4A73 100%
    );
    color: #F8FAFC;
}

    section[data-testid="stSidebar"] {
        background-color: #020617;
        border-right: 1px solid rgba(56, 189, 248, 0.25);
    }

    h1, h2, h3 {
        color: #F8FAFC;
        letter-spacing: -0.02em;
    }

    p, span, div {
        color: #CBD5E1;
    }

    div[data-testid="stMetric"] {
        background: rgba(30, 41, 59, 0.85);
        border: 1px solid rgba(56, 189, 248, 0.25);
        border-radius: 16px;
        padding: 18px;
        box-shadow: 0 0 22px rgba(14, 165, 233, 0.08);
    }

    div[data-testid="stMetricLabel"] {
        color: #94A3B8;
    }

    div[data-testid="stMetricValue"] {
        color: #38BDF8;
        font-weight: 800;
    }

    div[data-testid="stVerticalBlockBorderWrapper"] {
        background: rgba(30, 41, 59, 0.78);
        border: 1px solid rgba(56, 189, 248, 0.22);
        border-radius: 18px;
        box-shadow: 0 0 24px rgba(14, 165, 233, 0.08);
    }

    hr {
        border-color: rgba(148, 163, 184, 0.18);
        margin-top: 28px;
        margin-bottom: 28px;
    }

    .gi-brand-card {
        padding: 28px;
        border-radius: 20px;
        background: linear-gradient(135deg, #071A2F 0%, #0B2A4A 55%, #111827 100%);
        border: 1px solid rgba(56, 189, 248, 0.38);
        box-shadow: 0 0 28px rgba(14, 165, 233, 0.16);
        margin-top: 18px;
        margin-bottom: 22px;
    }

    .gi-blue {
        color: #38BDF8;
        font-weight: 800;
    }

    .gi-muted {
        color: #94A3B8;
    }
    </style>
    """,
    unsafe_allow_html=True
)
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
# ==========================================
# Sprint 2.5 - Ticket #008
# Home Page Framework
# ==========================================

page = st.sidebar.selectbox(
    "Navigation",
    ["🏠 Home", "⚾ MLB Hub"]
)

if page == "🏠 Home":
# ==========================================
# MLB HEADER
# ==========================================

header_left, header_right = st.columns([5, 1])

with header_left:
    st.title("⚾ MLB")

with header_right:
    st.caption("Updated")
    st.caption(
        datetime.now(
            ZoneInfo("America/Toronto")
        ).strftime("%I:%M %p")
    )

st.divider()

    st.header("Good Morning, Sach 👋")
    st.write("Your daily sports intelligence briefing is ready.")
    st.markdown(
    """
    <div style="
        margin-top: 20px;
        padding: 28px;
        border-radius: 16px;
        background: linear-gradient(135deg, #071A2F 0%, #0B2A4A 55%, #111827 100%);
        border: 1px solid rgba(56, 189, 248, 0.35);
        box-shadow: 0 0 20px rgba(14, 165, 233, 0.15);
    ">
        <h2 style="color: white; margin-bottom: 8px;">
            We don’t predict the future.
        </h2>
        <h2 style="color: #38BDF8; margin-top: 0;">
            We explain the present so people can make better decisions about the future.
        </h2>
    </div>
    """,
    unsafe_allow_html=True
)

    st.divider()

    st.subheader("🧠 Executive Intelligence Summary")

    c1, c2 = st.columns(2)

    with c1:
        with st.container(border=True):
            st.markdown("### 🎯 Today's Focus")
            st.success("⚾ Primary Sport: MLB")
            st.write("🕒 First Pitch: **7:05 PM ET**")
            st.write("🔥 Best Opportunity: **Aaron Judge HR**")

    with c2:
        with st.container(border=True):
            st.markdown("### ⚠️ Risk Assessment")
            st.warning("🌦 Weather Watch: 2 Games")
            st.write("📈 Confidence Level: **High**")
            st.write("🚨 Monitor Lineups Before Lock")

    st.divider()

    st.subheader("Today's Sports")

    s1, s2, s3, s4, s5 = st.columns(5)

    s1.markdown("### ⚾ MLB")
    s1.caption("🟢 Active Today")
    s1.write("🕒 First Pitch: 7:05 PM")
    s1.write("📅 15 Games")

    s2.markdown("### 🏈 NFL")
    s2.caption("⏳ Offseason")
    s2.write("🏟️ Hall of Fame Game")
    s2.write("📅 Coming Soon")

    s3.markdown("### 🏀 NBA")
    s3.caption("⏳ Offseason")
    s3.write("🏀 Opening Night")
    s3.write("📅 Coming Soon")

    s4.markdown("### 🏒 NHL")
    s4.caption("⏳ Offseason")
    s4.write("🥅 Training Camp")
    s4.write("📅 Coming Soon")

    s5.markdown("### ⚽ Soccer")
    s5.caption("🟢 Matches Today")
    s5.write("🌍 Multiple Leagues")
    s5.write("📅 Live Schedule")

    st.divider()

    st.subheader("🏆 Today's Best Opportunities")

    op1, op2, op3, op4 = st.columns(4)

    op1.metric("⚾ MLB", "Aaron Judge")
    op1.caption("Best Prop")
    op1.write("Over 1.5 Total Bases")
    op1.write("Confidence: 94%")

    op2.metric("🏈 NFL", "Coming Soon")
    op2.caption("Best Prop")
    op2.write("Season Preview")
    op2.write("Confidence: --")

    op3.metric("🏀 NBA", "Coming Soon")
    op3.caption("Best Prop")
    op3.write("Opening Night")
    op3.write("Confidence: --")

    op4.metric("⚽ Soccer", "Manchester City")
    op4.caption("Best Prop")
    op4.write("Win")
    op4.write("Confidence: 87%")

    st.divider()

    st.subheader("📡 Live Intelligence")

    st.info("🟢 Yankees lineup confirmed")

    st.warning("🌦 Weather watch: Rain risk increasing in Chicago")

    st.success("⚾ Aaron Judge recorded a 108.4 MPH exit velocity (Near Miss Candidate)")

    st.info("📈 Dodgers odds moved from +135 to +120")

    st.divider()

    st.subheader("Intelligence Level")

    level = st.radio(
        "Select your experience level",
        ["Beginner", "Intermediate", "Advanced"],
        horizontal=True,
        index=2
    )

    st.info(f"You are viewing the platform in {level} mode.")

    st.stop()
    
st.title("🧠 Game Intelligence")
st.caption("Trusted Sports Intelligence. Smarter Decisions.")

last_updated = datetime.now(ZoneInfo("America/Toronto")).strftime("%B %d, %Y at %I:%M %p ET")
st.caption(f"🕒 Last Updated: {last_updated}")


st.subheader("📰 Today's Story")

st.info("""
• Strong weather conditions favor power hitters in multiple parks.

• Two elite pitcher matchups create high-confidence strikeout opportunities.

• Several players enter today with significant momentum.

• Monitor evening weather before finalizing late-game decisions.
""")

Early indicators suggest today's edge will come from understanding the
combination of weather, matchups, and recent player form—not just season
statistics.
"""
)

st.caption("📡 This briefing will be generated automatically by the Intelligence Engine in a future release.")
st.subheader("📊 Today's Snapshot")

col1, col2, col3 = st.columns(3)

with col1:
    st.metric("⚾ Games Today", "15")
    st.metric("🌤 Weather Edge™", "6 Parks")

with col2:
    st.metric("💎 Hidden Gems™", "4")
    st.metric("👶 Rookie Radar™", "2")

with col3:
    st.metric("🚨 Rain Alerts™", "2 Games")
    st.metric("🕒 Updated", "Live")


st.divider()

st.subheader("🤔 Question of the Day")

with st.container(border=True):
    st.markdown("### Why does weather affect home run probability?")
    st.write(
        "Think about the relationship between temperature, wind direction, air density, and how far a baseball can travel."
    )

    with st.expander("💡 Reveal Answer"):
        st.success("""
Warmer temperatures reduce air density, allowing the ball to travel farther.

Wind blowing out toward the outfield can increase home run potential, while wind blowing in can reduce it.

Understanding weather is one of the many ways Game Intelligence helps members understand today's games—not just the statistics.
""")
st.header("🧠 Morning Intelligence Brief")

st.info("""
Today's slate has been analyzed across player form, pitcher matchups,
weather conditions, market movement, and live opportunity signals.

Our goal is simple:

Help you understand today's games before making today's decisions.
""")

st.divider()

st.subheader("🚨 Intelligence Alerts")

with st.container(border=True):

    st.success("🟢 Aaron Judge confirmed in today's lineup")

    st.warning("🟡 Wind expected to increase at Wrigley Field")

    st.error("🔴 Starting pitcher changed for NYY vs BOS")

    st.info("🔵 Rookie expected to make MLB debut tonight")

st.caption("These alerts will be powered automatically by our Intelligence Engine.")
st.divider()

st.subheader("Today's Intelligence")

col1, col2 = st.columns(2)

with col1:
    with st.container(border=True):
        st.markdown("### ☀️ Weather Intelligence")
        st.success("🟢 Favorable Today")
        st.write("🌬️ Wind conditions are being analyzed.")
        st.write("🌧️ Rain risk is being monitored.")
        st.caption("Learn why today's weather matters →")

    with st.container(border=True):
        st.markdown("### 💎 Hidden Gem Intelligence")
        st.info("💎 Hidden Gems Found")
        st.write("Searching for overlooked players.")
        st.write("Low-owned opportunities.")
        st.caption("See today's hidden gems →")

    with st.container(border=True):
        st.markdown("### 📈 Market Intelligence")
        st.warning("📊 Odds Movement")
        st.write("Monitoring sportsbook movement.")
        st.write("Looking for value opportunities.")
        st.caption("View market changes →")

with col2:
    with st.container(border=True):
        st.markdown("### ⚾ Matchup Intelligence")
        st.success("🔥 Elite Matchups")
        st.write("Top hitter vs. pitcher matchups.")
        st.write("Historical performance and pitch mix.")
        st.caption("Explore matchup intelligence →")

with st.container(border=True):
        st.markdown("### 👶 Rookie Radar")
        st.info("⭐ Rising Talent")
        st.write("Tracking rookies and breakout candidates.")
        st.write("Looking beyond the biggest names.")
        st.caption("See rookie projections →")

with st.container(border=True):
        st.markdown("### 🚨 Live Intelligence")
        st.error("🔴 Waiting for First Pitch")
        st.write("Near home runs.")
        st.write("Bullpen changes and live opportunities.")
        st.caption("Live alerts will appear here →")

st.divider()
# ==========================================
# Sprint 2.4 - Ticket #005
# Today's Top Opportunities
# ==========================================

st.subheader("🏆 Today's Top Opportunities")

opportunity_cards = [
    ("🟢 Best Overall", "Aaron Judge", "NYY vs BOS", "94", "☀️ Weather Edge™", "⚾ Matchup DNA™", "📈 Recent Form"),
    ("🔴 Best Home Run", "Kyle Schwarber", "PHI vs MIA", "92", "💪 Power Profile", "☀️ Weather Edge™", "⚾ Pitcher Matchup"),
    ("🔵 Best Hits", "Mookie Betts", "LAD vs COL", "89", "📈 Recent Form", "⚾ Contact Profile", "🧠 Matchup DNA™"),
    ("🟠 Best Total Bases", "Juan Soto", "NYM vs CIN", "91", "⚾ Matchup DNA™", "📈 Recent Form", "🌤 Weather Edge™"),
    ("🟣 Best Value", "Brenton Doyle", "COL vs LAD", "87", "💎 Hidden Gem™", "📈 Market Pulse™", "⚾ Matchup DNA™"),
]

cols = st.columns(5)

for col, card in zip(cols, opportunity_cards):
    category, player, matchup, score, signal1, signal2, signal3 = card

    with col:
        with st.container(border=True):
            st.markdown(f"### {category}")
            st.markdown(f"**{player}**")
            st.caption(matchup)

            st.metric("GI Score", score)

            st.markdown("**🧠 Intelligence Signals**")
            st.write(signal1)
            st.write(signal2)
            st.write(signal3)

            st.caption("📘 View Intelligence →")

st.divider()

st.header("🗓 Today's MLB Schedule")

mlb_schedule = get_mlb_schedule()

if not mlb_schedule.empty:
    st.dataframe(mlb_schedule, use_container_width=True)
else:
    st.warning("No MLB games found today.")

st.divider()
with st.expander("📊 Live MLB Player Stats", expanded=False):

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
