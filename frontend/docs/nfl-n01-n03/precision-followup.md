# Production walkthrough follow-up: exact fractional lines

The first grouped release493ce834 passed36/36 live loads across12markets (204rows across three rounds),with zero wrong-market rows,duplicate targets or incomplete verified quotes. Median237ms,max3846ms. Passing interceptions now returns2QB rows (Jordan Love andBryce Young),both genuine Pinnacle0.5lines and current-season historical baseline0.8;no fitted interception probability is invented. Browser verifies the newInterceptions tab andboth rows,16receptions rows,and defensive tabs.13official finals/2243explicit stat comparisons match.

Browser inspection then found a real remainingN03display defect:the exact DraftKings sack threshold0.25 forLukas Van Ness(quote draftkings-382675197) appeared as0.3 because numeric projection formatting was also applied to sportsbook lines. Do not closeN03before this follow-up deploys.

A shared propLineText formatter now renders finite numeric sportsbook thresholds exactly,including0.25,0.75,1.25,negative quarter lines and genuine zero. Missing/non-numeric evidence remains a dash. Shared primary ranking cards,full player cards,progress denominators,remaining-to-line values,line movement and context quote thresholds reuse it. Projection/average formatting remains separate. All8sports use these shared paths;no quote or model value is rewritten.

439tests+production build pass. Tests cover exact thresholds and a half-sack actual being0.25above a0.25line. Original runtime snapshot SHA256b45c4ce8 unchanged. Final production/browser checks and tracker closure are recorded after deployment. No live game is currently underway in the sampled slate;live transition handling is tested against fixtures and the archived official finals,not claimed as a newly observed live transition.
