"""MLB-style WNBA Prediction Performance UI."""
from __future__ import annotations
from html import escape
import streamlit as st
from data.wnba_prediction_performance import load_history, normalized_result, records_for_period, summarize

PERIODS=["Today","Yesterday","7 Days","Month","Season"]
MARKETS=["All Markets","Points","Rebounds","Assists","3-Pointers Made","Points + Rebounds + Assists (PRA)","Points + Rebounds","Points + Assists","Rebounds + Assists","Steals","Blocks"]
RESULT_MARK={"HIT":"✅","MISS":"❌","PUSH":"➖","PENDING":"⏳"}

def _market(row): return str(row.get("market") or row.get("prop") or "").strip()
def _filter(rows,market): return rows if market=="All Markets" else [r for r in rows if _market(r).lower()==market.lower()]
def _prediction(row):
    player=escape(str(row.get("player_name") or row.get("player") or "Player")); market=escape(_market(row) or "Prop"); direction=escape(str(row.get("direction") or row.get("pick") or "").strip()); line=row.get("line"); pick=f'{direction}{" " + escape(str(line)) if line not in (None,"") else ""}'.strip(); return f"{player} · {market}"+(f" · {pick}" if pick else "")
def _actual(row):
    actual=row.get("actual",row.get("actual_value")); return "" if actual in (None,"") else f" · Actual {escape(str(actual))}"

def render_wnba_prediction_performance():
    st.markdown('''<style>
    .wp-title{font-size:1.35rem;font-weight:950;margin:.25rem 0}.wp-help{border:2px solid #34383d;border-radius:12px;padding:.65rem .8rem;margin:.55rem 0 .9rem;color:#e4e6e8;font-size:.78rem}.wp-sub{font-size:1rem;font-weight:950;margin:.8rem 0 .2rem}.wp-copy{color:#a7abb2;font-size:.72rem;margin-bottom:.5rem}.wp-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:8px 0}.wp-kpi{min-width:0;min-height:72px;background:#101112;border:2px solid #34383d;border-radius:12px;padding:8px 6px;display:flex;flex-direction:column;justify-content:center}.wp-kpi:first-child{border-color:#19d978}.wp-kpi:nth-child(3){border-color:#d6b35c}.wp-kpi span{color:#a7abb2;font-size:.56rem}.wp-kpi strong{font-size:.9rem;margin-top:4px}.wp-row{background:#101112;border:1px solid #34383d;border-left:4px solid #19d978;border-radius:10px;padding:9px 10px;margin:6px 0;font-size:.75rem}.wp-row small{display:block;color:#9ea3aa;font-size:.65rem;margin-top:3px}
    div[class*="st-key-wnba_performance_period"] [role="radiogroup"]{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;width:100%!important;gap:0!important}div[class*="st-key-wnba_performance_period"] button{min-width:0!important;padding-left:.2rem!important;padding-right:.2rem!important}div[class*="st-key-wnba_performance_period"] button p{font-size:.68rem!important;white-space:nowrap!important}
    div[class*="st-key-wnba_performance_market"] [data-testid="stSegmentedControl"]{width:100%!important;overflow-x:auto!important}div[class*="st-key-wnba_performance_market"] [role="radiogroup"]{display:flex!important;flex-wrap:nowrap!important;width:max-content!important;min-width:100%!important}div[class*="st-key-wnba_performance_market"] button{white-space:nowrap!important}
    @media(max-width:700px){.wp-grid{gap:4px}.wp-kpi{padding:7px 4px;min-height:67px}.wp-kpi span{font-size:.5rem}.wp-kpi strong{font-size:.78rem}div[class*="st-key-wnba_performance_period"] button p{font-size:.58rem!important}}
    </style><div class="wp-title">📊 Prediction Performance</div><div class="wp-help">ⓘ <b>How performance is measured</b><br><span style="color:#a7abb2">Every saved WNBA player-prop prediction is graded like a bet: HIT, MISS or PUSH. Game winners and final scores do not count toward dashboard performance.</span></div><div class="wp-sub">🌐 Overall WNBA Performance</div><div class="wp-copy">Overall dashboard results across every tracked WNBA prop market.</div>''',unsafe_allow_html=True)
    period=st.segmented_control("Performance Period",PERIODS,default=st.session_state.get("wnba_performance_period","Today"),key="wnba_performance_period",selection_mode="single",label_visibility="collapsed") or "Today"
    all_rows=records_for_period(load_history(),period); total=summarize(all_rows); rate=f'{total["hit_rate"]:.1f}%' if total["hits"]+total["misses"] else "—"
    st.markdown(f'<div class="wp-grid"><div class="wp-kpi"><span>HIT RATE</span><strong>{rate}</strong></div><div class="wp-kpi"><span>CORRECT / SETTLED</span><strong>{total["hits"]} / {total["graded"]}</strong></div><div class="wp-kpi"><span>PENDING</span><strong>{total["pending"]}</strong></div><div class="wp-kpi"><span>PUSHES</span><strong>{total["pushes"]}</strong></div></div>',unsafe_allow_html=True)
    st.markdown('<div class="wp-sub">Market Performance</div><div class="wp-copy">Each prop market is tracked separately.</div>',unsafe_allow_html=True)
    market=st.segmented_control("Market",MARKETS,default=st.session_state.get("wnba_performance_market","All Markets"),key="wnba_performance_market",selection_mode="single",label_visibility="collapsed") or "All Markets"
    rows=_filter(all_rows,market); result=summarize(rows); mrate=f'{result["hit_rate"]:.1f}%' if result["hits"]+result["misses"] else "—"
    st.markdown(f'<div class="wp-grid"><div class="wp-kpi"><span>HITS / PREDICTIONS</span><strong>{result["hits"]} / {result["predictions"]}</strong></div><div class="wp-kpi"><span>PENDING</span><strong>{result["pending"]}</strong></div><div class="wp-kpi"><span>SETTLED</span><strong>{result["graded"]}</strong></div><div class="wp-kpi"><span>HIT RATE</span><strong>{mrate}</strong></div></div>',unsafe_allow_html=True)
    if not rows: st.caption("Results will appear after saved WNBA prop predictions are graded."); return
    st.markdown("#### Prediction Results")
    for row in reversed(rows):
        status=normalized_result(row); date=escape(str(row.get("date") or "")); st.markdown(f'<div class="wp-row">{RESULT_MARK[status]} <b>{status}</b> · {_prediction(row)}<small>{date}{_actual(row)}</small></div>',unsafe_allow_html=True)
