from html import escape

import streamlit as st

from data.mlb_statcast import (
    get_statcast_batter,
    load_statcast_batter_metrics,
)
from data.mlb_players import get_player_headshot_url


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


def _category_summary_metrics(player_data: dict) -> list[tuple[str, str]]:
    """Return the three summary tiles that belong to the selected prop."""
    category = str(player_data.get("category") or "").strip().lower()
    gi_score = float(player_data.get("gi_score", 0.0) or 0.0)

    if "home run" in category:
        probability = float(
            player_data.get("home_run_probability", 0.0) or 0.0
        )
        return [
            ("GI Score", f"{gi_score:.1f}"),
            ("HR Probability", f"{probability:.0f}%"),
            ("Prop", "1+ Home Run"),
        ]

    if "total base" in category:
        projected = float(
            player_data.get("projected_total_bases", 0.0) or 0.0
        )
        probability = float(
            player_data.get(
                "over_1_5_total_bases_probability",
                0.0,
            )
            or 0.0
        )
        return [
            ("GI Score", f"{gi_score:.1f}"),
            ("Projected TB", f"{projected:.1f}"),
            ("Over 1.5 TB", f"{probability:.0f}%"),
        ]

    if category == "runs":
        projected = float(player_data.get("projected_runs", 0.0) or 0.0)
        probability = float(player_data.get("one_plus_run_probability", 0.0) or 0.0)
        return [("GI Score", f"{gi_score:.1f}"), ("Projected Runs", f"{projected:.1f}"), ("1+ Run", f"{probability:.0f}%")]

    if category in {"rbi", "rbis"}:
        projected = float(player_data.get("projected_rbis", 0.0) or 0.0)
        probability = float(player_data.get("one_plus_rbi_probability", 0.0) or 0.0)
        return [("GI Score", f"{gi_score:.1f}"), ("Projected RBIs", f"{projected:.1f}"), ("1+ RBI", f"{probability:.0f}%")]

    if category == "walks":
        projected = float(player_data.get("projected_walks", 0.0) or 0.0)
        probability = float(player_data.get("one_plus_walk_probability", 0.0) or 0.0)
        return [("GI Score", f"{gi_score:.1f}"), ("Projected Walks", f"{projected:.1f}"), ("1+ Walk", f"{probability:.0f}%")]

    if "stolen" in category:
        projected = float(player_data.get("projected_stolen_bases", 0.0) or 0.0)
        probability = float(player_data.get("one_plus_stolen_base_probability", 0.0) or 0.0)
        return [("GI Score", f"{gi_score:.1f}"), ("Projected SB", f"{projected:.2f}"), ("1+ Stolen Base", f"{probability:.0f}%")]

    projected = float(player_data.get("projected_hits", 0.0) or 0.0)
    probability = float(
        player_data.get("one_plus_hit_probability", 0.0) or 0.0
    )
    return [
        ("GI Score", f"{gi_score:.1f}"),
        ("Projected Hits", f"{projected:.1f}"),
        ("1+ Hit Probability", f"{probability:.0f}%"),
    ]


def _performance_evidence_html(
    player_data: dict,
    season: dict,
    recent: dict,
) -> str:
    """Return category-specific season/recent evidence tiles."""
    category = str(player_data.get("category") or "").strip().lower()

    if "home run" in category:
        season_line = (
            f"{season.get('home_runs', 0)} HR • "
            f"{_number(season.get('slg'))} SLG"
        )
        recent_line = (
            f"{recent.get('home_runs', 0)} HR • "
            f"{_number(recent.get('slg'))} SLG"
        )
    elif "total base" in category:
        season_line = (
            f"{float(season.get('total_bases_per_game', 0) or 0):.2f} TB/G • "
            f"{_number(season.get('slg'))} SLG"
        )
        recent_line = (
            f"{float(recent.get('total_bases_per_game', 0) or 0):.2f} TB/G • "
            f"{_number(recent.get('slg'))} SLG"
        )
    elif category == "runs":
        season_line = f"{season.get('runs', 0)} R • {_number(season.get('obp'))} OBP"
        recent_line = f"{recent.get('runs', 0)} R • {_number(recent.get('obp'))} OBP"
    elif category in {"rbi", "rbis"}:
        season_line = f"{season.get('rbi', 0)} RBI • {_number(season.get('slg'))} SLG"
        recent_line = f"{recent.get('rbi', 0)} RBI • {_number(recent.get('slg'))} SLG"
    elif category == "walks":
        season_line = f"{season.get('walks', 0)} BB • {_number(season.get('obp'))} OBP"
        recent_line = f"{recent.get('walks', 0)} BB • {_number(recent.get('obp'))} OBP"
    elif "stolen" in category:
        season_line = f"{season.get('stolen_bases', 0)} SB • {season.get('caught_stealing', 0)} CS"
        recent_line = f"{recent.get('stolen_bases', 0)} SB • {recent.get('caught_stealing', 0)} CS"
    else:
        season_line = (
            f"{_number(season.get('avg'))} AVG • "
            f"{float(season.get('hits_per_game', 0) or 0):.2f} H/G"
        )
        recent_line = (
            f"{_number(recent.get('avg'))} AVG • "
            f"{float(recent.get('hits_per_game', 0) or 0):.2f} H/G"
        )

    recent_window = str(
        player_data.get("recent_window_label")
        or "Recent pregame window"
    )

    return (
        "<div class='gi-evidence-grid'>"
        "<div><b>Season</b><br>"
        f"{escape(season_line)}<br>"
        f"<small>{season.get('plate_appearances', 0)} plate appearances</small></div>"
        "<div><b>Recent pregame</b><br>"
        f"{escape(recent_line)}<br>"
        f"<small>{recent.get('plate_appearances', 0)} plate appearances · "
        f"{escape(recent_window)}</small></div>"
        "</div>"
    )



def _hr_matchup_evidence(
    player_data: dict,
) -> list[str]:
    """Explain the player-specific hitter/pitcher platoon matchup."""
    matchup = player_data.get("platoon_matchup", {}) or {}

    if not matchup.get("available"):
        return []

    pitcher_name = str(
        player_data.get("opposing_probable_pitcher")
        or "the opposing pitcher"
    )
    pitcher_hand = str(matchup.get("pitcher_hand") or "").upper()
    batter_side = str(matchup.get("effective_bat_side") or "").upper()

    hitter_split = matchup.get("hitter_split", {}) or {}
    pitcher_split = matchup.get("pitcher_split", {}) or {}

    hand_word = {
        "L": "left-handed",
        "R": "right-handed",
    }
    pitcher_hand_text = hand_word.get(
        pitcher_hand,
        f"{pitcher_hand}-handed" if pitcher_hand else "unknown-handed",
    )
    batter_side_text = hand_word.get(
        batter_side,
        f"{batter_side}-handed" if batter_side else "unknown-handed",
    )

    evidence: list[str] = []

    hitter_pa = int(hitter_split.get("plate_appearances") or 0)
    if hitter_pa > 0:
        hitter_hr = int(hitter_split.get("home_runs") or 0)
        hitter_slg = _number(hitter_split.get("slg"))
        hitter_ops = _number(hitter_split.get("ops"))

        evidence.append(
            f"Today's platoon: batting {batter_side_text} against "
            f"{pitcher_hand_text} {pitcher_name}. In {hitter_pa} PA against "
            f"{pitcher_hand_text} pitching this season, the hitter has "
            f"{hitter_hr} HR with a {hitter_slg} SLG and {hitter_ops} OPS."
        )

    pitcher_bf = int(pitcher_split.get("batters_faced") or 0)
    if pitcher_bf > 0:
        pitcher_hr9 = float(
            pitcher_split.get("home_runs_per_nine", 0.0) or 0.0
        )
        pitcher_whip = float(
            pitcher_split.get("whip", 0.0) or 0.0
        )
        pitcher_k_rate = float(
            pitcher_split.get("strikeout_rate", 0.0) or 0.0
        )

        evidence.append(
            f"Pitcher split: {pitcher_name} has faced {pitcher_bf} "
            f"{batter_side_text} batters in this split, allowing "
            f"{pitcher_hr9:.2f} HR/9 with a {pitcher_whip:.2f} WHIP and "
            f"{pitcher_k_rate * 100:.1f}% strikeout rate."
        )

    adjustment = float(
        matchup.get(
            "adjustment",
            player_data.get("platoon_adjustment", 0.0),
        )
        or 0.0
    )

    if adjustment >= 0.75:
        evidence.append(
            f"Matchup impact: the hitter/pitcher split is a favorable "
            f"today-specific signal and adds {adjustment:.2f} to the "
            "platoon matchup adjustment."
        )
    elif adjustment <= -0.75:
        evidence.append(
            f"Matchup impact: the hitter/pitcher split is a tougher "
            f"today-specific signal and applies a {adjustment:.2f} "
            "platoon matchup adjustment."
        )
    else:
        evidence.append(
            "Matchup impact: the handedness splits are close to neutral, "
            "so today's platoon matchup is not a major ranking driver."
        )

    return evidence



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
        evidence.extend(
            _hr_matchup_evidence(player_data)
        )

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

    if category == "runs":
        evidence.append(
            f"Run production: {season.get('runs', 0)} season runs and "
            f"{recent.get('runs', 0)} in the recent pregame window."
        )
    elif category in {"rbi", "rbis"}:
        evidence.append(
            f"RBI production: {season.get('rbi', 0)} season RBIs and "
            f"{recent.get('rbi', 0)} in the recent pregame window."
        )
    elif category == "walks":
        evidence.append(
            f"Plate discipline: {season.get('walks', 0)} season walks with a "
            f"{_number(season.get('obp'))} OBP."
        )
    elif "stolen" in category:
        evidence.append(
            f"Running profile: {season.get('stolen_bases', 0)} SB and "
            f"{season.get('caught_stealing', 0)} CS this season."
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
        .gi-intel-player-header {
            align-items: center;
            display: grid;
            gap: 14px;
            grid-template-columns: 82px minmax(0, 1fr);
            margin: 4px 0 14px;
        }
        .gi-intel-player-photo {
            background: linear-gradient(145deg, #075985, #0f172a);
            border: 1px solid rgba(56, 189, 248, 0.42);
            border-radius: 14px;
            height: 78px;
            overflow: hidden;
            width: 78px;
        }
        .gi-intel-player-photo img {
            height: 100%;
            object-fit: cover;
            object-position: center top;
            width: 100%;
        }
        .gi-intel-player-name {
            color: #f8fafc;
            font-size: 1.18rem;
            font-weight: 800;
            line-height: 1.2;
        }
        .gi-intel-player-team {
            color: #94a3b8;
            font-size: 0.8rem;
            margin-top: 4px;
        }
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
        @media (max-width: 760px) {
            .gi-intel-player-header {
                gap: 10px;
                grid-template-columns: 62px minmax(0, 1fr);
            }
            .gi-intel-player-photo {
                border-radius: 12px;
                height: 58px;
                width: 58px;
            }
            .gi-intel-player-name {
                font-size: 1rem;
            }
            .gi-intel-grid {
                gap: 7px;
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .gi-intel-summary .gi-intel-metric:last-child {
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
    is_home = player_data.get("is_home")

    if is_home is True:
        matchup = f"{opponent} vs. {team}"
    elif is_home is False:
        matchup = f"{team} vs. {opponent}"
    else:
        matchup = f"{team} vs. {opponent}"

    player_id = int(player_data.get("player_id") or 0)
    headshot_url = str(player_data.get("headshot_url") or "").strip()
    if not headshot_url and player_id:
        headshot_url = get_player_headshot_url(player_id)

    if headshot_url:
        st.markdown(
            f"""
            <div class="gi-intel-player-header">
                <div class="gi-intel-player-photo">
                    <img
                        src="{escape(headshot_url)}"
                        alt="{escape(player_name)} headshot"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                    >
                </div>
                <div>
                    <div class="gi-intel-player-name">{escape(player_name)}</div>
                    <div class="gi-intel-player-team">
                        {escape(matchup)}
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
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

    statcast = None
    if player_id:
        snapshot = load_statcast_batter_metrics(minimum_pa=10)
        statcast = get_statcast_batter(player_id, snapshot)

    summary_metrics = _category_summary_metrics(player_data)
    st.markdown(
        "<div class='gi-intel-grid gi-intel-summary'>"
        + "".join(
            _compact_metric(label, value)
            for label, value in summary_metrics
        )
        + "</div>",
        unsafe_allow_html=True,
    )

    game_finished = bool(player_data.get("game_finished"))
    result_live = bool(player_data.get("result_live"))
    if game_finished:
        st.write(
            f"**Game status:** Final — "
            f"{player_data.get('result_label', 'result available')}"
        )
    elif result_live:
        st.write(
            f"**Game status:** LIVE — "
            f"{player_data.get('result_label', 'live result available')}"
        )
    elif lineup_confirmed and batting_order:
        st.write(
            f"**Lineup:** Confirmed — batting #{batting_order}"
        )
    else:
        st.write("**Lineup:** Not yet confirmed")

    st.write(f"**Opposing Pitcher:** {pitcher}")

    st.markdown("**Performance evidence**")
    st.markdown(
        _performance_evidence_html(
            player_data,
            season,
            recent,
        ),
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

    if game_finished:
        risk_flags = [
            flag
            for flag in risk_flags
            if "lineup" not in str(flag).lower()
            and "pitcher" not in str(flag).lower()
        ]

    if risk_flags:
        st.markdown("**Things to watch**")
        for flag in risk_flags:
            st.write(f"• {flag}")
