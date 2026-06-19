import streamlit as st
import pandas as pd

st.set_page_config(
    page_title="Sach Sports Dashboard",
    page_icon="⚾",
    layout="wide"
)

st.title("⚾ Sach Sports Dashboard")
st.subheader("Version 1 - Demo Dashboard")

st.markdown("---")

# Sample Home Run Leaders
hr_data = pd.DataFrame({
    "Player": ["Aaron Judge", "Shohei Ohtani", "Kyle Schwarber", "Pete Alonso", "Juan Soto"],
    "HR": [29, 27, 24, 22, 21]
})

# Sample Hits Leaders
hits_data = pd.DataFrame({
    "Player": ["Luis Arraez", "Bobby Witt Jr.", "Freddie Freeman", "Mookie Betts", "Jose Altuve"],
    "Hits": [108, 104, 101, 99, 96]
})

# Sample Total Bases Leaders
tb_data = pd.DataFrame({
    "Player": ["Aaron Judge", "Shohei Ohtani", "Bobby Witt Jr.", "Juan Soto", "Freddie Freeman"],
    "Total Bases": [210, 202, 194, 188, 181]
})

col1, col2, col3 = st.columns(3)

with col1:
    st.header("💣 HR Leaders")
    st.dataframe(hr_data, hide_index=True)

with col2:
    st.header("🔥 Hits Leaders")
    st.dataframe(hits_data, hide_index=True)

with col3:
    st.header("⚾ Total Bases")
    st.dataframe(tb_data, hide_index=True)

st.markdown("---")

st.header("📊 Research Notes")

st.info(
    "This is Version 1 of the Sach Sports Dashboard. "
    "Live MLB data, player research, watchlists, and daily updates will be added next."
)
