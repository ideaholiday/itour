import assert from "node:assert/strict";
import { test } from "node:test";
import { hotelRequestEmail } from "../src/services/tripService.js";

// The booking request a hotel receives (ADR 045).
test("a hotel booking request names the guest, dates, rooms, meals, guests and who to reply to", () => {
  const { subject, text } = hotelRequestEmail({
    quotation: { ref: "Q-ABC123", customerName: "Kavya Rao", adults: 3, children: 1 },
    line: { date: "2026-11-04", nights: 2, rooms: 2, roomType: "Deluxe", mealPlan: "MAP", extraAdults: 1 },
    hotel: { name: "Pink City Inn" },
    supplier: { company_name: "Demo Tours", contact_name: "Ravi", phone: "+919800000000", email: "ops@demo.example" },
  });
  assert.equal(subject, "Booking request Q-ABC123: Kavya Rao, 2026-11-04 to 2026-11-06");
  for (const expected of [
    "Dear Pink City Inn reservations,", "Guest: Kavya Rao", "Check-in: Wed, 4 Nov, 2026", "Check-out: Fri, 6 Nov, 2026 (2 nights)",
    "Rooms: 2 × Deluxe, breakfast and dinner", "Guests: 3 adults, 1 child (1 extra adult bed)", "Our reference: Q-ABC123",
    "Please reply with your confirmation number.", "Demo Tours", "Ravi · +919800000000 · ops@demo.example",
  ]) assert.ok(text.includes(expected), `missing: ${expected}\n${text}`);
});
