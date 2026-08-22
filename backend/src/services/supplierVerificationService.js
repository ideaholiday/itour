const ALLOWED_ACTIONS = new Set(["APPROVED", "REJECTED", "SUSPENDED"]);

export const UPDATE_SUPPLIER_VERIFICATION_SQL = `
  UPDATE suppliers
  SET kyb_status = ?,
      is_verified = ?,
      commission_rate = ?,
      commission_override_rate = COALESCE(?, commission_override_rate)
  WHERE id = ?
`;

function verificationError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function saveSupplierVerification(database, {
  supplierId,
  action: requestedAction,
  reason: requestedReason,
  commissionRate,
}) {
  const action = String(requestedAction || "").trim().toUpperCase();
  const reason = String(requestedReason || "").trim();

  if (!ALLOWED_ACTIONS.has(action)) {
    throw verificationError("Action must be APPROVED, REJECTED, or SUSPENDED");
  }
  if (action === "REJECTED" && reason.length < 5) {
    throw verificationError("A specific rejection reason is required");
  }

  const supplier = database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw verificationError("Supplier not found", 404);

  const hasCommissionOverride = commissionRate !== undefined
    && commissionRate !== null
    && String(commissionRate).trim() !== "";
  const resolvedCommission = hasCommissionOverride
    ? Number(commissionRate)
    : Number(supplier.commission_rate ?? 15);

  if (!Number.isFinite(resolvedCommission) || resolvedCommission < 0 || resolvedCommission > 50) {
    throw verificationError("Commission rate must be between 0% and 50%");
  }

  const persistVerification = database.transaction(() => {
    database.prepare(UPDATE_SUPPLIER_VERIFICATION_SQL).run(
      action,
      action === "APPROVED" ? 1 : 0,
      resolvedCommission,
      hasCommissionOverride ? resolvedCommission : null,
      supplierId,
    );

    database.prepare(`
      UPDATE kyb_documents
      SET status = ?, rejection_reason = ?, verified_at = datetime('now')
      WHERE supplier_id = ?
    `).run(
      action === "APPROVED" ? "APPROVED" : "REJECTED",
      action === "APPROVED" ? null : reason || null,
      supplierId,
    );
  });

  persistVerification();

  return {
    supplier: database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId),
    action,
    reason,
    commissionRate: resolvedCommission,
  };
}
