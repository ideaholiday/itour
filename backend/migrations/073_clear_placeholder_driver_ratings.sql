-- Drivers added from the fleet screen were saved with a made-up 4.9 rating
-- (POST /api/suppliers/:id/drivers), after migration 025 had cleared such
-- ratings. A driver's rating comes only from published reviews that rated them
-- (reviewService.recalculateQualityScores); NULL means "no review yet".
UPDATE supplier_drivers SET rating = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM reviews r WHERE r.supplier_driver_id = supplier_drivers.id
    AND r.driver_rating IS NOT NULL AND r.status = 'PUBLISHED'
);

-- @down
-- Nothing to restore: the cleared values were placeholders, not ratings.
SELECT 1;
