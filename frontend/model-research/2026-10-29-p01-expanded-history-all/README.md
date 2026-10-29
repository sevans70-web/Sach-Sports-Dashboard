# P01: expanded saved-ranking historical check

Sources: current saved NBA performance response plus preserved original audit and the separate Oct28 frozen cohort. Exact pregame lines, quoted side, probability and timestamps are required. Select earliest valid original per market/game/player without outcome filtering. Official final payloads are hash-verified; exact fixture time and explicit player stat required. Explicit DNPs and missing stats are excluded with reasons; never turned into zero-stat UNDER wins. Current response is partial, so this is available saved history, not a full archive claim.

862 independently verified saved predictions across61 completed fixtures;849 have paired eligible reconstructed inputs,13 are retained as unavailable. Of937 selected originals,61 lack an archived official final,6 are explicit DNPs,8 lack explicit final player stats. Supplemental archives add previously saved records absent from the current partial response. Current response is compressed alongside the audit; original official payloads remain in their two existing immutable archive locations, referenced by the replay script.

Points194 paired targets: original saved96/194 (49.5%), reconstructed runtime94/194 (48.5%), fixed participation candidate102/194 (52.6%). Original UNDER57/127 (44.9%); candidate UNDER41/89 (46.1%). Original UNDER mean confidence70.3%;candidate62.7%. Candidate still overconfident; its >=80% UNDER subset is4/8hits against mean83.2%confidence. Candidate OVER61/105 (58.1%),original39/67 (58.2%).

Earlier50-fixture archive points: candidate77/138 vs saved original73/138 (reconstructed71/138). Additional11fixtures: candidate25/56 vs original23/56. Both archives' outcomes were already inspected while developing candidates; neither comparison is untouched validation. Fixture-cluster 95% paired points hit-rate improvement vs saved original spans -2.73 to+8.72percentage points. No reliable improvement is established.

Only points uses the participation candidate; other markets retain runtime. Overall849 paired targets: original452hits,reconstructed453,candidate461. This aggregate is not a universal accuracy gain: all9 extra hits versus original include3 reconstruction changes outside points. Compare candidate directly with reconstructed baseline for isolated deployment-policy changes.

Reconstructed inputs use archived official observations with48h lag, not exact original historical feature receipts. Candidate fitting population differs from runtime. Original saved probabilities remain separately available. No historical grades, production models, frozen prospective cohorts, prices or hidden-sport settings changed. No exact two-sided ROI or all-sport claim. P01 remains unchecked.

From frontend, reproduce in NEW directories:

```
# decompress source.json.gz to a scratch JSON path first
node scripts/replay-p01-nba-saved-history.mjs /tmp/history.json /tmp/NEW-study
node scripts/replay-p01-nba-points-history.mjs /tmp/NEW-study
node scripts/summarize-p01-nba-history.mjs /tmp/NEW-study
```

Validation: a separate replay reproduced all849 paired model forecasts and all6 market reports exactly. Model/source fingerprints and output hashes retained. No production deployment is necessary for this read-only historical research.
