"""NFL team logo helpers."""

ESPN_TEAM_CODES = {
    "ARI":"ari","ATL":"atl","BAL":"bal","BUF":"buf","CAR":"car","CHI":"chi",
    "CIN":"cin","CLE":"cle","DAL":"dal","DEN":"den","DET":"det","GB":"gb",
    "HOU":"hou","IND":"ind","JAX":"jax","JAC":"jax","KC":"kc","LV":"lv",
    "LAC":"lac","LAR":"lar","LA":"lar","MIA":"mia","MIN":"min","NE":"ne","NO":"no",
    "NYG":"nyg","NYJ":"nyj","PHI":"phi","PIT":"pit","SEA":"sea","SF":"sf",
    "TB":"tb","TEN":"ten","WAS":"wsh","WSH":"wsh",
}


def nfl_team_logo_url(team: str) -> str:
    code = ESPN_TEAM_CODES.get(str(team or "").upper())
    if not code:
        return ""
    return f"https://a.espncdn.com/i/teamlogos/nfl/500/{code}.png"
