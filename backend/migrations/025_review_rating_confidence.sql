-- Rating confidence and review provenance.
--
-- Two problems, one cause. Listings with no review at all were displayed at
-- `products.rating DEFAULT 4.8` / `review_count DEFAULT 12`, with a further 4.8
-- fallback in the API layer — a rating nobody earned. Strip that out and the
-- opposite failure appears: an unreviewed listing sorts last on every rating
-- sort, which is the pressure that makes fabricated reviews look attractive.
--
-- Both are fixed by smoothing instead of inventing. Every rating is pulled
-- towards a prior mean with the weight of RATING_PRIOR_WEIGHT (= 20) reviews:
--
--   smoothed = (20 * priorMean + SUM(ratings)) / (20 + n)
--
-- A listing with no reviews ranks at its category mean; each real review moves
-- it away from that mean, and by ~20 reviews the prior is half-forgotten. The
-- 20 is a confidence weight used for ranking only — it is never displayed, and
-- never counted as reviews. `average_rating` and `review_count` stay literal:
-- what real travelers actually said. A listing with no reviews shows none.
--
-- `reviews.source` records provenance. Only VERIFIED (a completed booking) and
-- SEED (demo databases only, never production) count towards a rating; later
-- sources such as IMPORTED or PUBLIC are displayed with attribution and are
-- excluded from the average.

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'VERIFIED';
ALTER TABLE quality_scores ADD COLUMN IF NOT EXISTS smoothed_rating REAL;
ALTER TABLE quality_scores ADD COLUMN IF NOT EXISTS verified_review_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_reviews_source_status ON reviews(source, status);

-- Existing scores were all built from verified reviews.
UPDATE quality_scores SET verified_review_count = COALESCE(review_count, 0);

-- Backfill the smoothed rating so ranking is correct before the next review
-- event recalculates a score. The prior is the mean over entities of the same
-- type that actually have reviews, falling back to 4.5 on an empty table.
UPDATE quality_scores
SET smoothed_rating = (
      (20 * COALESCE((
        SELECT AVG(q2.average_rating) FROM quality_scores q2
        WHERE q2.entity_type = quality_scores.entity_type
          AND q2.review_count > 0 AND q2.average_rating IS NOT NULL
      ), 4.5)) + (average_rating * review_count)
    ) / (20 + review_count)
WHERE review_count > 0 AND average_rating IS NOT NULL;

-- Drop ratings nobody earned. A NULL rating means "no verified review yet" and
-- is rendered as a NEW badge; it is not the same as a bad rating.
UPDATE products SET rating = NULL, review_count = 0
WHERE NOT EXISTS (
  SELECT 1 FROM reviews r WHERE r.product_id = products.id AND r.status = 'PUBLISHED'
);

UPDATE suppliers SET rating = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM reviews r WHERE r.supplier_id = suppliers.id AND r.status = 'PUBLISHED'
);

UPDATE supplier_drivers SET rating = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM reviews r WHERE r.supplier_driver_id = supplier_drivers.id
    AND r.driver_rating IS NOT NULL AND r.status = 'PUBLISHED'
);

-- @down
-- The placeholder ratings cleared above are not restored: they were never data.
DROP INDEX IF EXISTS idx_reviews_source_status;
ALTER TABLE quality_scores DROP COLUMN verified_review_count;
ALTER TABLE quality_scores DROP COLUMN smoothed_rating;
ALTER TABLE reviews DROP COLUMN source;
