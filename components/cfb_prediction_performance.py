"""CFB prediction-performance shell using only real graded records when available."""
from __future__ import annotations
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
import streamlit as st

TZ = ZoneInfo("America/Toronto")
HISTORY = Path(__file__).parents[1] / "data" / "cfb_prediction_performance_history.json"
MARKETS = ["Passing Yards","Passing Attempts","Completions","Rushing Yards","Rushing Attempts","Receiving Yards","Receptions","Anytime TD","First TD"]
ICONS = {"Passing Yards":"🏈","Passing Attempts":"🔁","Completions":"✅","Rushing Yards":"🏃","Rushing Attempts":"💨","Receiving Yards":"🙌","Receptions":"🧤","Anytime TD":"🔥","First TD":"1️⃣"}

def _load():
    try: data=json.loads(HISTORY.read_text(encoding="utf-8"))
    except Exception: data={"schema_version":1,"days":{}}
    data.setdefault("days",{})
    return data

def _rows(data, market, period):
    today=datetime.now(TZ).date()
    starts={"Today":today,"Week":today-timedelta(days=6),"Month":today.replace(day=1),"Season":today.replace(month=1,day=1)}
    start=starts[period]; out=[]
    for key, rec in data.get("days",{}).items():
        try: d=date.fromisoformat(key)
        except Exception: continue
        if start <= d <= today:
            for row in (rec or {}).get("markets",{}).get(market,[]) or []:
                if isinstance(row,dict): out.append({**row,"date":key})
    return out

def render_cfb_prediction_performance():
    st.markdown('''<style>
    .cfb-perf-title{margin:18px 0 4px;color:#fff;font-size:1.10rem;font-weight:950}.cfb-perf-copy{color:#a7abb2;font-size:.74rem;margin-bottom:7px}
    .cfb-perf-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:7px 0}.cfb-perf-m{background:#0d0f10;border:1px solid #30343a;border-bottom:2px solid #d8b35f;border-radius:9px;padding:7px 5px}.cfb-perf-m span{display:block;color:#969ba2;font-size:.50rem}.cfb-perf-m strong{display:block;color:#fff;font-size:.82rem;margin-top:3px}
    div[class*="st-key-cfb_performance_period"] [role="radiogroup"]{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;width:100%!important;gap:0!important}div[class*="st-key-cfb_performance_period"] button{width:100%!important;min-width:0!important}
    </style><div class="cfb-perf-title">📊 Prediction Performance</div><div class="cfb-perf-copy">Each market is tracked separately. Results appear only after saved model predictions are graded.</div>''',unsafe_allow_html=True)
    period=st.segmented_control("CFB performance period",["Today","Week","Month","Season"],default="Today",key="cfb_performance_period",label_visibility="collapsed") or "Today"
    data=_load(); tabs=st.tabs([f"{ICONS[m]} {m}" for m in MARKETS])
    for tab,market in zip(tabs,MARKETS):
        with tab:
            rows=_rows(data,market,period); settled=[r for r in rows if isinstance(r.get("correct"),bool)]; wins=sum(r.get("correct") is True for r in settled); losses=len(settled)-wins; rate=f"{100*wins/len(settled):.1f}%" if settled else "—"
            st.markdown(f'<div class="cfb-perf-grid"><div class="cfb-perf-m"><span>RECORD</span><strong>{wins}-{losses}</strong></div><div class="cfb-perf-m"><span>SETTLED</span><strong>{len(settled)}</strong></div><div class="cfb-perf-m"><span>HIT RATE</span><strong>{rate}</strong></div><div class="cfb-perf-m"><span>PENDING</span><strong>{len(rows)-len(settled)}</strong></div></div>',unsafe_allow_html=True)
            if not rows: st.caption(f"{market} results will appear here after model-backed predictions are saved and graded.")
