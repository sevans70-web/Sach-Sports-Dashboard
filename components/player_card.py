from html import escape
import streamlit as st

from data.mlb_statcast import get_statcast_batter, load_statcast_batter_metrics


@st.cache_data(ttl=1800, show_spinner=False)
def _cached_statcast_snapshot() -> dict:
    """Reuse the season Statcast snapshot across card clicks."""
    return load_statcast_batter_metrics(minimum_pa=10)


def _number(value, digits=3):
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return "—"


def _percent(value, digits=1):
    try:
        return f"{float(value):.{digits}f}%"
    except (TypeError, ValueError):
        return "—"


def _metric(label, value):
    return (
        "<div class='gi-intel-metric'>"
        f"<span>{escape(label)}</span>"
        f"<strong>{escape(value)}</strong>"
        "</div>"
    )


def _summary(player):
    cat = str(player.get("category") or "").lower()
    gi = float(player.get("gi_score", player.get("score", 0)) or 0)

    if "home run" in cat:
        return [
            ("GI Score", f"{gi:.1f}"),
            ("HR Probability", f"{float(player.get('home_run_probability', 0) or 0):.0f}%"),
            ("Prop", "1+ HR"),
        ]
    if "total base" in cat:
        return [
            ("GI Score", f"{gi:.1f}"),
            ("Projected TB", f"{float(player.get('projected_total_bases', 0) or 0):.1f}"),
            ("Over 1.5 TB", f"{float(player.get('over_1_5_total_bases_probability', 0) or 0):.0f}%"),
        ]
    if cat == "runs":
        return [
            ("GI Score", f"{gi:.1f}"),
            ("Projected Runs", f"{float(player.get('projected_runs', 0) or 0):.1f}"),
            ("1+ Run", f"{float(player.get('one_plus_run_probability', 0) or 0):.0f}%"),
        ]
    if cat in {"rbi", "rbis"}:
        return [
            ("GI Score", f"{gi:.1f}"),
            ("Projected RBIs", f"{float(player.get('projected_rbis', 0) or 0):.1f}"),
            ("1+ RBI", f"{float(player.get('one_plus_rbi_probability', 0) or 0):.0f}%"),
        ]
    if cat == "walks":
        return [
            ("GI Score", f"{gi:.1f}"),
            ("Projected Walks", f"{float(player.get('projected_walks', 0) or 0):.1f}"),
            ("1+ Walk", f"{float(player.get('one_plus_walk_probability', 0) or 0):.0f}%"),
        ]
    if "stolen" in cat:
        return [
            ("GI Score", f"{gi:.1f}"),
            ("Projected SB", f"{float(player.get('projected_stolen_bases', 0) or 0):.2f}"),
            ("1+ SB", f"{float(player.get('one_plus_stolen_base_probability', 0) or 0):.0f}%"),
        ]

    return [
        ("GI Score", f"{gi:.1f}"),
        ("Projected Hits", f"{float(player.get('projected_hits', 0) or 0):.1f}"),
        ("1+ Hit", f"{float(player.get('one_plus_hit_probability', 0) or 0):.0f}%"),
    ]


def _evidence(player, statcast):
    """Build evidence that changes with the selected prop market."""
    season = player.get("season_stats", {}) or {}
    recent = player.get("recent_stats", {}) or {}
    cat = str(player.get("category") or "").lower()
    rows = []

    pitcher = str(player.get("opposing_probable_pitcher") or "").strip()
    hand = str(player.get("opposing_pitcher_hand") or "").upper()
    handedness = "RHP" if hand == "R" else "LHP" if hand == "L" else "this pitcher"

    platoon = player.get("platoon_matchup", {}) or {}
    hitter_split = platoon.get("hitter_split", {}) or {}

    bvp = player.get("batter_vs_pitcher") or player.get("bvp") or {}
    if isinstance(bvp, dict):
        pa = int(bvp.get("plate_appearances") or bvp.get("pa") or 0)
        if pa >= 3:
            hits = int(bvp.get("hits") or 0)
            hrs = int(bvp.get("home_runs") or bvp.get("hr") or 0)
            rows.append(
                f"History vs pitcher: {hits} hits and {hrs} HR in {pa} PA"
                + (f" vs {pitcher}." if pitcher else ".")
            )

    split_pa = int(hitter_split.get("plate_appearances") or 0)
    split_hr = int(hitter_split.get("home_runs") or 0)
    split_slg = _number(hitter_split.get("slg"))
    split_ops = _number(hitter_split.get("ops"))

    if "home run" in cat:
        rows.append(
            f"Power profile: {int(season.get('home_runs') or 0)} season HR; "
            f"{int(recent.get('home_runs') or 0)} HR in the recent pregame window."
        )
        if split_pa:
            rows.append(
                f"Vs {handedness}: {split_hr} HR in {split_pa} PA, "
                f"{split_slg} SLG and {split_ops} OPS."
            )
        if statcast:
            rows.append(
                f"HR contact quality: {_percent(statcast.get('barrel_rate'))} barrel rate, "
                f"{_percent(statcast.get('hard_hit_rate'))} hard-hit rate and "
                f"{_number(statcast.get('xslg'))} xSLG."
            )

    elif "total base" in cat:
        rows.append(
            f"Total-base projection: {float(player.get('projected_total_bases', 0) or 0):.1f}; "
            f"{float(player.get('over_1_5_total_bases_probability', 0) or 0):.0f}% over 1.5 TB."
        )
        if split_pa:
            rows.append(
                f"Damage vs {handedness}: {split_slg} SLG and {split_ops} OPS across {split_pa} PA."
            )
        if statcast:
            rows.append(
                f"Extra-base indicators: {_number(statcast.get('xslg'))} xSLG, "
                f"{_percent(statcast.get('barrel_rate'))} barrels and "
                f"{_number(statcast.get('average_exit_velocity'),1)} mph average exit velocity."
            )

    elif cat in {"hit", "hits"}:
        rows.append(
            f"Hit projection: {float(player.get('projected_hits', 0) or 0):.1f}; "
            f"{float(player.get('one_plus_hit_probability', 0) or 0):.0f}% for 1+ hit."
        )
        if split_pa:
            rows.append(
                f"Contact vs {handedness}: {split_ops} OPS in {split_pa} PA."
            )
        if statcast:
            rows.append(
                f"Expected contact: {_number(statcast.get('xba'))} xBA and "
                f"{_percent(statcast.get('hard_hit_rate'))} hard-hit rate."
            )

    elif cat == "runs":
        rows.append(
            f"Run projection: {float(player.get('projected_runs', 0) or 0):.1f}; "
            f"{float(player.get('one_plus_run_probability', 0) or 0):.0f}% for 1+ run."
        )
        order = player.get("batting_order") or player.get("projected_batting_order")
        if order:
            rows.append(f"Lineup opportunity: batting #{int(order)} creates expected scoring chances.")
        rows.append("Runs are driven by on-base opportunity, lineup position and the game run environment.")

    elif cat in {"rbi", "rbis"}:
        rows.append(
            f"RBI projection: {float(player.get('projected_rbis', 0) or 0):.1f}; "
            f"{float(player.get('one_plus_rbi_probability', 0) or 0):.0f}% for 1+ RBI."
        )
        order = player.get("batting_order") or player.get("projected_batting_order")
        if order:
            rows.append(f"Run-producing slot: batting #{int(order)} shapes RBI opportunity.")
        if statcast:
            rows.append(
                f"Damage support: {_number(statcast.get('xslg'))} xSLG and "
                f"{_percent(statcast.get('hard_hit_rate'))} hard-hit rate."
            )

    elif cat == "walks":
        rows.append(
            f"Walk projection: {float(player.get('projected_walks', 0) or 0):.1f}; "
            f"{float(player.get('one_plus_walk_probability', 0) or 0):.0f}% for 1+ walk."
        )
        rows.append(
            f"Matchup focus: plate-discipline opportunity against {pitcher or 'the opposing pitcher'}"
            + (f" ({handedness})." if hand else ".")
        )

    elif "stolen" in cat:
        rows.append(
            f"Steal projection: {float(player.get('projected_stolen_bases', 0) or 0):.2f}; "
            f"{float(player.get('one_plus_stolen_base_probability', 0) or 0):.0f}% for 1+ SB."
        )
        rows.append("Stolen-base value depends on speed plus getting on base often enough to create attempts.")
        order = player.get("batting_order") or player.get("projected_batting_order")
        if order:
            rows.append(f"Batting #{int(order)} affects expected times on base and running opportunities.")

    elif "hits + runs + rbis" in cat or "hits runs rbis" in cat:
        rows.append(
            f"Combined projection: {float(player.get('projected_hits_runs_rbis', 0) or 0):.1f} H+R+RBI; "
            f"{float(player.get('over_1_5_hits_runs_rbis_probability', 0) or 0):.0f}% over 1.5."
        )
        rows.append("This market has multiple paths: contact, scoring and run production all contribute.")

    else:
        rows.append("Live matchup and season data are being evaluated for this market.")

    weather = player.get("weather", {}) or {}
    if weather.get("success") and weather.get("temperature_f") is not None:
        rows.append(
            f"Environment: {float(weather.get('temperature_f')):.0f}°F with "
            f"{float(weather.get('wind_speed_mph') or 0):.0f} mph wind."
        )

    park_factor = float(player.get("park_factor", 1.0) or 1.0)
    if abs(park_factor - 1.0) >= .03:
        rows.append(f"Park factor: {park_factor:.2f} for today's venue.")

    return rows


def render_player_card(player_data: dict) -> None:
    st.markdown(
        """
        <style>
        .gi-intel-matchup-line {
            color:#d7d8db;
            font-size:.88rem;
            margin:2px 0 7px;
        }
        .gi-intel-matchup-line b {
            color:#f6c84c;
        }

        .gi-intel-summary-grid {
            display:grid;
            grid-template-columns:repeat(3,minmax(0,1fr));
            gap:6px;
            margin:6px 0 9px;
        }

        .gi-intel-metric {
            background:#101112;
            border:2px solid #3a3d42;
            border-radius:10px;
            padding:7px 8px;
            min-width:0;
        }

        .gi-intel-metric span {
            display:block;
            color:#a7abb2;
            font-size:.68rem;
            line-height:1.15;
        }

        .gi-intel-metric strong {
            display:block;
            color:#fff;
            font-size:.98rem;
            line-height:1.08;
            margin-top:3px;
            white-space:nowrap;
        }

        .gi-evidence-grid {
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:7px;
            margin:5px 0 6px;
        }

        .gi-evidence-grid > div {
            background:#101112;
            border:2px solid #3a3d42;
            border-radius:10px;
            padding:8px;
            min-width:0;
        }

        .gi-statcast-grid {
            display:grid;
            grid-template-columns:repeat(3,minmax(0,1fr));
            gap:6px;
            margin:5px 0 6px;
        }

        .gi-statcast-grid .gi-intel-metric {
            padding:7px 6px;
        }

        div[data-testid="stExpander"] {
            background:#080909!important;
            border:2px solid #3a3d42!important;
            border-radius:11px!important;
            overflow:hidden!important;
        }

        div[data-testid="stExpander"] details,
        div[data-testid="stExpander"] summary,
        div[data-testid="stExpander"] summary:hover {
            background:#080909!important;
            color:#fff!important;
        }

        div[data-testid="stExpander"] summary svg {
            color:#19d978!important;
        }

        /* Keep inner evidence/statcast cards visibly separated from the outer expander border. */
        div[data-testid="stExpander"] [data-testid="stExpanderDetails"] {
            padding:8px 14px 18px!important;
        }

        div[data-testid="stExpander"] [data-testid="stExpanderDetails"] > div {
            padding-bottom:2px!important;
        }

        @media(max-width:700px) {
            .gi-intel-summary-grid {
                grid-template-columns:repeat(3,minmax(0,1fr));
            }

            .gi-intel-summary-grid .gi-intel-metric span,
            .gi-statcast-grid .gi-intel-metric span {
                font-size:.58rem;
            }

            .gi-intel-summary-grid .gi-intel-metric strong,
            .gi-statcast-grid .gi-intel-metric strong {
                font-size:.84rem;
            }

            .gi-evidence-grid {
                grid-template-columns:repeat(2,minmax(0,1fr));
            }

            div.gi-statcast-grid {
                display:grid !important;
                grid-template-columns:repeat(3,minmax(0,1fr)) !important;
                gap:5px !important;
            }
            div.gi-statcast-grid .gi-intel-metric {
                min-width:0 !important;
                padding:6px 4px !important;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


    st.markdown(
        "<div class='gi-intel-summary-grid'>"
        + "".join(
            _metric(label, value)
            for label, value in _summary(player_data)
        )
        + "</div>",
        unsafe_allow_html=True,
    )

    player_id = int(player_data.get("player_id") or 0)
    statcast = None

    if player_id:
        try:
            statcast = get_statcast_batter(
                player_id,
                _cached_statcast_snapshot(),
            )
        except Exception:
            statcast = None

    season = player_data.get("season_stats", {}) or {}
    recent = player_data.get("recent_stats", {}) or {}

    with st.expander("Market Performance Evidence", expanded=False):
        cat = str(player_data.get("category") or "").lower()

        if "home run" in cat:
            sline = f"{season.get('home_runs', 0)} HR · {_number(season.get('slg'))} SLG"
            rline = f"{recent.get('home_runs', 0)} HR · {_number(recent.get('slg'))} SLG"
        elif "total base" in cat:
            sline = f"{_number(season.get('slg'))} SLG · {season.get('home_runs', 0)} HR"
            rline = f"{_number(recent.get('slg'))} SLG · {recent.get('home_runs', 0)} HR"
        elif cat in {"rbi", "rbis"}:
            sline = f"{season.get('rbis', season.get('rbi', '—'))} RBI"
            rline = f"{recent.get('rbis', recent.get('rbi', '—'))} RBI"
        elif cat == "runs":
            sline = f"{season.get('runs', '—')} Runs"
            rline = f"{recent.get('runs', '—')} Runs"
        elif cat == "walks":
            sline = f"{season.get('walks', season.get('bb', '—'))} Walks"
            rline = f"{recent.get('walks', recent.get('bb', '—'))} Walks"
        elif "stolen" in cat:
            sline = f"{season.get('stolen_bases', season.get('sb', '—'))} SB"
            rline = f"{recent.get('stolen_bases', recent.get('sb', '—'))} SB"
        else:
            sline = f"{_number(season.get('avg'))} AVG"
            rline = f"{_number(recent.get('avg'))} AVG"

        st.markdown(
            "<div class='gi-evidence-grid'>"
            f"<div><b>Season</b><br>{escape(str(sline))}<br>"
            f"<small>{season.get('plate_appearances', 0)} PA</small></div>"
            f"<div><b>Recent pregame</b><br>{escape(str(rline))}<br>"
            f"<small>{recent.get('plate_appearances', 0)} PA</small></div>"
            "</div>",
            unsafe_allow_html=True,
        )
        st.markdown(
            "<div class='gi-expander-bottom-space'></div>",
            unsafe_allow_html=True,
        )

    with st.expander("Statcast Contact Quality", expanded=False):
        if statcast:
            values = [
                (
                    "Avg Exit Velocity",
                    f"{_number(statcast.get('average_exit_velocity'), 1)} mph",
                ),
                ("Barrel Rate", _percent(statcast.get("barrel_rate"))),
                ("Hard-Hit Rate", _percent(statcast.get("hard_hit_rate"))),
                ("xBA", _number(statcast.get("xba"))),
                ("xSLG", _number(statcast.get("xslg"))),
                ("xwOBA", _number(statcast.get("xwoba"))),
            ]

            st.markdown(
                "<div class='gi-statcast-grid'>"
                + "".join(_metric(label, value) for label, value in values)
                + "</div>",
                unsafe_allow_html=True,
            )
            st.markdown(
                "<div class='gi-expander-bottom-space'></div>",
                unsafe_allow_html=True,
            )
        else:
            st.caption(
                "Statcast contact-quality data is currently unavailable."
            )

    with st.expander("Why This Player Ranks Here", expanded=False):
        for row in _evidence(player_data, statcast):
            st.write(f"• {row}")

    risk_flags = [
        str(item)
        for item in (player_data.get("risk_flags", []) or [])
        if "lineup" not in str(item).lower()
    ]

    if risk_flags:
        with st.expander("Things to Watch", expanded=False):
            for flag in risk_flags:
                st.write(f"• {flag}")


st.markdown(
    """
    <style>
    .gi-intel-summary-grid,.gi-evidence-grid,.gi-statcast-grid{margin:1px 0 3px!important;gap:5px!important}
    .gi-expander-bottom-space{display:block!important;height:12px!important;min-height:12px!important;width:100%!important}
    div.gi-statcast-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important}
    div[data-testid="stExpander"]{margin:.18rem 0!important}
    div[data-testid="stExpander"] summary{min-height:33px!important;padding:.18rem .42rem!important}
    div[data-testid="stExpander"] [data-testid="stExpanderDetails"]{padding:.05rem .42rem .28rem!important}
    </style>
    """,
    unsafe_allow_html=True,
)


st.markdown(
    """
    <style>
    /* Expanded batter intelligence: same green/gold visual language as player detail. */
    .gi-intel-summary-grid .gi-intel-metric:nth-child(odd),
    .gi-statcast-grid .gi-intel-metric:nth-child(odd){
        border-left:3px solid #19d978!important;
        border-bottom-color:rgba(25,217,120,.58)!important;
    }
    .gi-intel-summary-grid .gi-intel-metric:nth-child(even),
    .gi-statcast-grid .gi-intel-metric:nth-child(even){
        border-left:3px solid #d6b35c!important;
        border-bottom-color:rgba(214,179,92,.65)!important;
    }

    .gi-evidence-grid>div:first-child{
        border-left:3px solid #d6b35c!important;
        border-bottom-color:rgba(214,179,92,.65)!important;
        background:linear-gradient(135deg,#101112 0%,rgba(214,179,92,.055) 100%)!important;
    }
    .gi-evidence-grid>div:last-child{
        border-left:3px solid #19d978!important;
        border-bottom-color:rgba(25,217,120,.58)!important;
        background:linear-gradient(135deg,#101112 0%,rgba(25,217,120,.05) 100%)!important;
    }

    div[data-testid="stExpander"]{
        border-color:#3a3d42!important;
    }
    div[data-testid="stExpander"]:has(.gi-evidence-grid){
        border-left:2px solid #d6b35c!important;
    }
    div[data-testid="stExpander"]:has(.gi-statcast-grid){
        border-left:2px solid #19d978!important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)
