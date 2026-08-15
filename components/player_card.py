from html import escape

import streamlit as st

from data.mlb_statcast import (
    get_statcast_batter,
    load_statcast_batter_metrics,
)


def _number(value: object, digits: int = 3) -> str:
    """Format a decimal statistic or return an unavailable marker."""
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return "—"


def _percent(value: object, digits: int = 1) -> str:
    """Format a percentage statistic or return an unavailable marker."""
    try:
        return f"{float(value):.{digits}f}%"
    except (TypeError, ValueError):
        return "—"


def _rate(numerator: object, denominator: object) -> float:
    """Return a safe percentage rate."""
    try:
        denominator_value = float(denominator)
        if denominator_value <= 0:
            return 0.0
        return (float(numerator) / denominator_value) * 100.0
    except (TypeError, ValueError):
        return 0.0


def _compact_metric(label: str, value: str) -> str:
    """Return one compact metric tile for the responsive intelligence grid."""
    return (
        "<div class='gi-intel-metric'>"
        f"<span>{escape(label)}</span>"
        f"<strong>{escape(value)}</strong>"
        "</div>"
    )


def _ranking_evidence(
    player_data: dict,
    season: dict,
    recent: dict,
    statcast: dict | None,
) -> list[str]:
    """Build player-specific explanations containing the supporting numbers."""
    category = str(player_data.get("category") or "").lower()
    evidence: list[str] = []

    season_pa = int(season.get("plate_appearances", 0) or 0)
    recent_pa = int(recent.get("plate_appearances", 0) or 0)

    if "home run" in category:
        season_hr = int(season.get("home_runs", 0) or 0)
        recent_hr = int(recent.get("home_runs", 0) or 0)
        evidence.append(
            f"Season power: {season_hr} HR in {season_pa} PA "
            f"({_rate(season_hr, season_pa):.1f}% of plate appearances)."
        )
        evidence.append(
            f"Recent power: {recent_hr} HR in {recent_pa} recent PA."
        )
    elif "total base" in category:
        evidence.append(
            "Season production: "
            f"{float(season.get('total_bases_per_game', 0) or 0):.2f} "
            "total bases per game with a "
            f"{_number(season.get('slg'))} SLG."
        )
        evidence.append(
            "Recent production: "
            f"{float(recent.get('total_bases_per_game', 0) or 0):.2f} "
            "total bases per game with a "
            f"{_number(recent.get('slg'))} SLG."
        )
    else:
        evidence.append(
            "Season contact: "
            f"{_number(season.get('avg'))} AVG and "
            f"{float(season.get('hits_per_game', 0) or 0):.2f} hits per game."
        )
        evidence.append(
            "Recent contact: "
            f"{_number(recent.get('avg'))} AVG and "
            f"{float(recent.get('hits_per_game', 0) or 0):.2f} hits per game."
        )

    if statcast:
        evidence.append(
            "Contact quality: "
            f"{_number(statcast.get('average_exit_velocity'), 1)} mph "
            "average exit velocity, "
            f"{_percent(statcast.get('barrel_rate'))} barrels and "
            f"{_percent(statcast.get('hard_hit_rate'))} hard-hit rate."
        )
        evidence.append(
            "Expected results: "
            f"{_number(statcast.get('xba'))} xBA, "
            f"{_number(statcast.get('xslg'))} xSLG and "
            f"{_number(statcast.get('xwoba'))} xwOBA."
        )

    return evidence


def render_player_card(player_data: dict) -> None:
    """Render detailed information for one ranked MLB player."""

    st.markdown(
        """
        <style>
        .gi-intel-grid {
            display: grid;
            gap: 10px;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            margin: 8px 0 14px;
        }
        .gi-intel-metric {
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(56, 189, 248, 0.24);
            border-radius: 12px;
            min-width: 0;
            padding: 10px 12px;
        }
        .gi-intel-metric span {
            color: #94a3b8;
            display: block;
            font-size: 0.72rem;
            line-height: 1.2;
        }
        .gi-intel-metric strong {
            color: #f8fafc;
            display: block;
            font-size: 1.18rem;
            line-height: 1.15;
            margin-top: 4px;
        }
        .gi-evidence-grid {
            display: grid;
            gap: 10px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            margin: 6px 0 14px;
        }
        .gi-evidence-grid > div {
            background: rgba(15, 23, 42, 0.42);
            border-radius: 10px;
            color: #cbd5e1;
            font-size: 0.78rem;
            line-height: 1.45;
            padding: 9px 10px;
        }
        .gi-evidence-grid small {
            color: #94a3b8;
        }
        @media (max-width: 600px) {
            .gi-intel-grid {
                gap: 7px;
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .gi-intel-summary .gi-intel-metric:first-child {
                grid-column: span 2;
            }
            .gi-intel-metric {
                border-radius: 10px;
                padding: 8px 9px;
            }
            .gi-intel-metric span {
                font-size: 0.64rem;
            }
            .gi-intel-metric strong {
                font-size: 1rem;
            }
            .gi-evidence-grid {
                gap: 7px;
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .gi-evidence-grid > div {
                font-size: 0.7rem;
                padding: 8px;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    player_name = str(
        player_data.get("player_name", "Unknown Player")
    )
    team = str(player_data.get("team_abbreviation", ""))
    opponent = str(
        player_data.get("opponent_abbreviation", "")
    )

    gi_score = float(
        player_data.get("gi_score", 0.0) or 0.0
    )

    batting_order = player_data.get("batting_order")
    lineup_confirmed = bool(
        player_data.get("lineup_confirmed")
    )

    pitcher = str(
        player_data.get(
            "opposing_probable_pitcher",
            "Not announced",
        )
    )

    why = player_data.get("why", []) or []
    risk_flags = player_data.get("risk_flags", []) or []

    season = player_data.get("season_stats", {}) or {}
    recent = player_data.get("recent_stats", {}) or {}

    player_id = int(player_data.get("player_id") or 0)
    statcast = None
    if player_id:
        snapshot = load_statcast_batter_metrics(minimum_pa=10)
        statcast = get_statcast_batter(player_id, snapshot)

    st.markdown(f"### {player_name}")

    st.caption(f"{team} vs {opponent}")

    hr_probability = float(
        player_data.get("home_run_probability", 0) or 0
    )
    projected_hits = float(player_data.get("projected_hits", 0) or 0)
    st.markdown(
        "<div class='gi-intel-grid gi-intel-summary'>"
        + _compact_metric("GI Score", f"{gi_score:.1f}")
        + _compact_metric("HR Probability", f"{hr_probability:.0f}%")
        + _compact_metric("Projected Hits", f"{projected_hits:.1f}")
        + "</div>",
        unsafe_allow_html=True,
    )

    if lineup_confirmed and batting_order:
        st.write(
            f"**Lineup:** Confirmed — batting #{batting_order}"
        )
    else:
        st.write("**Lineup:** Not yet confirmed")

    st.write(f"**Opposing Pitcher:** {pitcher}")

    st.markdown("**Performance evidence**")
    st.markdown(
        "<div class='gi-evidence-grid'>"
        "<div><b>Season</b><br>"
        f"{season.get('home_runs', 0)} HR • {_number(season.get('avg'))} AVG • "
        f"{_number(season.get('slg'))} SLG<br>"
        f"<small>{season.get('plate_appearances', 0)} plate appearances</small></div>"
        "<div><b>Recent</b><br>"
        f"{recent.get('home_runs', 0)} HR • {_number(recent.get('avg'))} AVG • "
        f"{_number(recent.get('slg'))} SLG<br>"
        f"<small>{recent.get('plate_appearances', 0)} recent plate appearances</small></div>"
        "</div>",
        unsafe_allow_html=True,
    )

    if statcast:
        st.markdown("**Statcast contact quality**")
        st.markdown(
            "<div class='gi-intel-grid'>"
            + _compact_metric(
                "Avg Exit Velocity",
                f"{_number(statcast.get('average_exit_velocity'), 1)} mph",
            )
            + _compact_metric("Barrel Rate", _percent(statcast.get("barrel_rate")))
            + _compact_metric("Hard-Hit Rate", _percent(statcast.get("hard_hit_rate")))
            + _compact_metric("xBA", _number(statcast.get("xba")))
            + _compact_metric("xSLG", _number(statcast.get("xslg")))
            + _compact_metric("xwOBA", _number(statcast.get("xwoba")))
            + "</div>",
            unsafe_allow_html=True,
        )

        warning = str(statcast.get("sample_warning") or "")
        if warning:
            st.warning(warning)
    else:
        st.caption("Statcast contact-quality data is currently unavailable.")

    st.markdown("**Why this player ranks here**")
    for reason in _ranking_evidence(
        player_data,
        season,
        recent,
        statcast,
    ):
        st.write(f"• {reason}")

    if risk_flags:
        st.markdown("**Things to watch**")
        for flag in risk_flags:
            st.write(f"• {flag}")
