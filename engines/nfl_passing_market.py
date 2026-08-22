"""NFL Passing Yards market-line evaluation layer."""
import math
import pandas as pd
from engines.nfl_qb_starter import apply_qb_starter_eligibility

def estimate_passing_yards_probability(projection, prop_line, volatility=45.0):
    if projection is None or pd.isna(projection):
        return {"over_probability":pd.NA,"under_probability":pd.NA}
    if volatility <= 0:
        raise ValueError("volatility must be greater than zero")
    z=(float(prop_line)-float(projection))/float(volatility)
    cdf=0.5*(1.0+math.erf(z/math.sqrt(2.0)))
    return {"over_probability":round((1-cdf)*100,1),"under_probability":round(cdf*100,1)}

def evaluate_passing_yards_market(player_id, opponent_team, prop_line, roster_season=2026, baseline_season=2025):
    """Compare an eligible QB projection with a real supplied market line."""
    qbs=apply_qb_starter_eligibility(opponent_team,roster_season,baseline_season)
    row=qbs[qbs["player_id"]==player_id]
    if row.empty: return {}
    result=row.iloc[0].to_dict()
    result.update({"prop_line":float(prop_line),"projection_edge_yards":pd.NA,
                   "projection_edge_pct":pd.NA,"lean":"NO PLAY","market_status":"Not eligible"})
    projection=result.get("passing_yards_projection_eligible")
    if not bool(result.get("passing_prop_eligible")): return result
    if projection is None or pd.isna(projection):
        result["market_status"]="Projection unavailable"; return result
    projection=float(projection); line=float(prop_line); edge=projection-line
    result["projection_edge_yards"]=round(edge,1)
    result["projection_edge_pct"]=round(edge/line*100,1) if line>0 else pd.NA
    result["lean"]="PASS" if abs(edge)<5 else ("OVER LEAN" if edge>0 else "UNDER LEAN")
    result["market_status"]="Line evaluated"
    probs=estimate_passing_yards_probability(projection,line)
    result.update(probs)
    vals=[probs["over_probability"],probs["under_probability"]]
    result["model_probability"]=max(vals) if not any(pd.isna(x) for x in vals) else pd.NA
    return result
