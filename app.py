import streamlit as st
import pandas as pd

st.set_page_config(page_title="Sach Sports Dashboard", layout="wide")

st.title("⚾ Sach Sports Dashboard")

st.subheader("Version 2 - Betting Research Dashboard")

st.caption("Last Updated: June 19, 2026")

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
# HR WATCHLIST

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
