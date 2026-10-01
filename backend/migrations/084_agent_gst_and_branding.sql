-- Agent bookings: GST on IdeaHoliday's service fee, and the agency's own brand
-- (ADR 055, docs/B2B_AGENTS.md).
--
-- An agent pays the agent price plus 18% GST on IdeaHoliday's service fee,
-- which is the booking's commission less the agent discount. The fee and its
-- GST are frozen on the booking; amount_inr includes the GST, while the
-- commission and the supplier payout are unchanged. A circuit quote and order
-- carry the GST of their lines.
--
-- logo_url is an image the agency uploaded itself (POST /api/uploads); the
-- client's voucher and messages carry the agency's brand instead of ours.

ALTER TABLE travel_agencies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS agent_service_fee_inr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS agent_service_gst_inr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE circuit_quotes ADD COLUMN IF NOT EXISTS agent_service_gst_inr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS agent_service_gst_inr INTEGER NOT NULL DEFAULT 0;

-- @down
ALTER TABLE circuit_orders DROP COLUMN agent_service_gst_inr;
ALTER TABLE circuit_quotes DROP COLUMN agent_service_gst_inr;
ALTER TABLE bookings DROP COLUMN agent_service_gst_inr;
ALTER TABLE bookings DROP COLUMN agent_service_fee_inr;
ALTER TABLE travel_agencies DROP COLUMN logo_url;
