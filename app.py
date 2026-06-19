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

st.header("📝 Research Notes")

st.info("""
Version 2 introduces betting research watchlists.

Future upgrades:
- Daily projections
- Odds integration
- Trending players
- Injury tracking
- HRR Research Ratings
- What Changed button
""")
