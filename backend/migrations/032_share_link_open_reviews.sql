-- Open reviews through a supplier's share link.
--
-- A signed-in traveler who opens a supplier's /r/<slug> link can now leave a
-- review without proving a booking. Those reviews are stored with
-- `source = 'SHARE_LINK'` and no booking behind them, so:
--
--   - they are displayed on the listing, labelled as not tied to a booking;
--   - they are NOT counted in any rating, quality score or dispatch ranking
--     (RATED_REVIEW_SOURCES in reviewService stays VERIFIED + SEED);
--   - one account gets one such review per listing.
--
-- The booking-verified path (booking reference + phone, or a mailed invite)
-- is unchanged and still produces a VERIFIED review.

ALTER TABLE reviews ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS share_link_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_open_user_product ON reviews(user_id, product_id) WHERE booking_id IS NULL;

-- @down
DROP INDEX IF EXISTS idx_reviews_open_user_product;
DELETE FROM review_photos WHERE review_id IN (SELECT id FROM reviews WHERE booking_id IS NULL);
DELETE FROM review_helpfulness WHERE review_id IN (SELECT id FROM reviews WHERE booking_id IS NULL);
DELETE FROM reviews WHERE booking_id IS NULL;
ALTER TABLE reviews DROP COLUMN share_link_id;
-- booking_id stays nullable: re-adding NOT NULL is not portable to SQLite and
-- is harmless to leave once the open reviews above are gone.
