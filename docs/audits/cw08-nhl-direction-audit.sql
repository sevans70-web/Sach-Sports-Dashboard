-- CW08 NHL direction audit (read-only). Run against Supabase public schema.
-- This examines immutable pregame picks, not regenerated current rankings.
-- A mean projection above a 0.5 line can STILL legitimately select UNDER
-- for a discrete goal/assist distribution (e.g. Poisson with mean 0.6
-- has P(0)=exp(-0.6)>0.5). Do not automatically flip those picks.
WITH sample AS (
 SELECT p.market,p.prediction_side,p.game_date,p.sportsbook_line,
        (p.payload->>'modelProjection')::numeric AS projection,
        p.payload->'modelValidation' AS validation,
        p.payload->'modelSelection' AS selection,
        g.result_status
 FROM public.worker_pregame_picks p
 LEFT JOIN public.worker_pregame_grades g
   ON g.sport=p.sport AND g.market=p.market
  AND g.game_id=p.game_id AND g.player_id=p.player_id
 WHERE p.sport='nhl' AND p.market IN ('goals','assists')
   AND p.game_date BETWEEN DATE '2026-11-01' AND DATE '2026-11-13'
)
SELECT market,prediction_side,count(*) AS saved_picks,
       count(*) FILTER (WHERE projection>sportsbook_line) AS mean_above_line,
       count(*) FILTER (WHERE projection=sportsbook_line) AS mean_equal_line,
       count(*) FILTER (WHERE projection<sportsbook_line) AS mean_below_line,
       count(*) FILTER (WHERE result_status='hit') AS graded_hits,
       count(*) FILTER (WHERE result_status='miss') AS graded_misses,
       count(*) FILTER (WHERE result_status IS NULL) AS ungraded
FROM sample GROUP BY market,prediction_side ORDER BY market,prediction_side;

-- Before any algorithm change, compare calibrated P(0), implied vig-free
-- market probability, selected side EV, and held-out hit rates by market.
-- Do not impose a 50/50 OVER/UNDER quota or overwrite original picks.
