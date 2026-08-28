from html import escape
import streamlit as st

from data.mlb_statcast import get_statcast_batter, load_statcast_batter_metrics

def _number(value, digits=3):
    try: return f"{float(value):.{digits}f}"
    except (TypeError, ValueError): return "—"

def _percent(value, digits=1):
    try: return f"{float(value):.{digits}f}%"
    except (TypeError, ValueError): return "—"

def _metric(label, value):
    return f"<div class='gi-intel-metric'><span>{escape(label)}</span><strong>{escape(value)}</strong></div>"

def _summary(player):
    cat = str(player.get("category") or "").lower()
    gi = float(player.get("gi_score", player.get("score",0)) or 0)
    if "home run" in cat:
        return [("GI Score",f"{gi:.1f}"),("HR Probability",f"{float(player.get('home_run_probability',0) or 0):.0f}%"),("Prop","1+ HR")]
    if "total base" in cat:
        return [("GI Score",f"{gi:.1f}"),("Projected TB",f"{float(player.get('projected_total_bases',0) or 0):.1f}"),("Over 1.5 TB",f"{float(player.get('over_1_5_total_bases_probability',0) or 0):.0f}%")]
    if cat == "runs":
        return [("GI Score",f"{gi:.1f}"),("Projected Runs",f"{float(player.get('projected_runs',0) or 0):.1f}"),("1+ Run",f"{float(player.get('one_plus_run_probability',0) or 0):.0f}%")]
    if cat in {"rbi","rbis"}:
        return [("GI Score",f"{gi:.1f}"),("Projected RBIs",f"{float(player.get('projected_rbis',0) or 0):.1f}"),("1+ RBI",f"{float(player.get('one_plus_rbi_probability',0) or 0):.0f}%")]
    if cat == "walks":
        return [("GI Score",f"{gi:.1f}"),("Projected Walks",f"{float(player.get('projected_walks',0) or 0):.1f}"),("1+ Walk",f"{float(player.get('one_plus_walk_probability',0) or 0):.0f}%")]
    if "stolen" in cat:
        return [("GI Score",f"{gi:.1f}"),("Projected SB",f"{float(player.get('projected_stolen_bases',0) or 0):.2f}"),("1+ SB",f"{float(player.get('one_plus_stolen_base_probability',0) or 0):.0f}%")]
    return [("GI Score",f"{gi:.1f}"),("Projected Hits",f"{float(player.get('projected_hits',0) or 0):.1f}"),("1+ Hit",f"{float(player.get('one_plus_hit_probability',0) or 0):.0f}%")]

def _evidence(player, statcast):
    season = player.get("season_stats",{}) or {}
    recent = player.get("recent_stats",{}) or {}
    cat = str(player.get("category") or "").lower()
    rows = []
    pitcher = str(player.get("opposing_probable_pitcher") or "").strip()
    hand = str(player.get("opposing_pitcher_hand") or "").upper()
    platoon = player.get("platoon_matchup",{}) or {}
    hs = platoon.get("hitter_split",{}) or {}
    if hs.get("plate_appearances"):
        rows.append(
            f"Handedness split: {int(hs.get('home_runs') or 0)} HR in {int(hs.get('plate_appearances') or 0)} PA "
            f"vs {('RHP' if hand=='R' else 'LHP' if hand=='L' else 'this handedness')}, "
            f"{_number(hs.get('slg'))} SLG and {_number(hs.get('ops'))} OPS."
        )
    bvp = player.get("batter_vs_pitcher") or player.get("bvp") or {}
    if isinstance(bvp, dict) and int(bvp.get("plate_appearances") or bvp.get("pa") or 0) >= 3:
        pa = int(bvp.get("plate_appearances") or bvp.get("pa") or 0)
        hits = int(bvp.get("hits") or 0)
        hrs = int(bvp.get("home_runs") or bvp.get("hr") or 0)
        rows.append(f"Batter vs pitcher: {hits} hits, {hrs} HR in {pa} PA" + (f" vs {pitcher}." if pitcher else "."))
    if "home run" in cat:
        rows += [
            f"Season power: {int(season.get('home_runs') or 0)} HR in {int(season.get('plate_appearances') or 0)} PA.",
            f"Recent power: {int(recent.get('home_runs') or 0)} HR in {int(recent.get('plate_appearances') or 0)} recent PA.",
        ]
    else:
        rows += [
            f"Season contact: {_number(season.get('avg'))} AVG.",
            f"Recent contact: {_number(recent.get('avg'))} AVG."
        ]
    if statcast:
        rows.append(
            f"Contact quality: {_number(statcast.get('average_exit_velocity'),1)} mph average exit velocity, "
            f"{_percent(statcast.get('barrel_rate'))} barrels and {_percent(statcast.get('hard_hit_rate'))} hard-hit rate."
        )
        rows.append(
            f"Expected results: {_number(statcast.get('xba'))} xBA, {_number(statcast.get('xslg'))} xSLG and {_number(statcast.get('xwoba'))} xwOBA."
        )
    weather = player.get("weather",{}) or {}
    if weather.get("success"):
        temp = weather.get("temperature_f")
        wind = weather.get("wind_speed_mph")
        if temp is not None:
            rows.append(f"Game environment: {float(temp):.0f}°F with {float(wind or 0):.0f} mph wind.")
    park_factor = float(player.get("park_factor",1.0) or 1.0)
    if abs(park_factor-1.0) >= .03:
        rows.append(f"Park factor: {park_factor:.2f} for today's venue.")
    return rows

def render_player_card(player_data: dict) -> None:
    st.markdown("""
    <style>
    .gi-intel-matchup-line{color:#d7d8db;font-size:.88rem;margin:2px 0 8px}
    .gi-intel-matchup-line b{color:#f6c84c}
    .gi-intel-grid{display:grid;gap:7px;grid-template-columns:repeat(3,minmax(0,1fr));margin:7px 0 10px}
    .gi-intel-metric{background:#101112;border:2px solid #3a3d42;border-radius:10px;padding:8px;min-width:0}
    .gi-intel-metric span{display:block;color:#a7abb2;font-size:.72rem;line-height:1.15}
    .gi-intel-metric strong{display:block;color:#fff;font-size:1rem;margin-top:3px;white-space:nowrap}
    .gi-evidence-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:5px 0 8px}
    .gi-evidence-grid>div{background:#101112;border:2px solid #34373c;border-radius:10px;padding:8px}
    div[data-testid="stExpander"]{background:#080909!important;border:2px solid #3a3d42!important;border-radius:11px!important;overflow:hidden!important}
    div[data-testid="stExpander"] details,div[data-testid="stExpander"] summary{background:#080909!important;color:#fff!important}
    div[data-testid="stExpander"] summary svg{color:#19d978!important}
    @media(max-width:700px){
      .gi-intel-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
      .gi-intel-metric{padding:7px 6px}
      .gi-intel-metric span{font-size:.62rem}
      .gi-intel-metric strong{font-size:.92rem}
      .gi-evidence-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    </style>
    """, unsafe_allow_html=True)

    pitcher = str(player_data.get("opposing_probable_pitcher") or "Not announced")
    hand = str(player_data.get("opposing_pitcher_hand") or "").upper()
    st.markdown(
        f"<div class='gi-intel-matchup-line'><b>Opposing pitcher:</b> {escape(pitcher)}"
        + (f" · {escape(hand)}HP" if hand else "") + "</div>",
        unsafe_allow_html=True
    )

    st.markdown("<div class='gi-intel-grid'>" + "".join(_metric(a,b) for a,b in _summary(player_data)) + "</div>", unsafe_allow_html=True)

    player_id = int(player_data.get("player_id") or 0)
    statcast = None
    if player_id:
        try:
            statcast = get_statcast_batter(player_id, load_statcast_batter_metrics(minimum_pa=10))
        except Exception:
            statcast = None

    season = player_data.get("season_stats",{}) or {}
    recent = player_data.get("recent_stats",{}) or {}

    with st.expander("Performance Evidence", expanded=False):
        cat = str(player_data.get("category") or "").lower()
        if "home run" in cat:
            sline = f"{season.get('home_runs',0)} HR · {_number(season.get('slg'))} SLG"
            rline = f"{recent.get('home_runs',0)} HR · {_number(recent.get('slg'))} SLG"
        else:
            sline = f"{_number(season.get('avg'))} AVG"
            rline = f"{_number(recent.get('avg'))} AVG"
        st.markdown(
            f"<div class='gi-evidence-grid'><div><b>Season</b><br>{escape(sline)}<br><small>{season.get('plate_appearances',0)} PA</small></div>"
            f"<div><b>Recent pregame</b><br>{escape(rline)}<br><small>{recent.get('plate_appearances',0)} PA</small></div></div>",
            unsafe_allow_html=True
        )

    with st.expander("Statcast Contact Quality", expanded=False):
        if statcast:
            values = [
                ("Avg Exit Velocity",f"{_number(statcast.get('average_exit_velocity'),1)} mph"),
                ("Barrel Rate",_percent(statcast.get("barrel_rate"))),
                ("Hard-Hit Rate",_percent(statcast.get("hard_hit_rate"))),
                ("xBA",_number(statcast.get("xba"))),
                ("xSLG",_number(statcast.get("xslg"))),
                ("xwOBA",_number(statcast.get("xwoba"))),
            ]
            st.markdown("<div class='gi-evidence-grid'>" + "".join(_metric(a,b) for a,b in values) + "</div>", unsafe_allow_html=True)
        else:
            st.caption("Statcast contact-quality data is currently unavailable.")

    with st.expander("Why This Player Ranks Here", expanded=False):
        for row in _evidence(player_data, statcast):
            st.write(f"• {row}")

    risk_flags = [
        str(x) for x in (player_data.get("risk_flags",[]) or [])
        if "lineup" not in str(x).lower()  # lineup is already shown on the main card
    ]
    if risk_flags:
        with st.expander("Things to Watch", expanded=False):
            for flag in risk_flags:
                st.write(f"• {flag}")
