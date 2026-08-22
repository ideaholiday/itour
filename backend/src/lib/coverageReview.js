export const COVERAGE_REVIEW_ACTIONS = new Set(["APPROVED", "REJECTED", "SUSPENDED"]);

export function normalizeCoverageReview(action, note = "") {
  const status = String(action || "").trim().toUpperCase();
  const reviewNote = String(note || "").trim();
  if (!COVERAGE_REVIEW_ACTIONS.has(status)) return { error: "Choose APPROVED, REJECTED, or SUSPENDED" };
  if (status !== "APPROVED" && reviewNote.length < 5) return { error: "Add a short reason when rejecting or suspending coverage" };
  return { value: { status, isActive: status === "APPROVED" ? 1 : 0, reviewNote: reviewNote || "Coverage boundary reviewed and approved." } };
}
