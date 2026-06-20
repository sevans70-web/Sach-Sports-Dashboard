import streamlit as st
import pandas as pd

st.set_page_config(page_title="Sach Sports Dashboard", layout="wide")

st.title("⚾ Sach Sports Dashboard")

st.subheader("Version 10 - Sports News Watch")

st.write("Last Updated: June 20, 2026")

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
