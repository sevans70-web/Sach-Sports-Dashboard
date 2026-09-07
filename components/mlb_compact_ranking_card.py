"""One shared compact ranking-card shell for MLB batter and pitcher cards."""

from __future__ import annotations

from html import escape
from typing import Any

import streamlit as st


def _avatar_url(player_id: Any, size: int = 180) -> str:
    try:
        pid = int(player_id or 0)
    except (TypeError, ValueError):
        pid = 0
    if not pid:
        return ""
    return (
        "https://img.mlbstatic.com/mlb-photos/image/upload/"
        f"c_thumb,g_face,w_{size},h_{size},b_rgb:30343a,q_auto:best/"
        "d_people:generic:headshot:67:current.png/"
        f"v1/people/{pid}/headshot/67/current"
    )


def _initials(name: str) -> str:
    bits = [part for part in str(name or "").split() if part]
    if not bits:
        return "MLB"
    if len(bits) == 1:
        return bits[0][:2].upper()
    return f"{bits[0][0]}{bits[-1][0]}".upper()


def avatar_html(player_id: Any, name: str) -> str:
    url = _avatar_url(player_id)
    initials = escape(_initials(name))
    if not url:
        return f'<span class="mlb-rank-avatar-fallback">{initials}</span>'
    return (
        f'<img class="mlb-rank-avatar-img" src="{escape(url)}" '
        f'alt="{escape(name)} headshot" loading="lazy" '
        'referrerpolicy="no-referrer" '
        'onerror="this.style.display=\'none\';'
        'this.nextElementSibling.style.display=\'grid\';">'
        f'<span class="mlb-rank-avatar-fallback" style="display:none">{initials}</span>'
    )


def build_compact_card_html(
    *,
    rank: int,
    movement_label: str,
    player_id: Any,
    name: str,
    score: float,
    matchup_html: str,
    secondary_html: str,
    projection_html: str,
    reason_html: str,
    status_html: str,
    result_html: str,
) -> str:
    """Build identical six-slot markup for batter and pitcher cards.

    The content can differ, but every visual anchor occupies the exact same row.
    That makes batter and pitcher cards overlay-identical.
    """
    movement = str(movement_label or "—").strip() or "—"
    movement_class = " mlb-rank-movement-active" if movement != "—" else ""

    return f"""
    <div class="mlb-rank-card">
        <div class="mlb-rank-number">
            <strong>#{int(rank)}</strong>
            <small class="mlb-rank-movement{movement_class}">{escape(movement)}</small>
        </div>

        <div class="mlb-rank-avatar">
            {avatar_html(player_id, name)}
        </div>

        <div class="mlb-rank-copy">
            <strong class="mlb-rank-name">{escape(name)}</strong>
            <div class="mlb-rank-slot mlb-rank-slot-matchup">{matchup_html or '&nbsp;'}</div>
            <div class="mlb-rank-slot mlb-rank-slot-secondary">{secondary_html or '&nbsp;'}</div>
            <div class="mlb-rank-slot mlb-rank-slot-projection">{projection_html or '&nbsp;'}</div>
            <div class="mlb-rank-slot mlb-rank-slot-reason">{reason_html or '&nbsp;'}</div>
            <div class="mlb-rank-slot mlb-rank-slot-status">{status_html or '&nbsp;'}</div>
            <div class="mlb-rank-slot mlb-rank-slot-result">{result_html or '&nbsp;'}</div>
        </div>

        <div class="mlb-rank-score">
            <small>GI SCORE</small>
            <strong>{float(score or 0):.1f}</strong>
        </div>
    </div>
    """


def render_compact_card_css() -> None:
    st.markdown(
        """
        <style>
        /* =========================================================
           FINAL MLB OVERLAY CONTRACT
           Batter and pitcher share this exact shell + row grid.
           ========================================================= */

        div[class*="st-key-show_"][class*="_player_"] [data-testid="stVerticalBlockBorderWrapper"],
        div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlockBorderWrapper"]{
            padding:9px 9px 8px!important;
            border-radius:15px!important;
            box-sizing:border-box!important;
            min-height:274px!important;
            background:#0d0f10!important;
        }
        div[class*="st-key-show_"][class*="_player_"] [data-testid="stVerticalBlockBorderWrapper"]{
            border-left:4px solid #19d978!important;
        }
        div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlockBorderWrapper"]{
            border-left:4px solid #d6b35c!important;
        }

        div[class*="st-key-show_"][class*="_player_"] .stButton>button,
        div[class*="st-key-pitcher_card_"] .stButton>button{
            width:100%!important;
            min-height:38px!important;
            height:38px!important;
            margin:4px 0 0!important;
            padding:0 10px!important;
            border-radius:9px!important;
            box-sizing:border-box!important;
            font-family:inherit!important;
            font-size:.72rem!important;
            font-weight:700!important;
            line-height:1!important;
        }

        .mlb-rank-card{
            display:grid!important;
            grid-template-columns:36px 72px minmax(0,1fr) 48px!important;
            gap:8px!important;
            align-items:start!important;
            width:100%!important;
            height:216px!important;
            min-height:216px!important;
            max-height:216px!important;
            margin:0!important;
            padding:5px 1px 2px!important;
            box-sizing:border-box!important;
            overflow:hidden!important;
            color:#fff!important;
            font-family:inherit!important;
        }

        .mlb-rank-number{
            padding-top:3px!important;
            text-align:center!important;
            line-height:1!important;
        }
        .mlb-rank-number>strong{
            display:block!important;
            color:#fff!important;
            font-size:.88rem!important;
            font-weight:900!important;
            line-height:1!important;
        }
        .mlb-rank-movement{
            display:block!important;
            min-height:13px!important;
            margin-top:6px!important;
            color:#888e96!important;
            font-size:.58rem!important;
            font-weight:900!important;
            line-height:1.05!important;
            white-space:nowrap!important;
            opacity:1!important;
            visibility:visible!important;
        }
        .mlb-rank-movement-active{color:#19d978!important;}

        .mlb-rank-avatar{
            position:relative!important;
            display:block!important;
            width:72px!important;height:72px!important;
            min-width:72px!important;min-height:72px!important;
            max-width:72px!important;max-height:72px!important;
            margin:0!important;padding:0!important;
            border-radius:50%!important;
            overflow:hidden!important;
            box-sizing:border-box!important;
            border:2px solid #bca147!important;
            background:#30343a!important;
            align-self:start!important;
        }
        .mlb-rank-avatar-img{
            position:absolute!important;
            inset:0!important;
            width:100%!important;height:100%!important;
            max-width:none!important;
            margin:0!important;padding:0!important;border:0!important;
            border-radius:50%!important;
            object-fit:cover!important;
            object-position:center!important;
            background:#30343a!important;
            transform:none!important;
            filter:none!important;
        }
        .mlb-rank-avatar-fallback{
            width:100%!important;height:100%!important;
            place-items:center!important;
            color:#fff!important;background:#30343a!important;
            font-size:.85rem!important;font-weight:900!important;
        }

        .mlb-rank-copy{
            display:grid!important;
            grid-template-rows:18px 18px 18px 18px 36px 24px 20px!important;
            row-gap:3px!important;
            min-width:0!important;
            width:100%!important;
            height:100%!important;
            overflow:hidden!important;
            align-content:start!important;
            font-family:inherit!important;
        }
        .mlb-rank-name{
            display:block!important;
            min-width:0!important;
            height:18px!important;
            overflow:hidden!important;
            text-overflow:ellipsis!important;
            white-space:nowrap!important;
            color:#fff!important;
            font-size:.88rem!important;
            font-weight:900!important;
            line-height:18px!important;
            letter-spacing:0!important;
        }

        .mlb-rank-slot{
            display:block!important;
            min-width:0!important;
            width:100%!important;
            overflow:hidden!important;
            box-sizing:border-box!important;
            color:#b8bbc1!important;
            font-family:inherit!important;
            font-size:.70rem!important;
            font-weight:400!important;
            line-height:18px!important;
        }
        .mlb-rank-slot b{
            color:#e4e6e8!important;
            font-weight:800!important;
        }
        .mlb-rank-slot-matchup,
        .mlb-rank-slot-secondary,
        .mlb-rank-slot-projection{
            height:18px!important;
            white-space:nowrap!important;
            text-overflow:ellipsis!important;
        }
        .mlb-rank-slot-reason{
            height:36px!important;
            line-height:17px!important;
            white-space:normal!important;
            display:-webkit-box!important;
            -webkit-box-orient:vertical!important;
            -webkit-line-clamp:2!important;
            overflow:hidden!important;
        }
        .mlb-rank-slot-status{
            display:flex!important;
            align-items:center!important;
            height:24px!important;
            overflow:visible!important;
        }
        .mlb-rank-slot-result{
            height:20px!important;
            line-height:20px!important;
            margin-top:0!important;
            overflow:visible!important;
            color:#fff!important;
            font-size:.74rem!important;
            font-weight:850!important;
            white-space:nowrap!important;
        }

        /* Every state bubble uses ONE geometry, regardless of role. */
        .mlb-rank-slot-status .gi-lineup-status,
        .mlb-rank-slot-status .gi-game-live,
        .mlb-rank-slot-status .gi-game-final,
        .mlb-rank-slot-status .gi-lineup-confirmed,
        .mlb-rank-slot-status .gi-lineup-projected,
        .mlb-rank-slot-status .gi-lineup-unconfirmed,
        .mlb-rank-slot-status .pitch-game-live,
        .mlb-rank-slot-status .pitch-game-final,
        .mlb-rank-slot-status .pitch-lineup-confirmed,
        .mlb-rank-slot-status .pitch-lineup-projected,
        .mlb-rank-slot-status .pitch-lineup-unavailable{
            display:inline-flex!important;
            align-items:center!important;
            justify-content:center!important;
            width:auto!important;
            min-width:0!important;
            height:20px!important;
            min-height:20px!important;
            max-height:20px!important;
            margin:0!important;
            padding:1px 7px 0!important;
            border-radius:999px!important;
            box-sizing:border-box!important;
            font-family:inherit!important;
            font-size:.61rem!important;
            font-style:normal!important;
            font-weight:800!important;
            line-height:18px!important;
            letter-spacing:0!important;
            text-transform:none!important;
            white-space:nowrap!important;
            overflow:visible!important;
            position:static!important;
            transform:none!important;
        }

        .mlb-rank-slot-status .gi-game-final,
        .mlb-rank-slot-status .pitch-game-final{
            color:#f6c84c!important;
            border:1px solid #bca147!important;
            background:rgba(188,161,71,.10)!important;
        }
        .mlb-rank-slot-status .gi-game-live,
        .mlb-rank-slot-status .pitch-game-live{
            color:#19d978!important;
            border:1px solid #19d978!important;
            background:rgba(25,217,120,.08)!important;
        }
        .mlb-rank-slot-status .gi-lineup-confirmed,
        .mlb-rank-slot-status .pitch-lineup-confirmed{
            color:#b8f4d1!important;
            border:1px solid #19d978!important;
            background:rgba(25,217,120,.08)!important;
        }
        .mlb-rank-slot-status .gi-lineup-projected,
        .mlb-rank-slot-status .pitch-lineup-projected,
        .mlb-rank-slot-status .gi-lineup-unconfirmed,
        .mlb-rank-slot-status .pitch-lineup-unavailable{
            color:#c6c9ce!important;
            border:1px solid #5c626b!important;
            background:rgba(92,98,107,.08)!important;
        }

        /* Old result helpers are normalized inside the shared result slot. */
        .mlb-rank-slot-result .gi-card-result,
        .mlb-rank-slot-result .mlb-rank-result,
        .mlb-rank-slot-result .pitcher-card-result{
            display:inline!important;
            margin:0!important;
            padding:0!important;
            min-height:0!important;
            height:auto!important;
            max-height:none!important;
            overflow:visible!important;
            color:#fff!important;
            font-family:inherit!important;
            font-size:.74rem!important;
            font-weight:850!important;
            line-height:20px!important;
            white-space:nowrap!important;
        }

        .mlb-rank-score{
            width:48px!important;
            min-width:48px!important;
            padding-top:3px!important;
            text-align:right!important;
            line-height:1!important;
        }
        .mlb-rank-score small{
            display:block!important;
            color:#8f959d!important;
            font-size:.47rem!important;
            font-weight:800!important;
            line-height:1!important;
            white-space:nowrap!important;
        }
        .mlb-rank-score strong{
            display:block!important;
            margin-top:4px!important;
            color:#f6c84c!important;
            font-size:.86rem!important;
            font-weight:900!important;
            line-height:1!important;
        }

        .mlb-rank-card .gi-team-logo,
        .mlb-rank-card .pitcher-team-logo{
            width:14px!important;height:14px!important;
            margin:0 2px!important;
            vertical-align:-3px!important;
        }

        @media(max-width:700px){
            div[class*="st-key-show_"][class*="_player_"] [data-testid="stVerticalBlockBorderWrapper"],
            div[class*="st-key-pitcher_card_"] [data-testid="stVerticalBlockBorderWrapper"]{
                padding:8px 7px 7px!important;
                min-height:266px!important;
            }
            .mlb-rank-card{
                grid-template-columns:32px 58px minmax(0,1fr) 45px!important;
                gap:7px!important;
                height:210px!important;
                min-height:210px!important;
                max-height:210px!important;
            }
            .mlb-rank-avatar{
                width:58px!important;height:58px!important;
                min-width:58px!important;min-height:58px!important;
                max-width:58px!important;max-height:58px!important;
            }
            .mlb-rank-copy{
                grid-template-rows:18px 17px 17px 17px 34px 23px 19px!important;
                row-gap:2px!important;
            }
            .mlb-rank-name{font-size:.84rem!important;line-height:18px!important}
            .mlb-rank-slot{font-size:.67rem!important;line-height:17px!important}
            .mlb-rank-slot-matchup,.mlb-rank-slot-secondary,.mlb-rank-slot-projection{height:17px!important}
            .mlb-rank-slot-reason{height:34px!important;line-height:16px!important}
            .mlb-rank-slot-status{height:23px!important}
            .mlb-rank-slot-result{height:19px!important;line-height:19px!important;font-size:.72rem!important}
            .mlb-rank-score{width:45px!important;min-width:45px!important}
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
