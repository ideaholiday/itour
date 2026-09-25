// Where a booking came from (migration 062, ADR 034). Every source takes its
// seats from the same native inventory; the source decides only who sold it,
// who holds the money and whether commission applies.

// The supplier's own customers, booked in the supplier extranet. The supplier
// collects the money; IdeaHoliday takes no commission and never refunds them.
export const DIRECT_SOURCES = Object.freeze(["WALK_IN", "PHONE", "MANUAL"]);
export const BOOKING_SOURCES = Object.freeze(["B2C", "IH_B2B", "API", ...DIRECT_SOURCES]);

export function sourceGroup(source) {
  const value = String(source || "B2C").toUpperCase();
  if (DIRECT_SOURCES.includes(value)) return "SUPPLIER_DIRECT";
  if (value === "API") return "PARTNER_API";
  return "IDEAHOLIDAY";
}

// A supplier-direct booking's money never passes through IdeaHoliday.
export const OFFLINE_PAYMENT_STATUS = "OFFLINE";
export const DIRECT_PAYMENT_MODES = Object.freeze(["CASH", "UPI", "CARD", "BANK"]);

/** True when the trip may be served: paid to IdeaHoliday, or a supplier-direct booking. */
export function isServiceablePayment(booking) {
  return booking?.payment_status === "PAID" || booking?.payment_status === OFFLINE_PAYMENT_STATUS;
}

export function isSupplierDirect(booking) {
  return booking?.payment_status === OFFLINE_PAYMENT_STATUS;
}
