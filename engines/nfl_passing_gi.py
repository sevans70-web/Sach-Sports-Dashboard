"""NFL Passing Yards Game Intelligence foundation."""

import pandas as pd


def build_passing_yards_gi(candidate: dict) -> dict:
    """Create transparent GI reasons for one ranked Passing Yards candidate."""

    result = dict(candidate)
    reasons = []
    warnings = []

    if not bool(result.get("passing_prop_eligible")):
        result["gi_reasons"] = []
        result["gi_warnings"] = ["Player is not currently prop eligible"]
        result["gi_summary"] = "Not eligible for Passing Yards ranking"
        return result

    projection = result.get("passing_yards_projection_eligible")
    line = result.get("prop_line")
    edge = result.get("projection_edge_yards")
    probability = result.get("model_probability")
    matchup = result.get("passing_matchup_label")
    availability = result.get("availability_label")
    blend = result.get("season_blend_status")
    lean = result.get("lean")

    if projection is not None and not pd.isna(projection) and line is not None:
        reasons.append(
            f"Model projects {float(projection):.1f} yards vs {float(line):.1f} line"
        )

    if edge is not None and not pd.isna(edge):
        direction = "above" if float(edge) > 0 else "below"
        reasons.append(
            f"Projection sits {abs(float(edge)):.1f} yards {direction} the market line"
        )

    if matchup and matchup != "Unknown":
        reasons.append(f"Passing matchup: {matchup}")

    if probability is not None and not pd.isna(probability):
        reasons.append(f"Model probability: {float(probability):.1f}%")

    if blend:
        reasons.append(f"Data blend: {blend}")

    if availability == "Monitor":
        warnings.append("Injury/availability status requires monitoring")

    if result.get("projection_data_status") in {
        "Needs current-season data",
        "Insufficient historical data",
    }:
        warnings.append(str(result.get("projection_data_status")))

    if result.get("passing_data_status") == "Limited baseline":
        warnings.append("Limited prior-season passing baseline")

    result["gi_reasons"] = reasons
    result["gi_warnings"] = warnings

    if lean in {"OVER LEAN", "UNDER LEAN"}:
        result["gi_summary"] = (
            f"{lean.replace(' LEAN','').title()} case supported by "
            f"{len(reasons)} model signals"
        )
    else:
        result["gi_summary"] = "No strong Passing Yards edge identified"

    return result


def add_passing_yards_gi(candidates) -> pd.DataFrame:
    """Attach GI explanations to a ranked Passing Yards slate."""

    if isinstance(candidates, pd.DataFrame):
        records = candidates.to_dict("records")
    else:
        records = list(candidates)

    if not records:
        return pd.DataFrame()

    return pd.DataFrame(
        [build_passing_yards_gi(record) for record in records]
    )
