"""SportsGameOdds integration for NFL Passing Yards."""
import os, re
import pandas as pd
import requests
import streamlit as st

URL="https://api.sportsgameodds.com/v2/events"

def _key():
    try:
        v=st.secrets.get("SPORTSGAMEODDS_API_KEY")
        if v: return str(v).strip()
    except Exception:
        pass
    v=os.getenv("SPORTSGAMEODDS_API_KEY")
    return str(v).strip() if v else None

def sports_game_odds_configured():
    return bool(_key())

def _player_name(name):
    text=str(name or "").strip()
    text=re.sub(r"\s+Passing Yards Over/Under$","",text,flags=re.I)
    text=re.sub(r"\s+Passing Yards$","",text,flags=re.I)
    return text.strip()

@st.cache_data(ttl=600, show_spinner=False)
def load_nfl_passing_yards_markets():
    api_key=_key()
    if not api_key:
        return pd.DataFrame()
    r=requests.get(
        URL,
        headers={"x-api-key":api_key},
        params={"leagueID":"NFL","oddsAvailable":"true","limit":100},
        timeout=30,
    )
    r.raise_for_status()
    payload=r.json()
    if not payload.get("success",True):
        raise RuntimeError(payload.get("error") or "SportsGameOdds request failed")

    rows=[]
    for event in payload.get("data",[]):
        teams=event.get("teams") or {}
        away=(teams.get("away") or {}).get("names") or {}
        home=(teams.get("home") or {}).get("names") or {}
        matchup=f"{away.get('long','')} @ {home.get('long','')}".strip()

        for odd in (event.get("odds") or {}).values():
            if str(odd.get("statID","")).lower()!="passing_yards":
                continue
            if str(odd.get("sideID","")).lower()!="over":
                continue
            entity=str(odd.get("statEntityID",""))
            if entity.lower() in {"","all","home","away"}:
                continue

            books=[]
            for bookmaker,book in (odd.get("byBookmaker") or {}).items():
                if not book.get("available"): continue
                line=pd.to_numeric(book.get("overUnder"),errors="coerce")
                if pd.isna(line): continue
                books.append((bookmaker,float(line),book.get("odds")))

            best=min(books,key=lambda x:x[1]) if books else None
            rows.append({
                "event_id":event.get("eventID"),
                "matchup":matchup,
                "player_name":_player_name(odd.get("marketName")),
                "market_player_id":odd.get("playerID") or odd.get("statEntityID"),
                "consensus_line":pd.to_numeric(odd.get("bookOverUnder"),errors="coerce"),
                "best_over_line":best[1] if best else pd.NA,
                "best_over_book":best[0] if best else None,
                "best_over_odds":best[2] if best else None,
                "books_available":len(books),
            })
    return pd.DataFrame(rows).sort_values(["matchup","player_name"]).reset_index(drop=True) if rows else pd.DataFrame()
