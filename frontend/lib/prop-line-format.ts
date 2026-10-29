/** A sportsbook threshold is executable evidence, not a rounded projection.
 * Preserve quarter/fractional lines exactly as stored, across all sports. */
export function propLineText(value:unknown){
 return typeof value==='number'&&Number.isFinite(value)?String(value):'—';
}
