import db from "../db.js";
import crypto from "crypto";

export class ExportService {
  /**
   * Convert an array of objects to CSV string
   */
  static objectsToCsv(rows) {
    if (!rows || rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const escapeVal = (v) => {
      if (v === null || v === undefined) return '""';
      const str = String(v).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headerLine = headers.map(escapeVal).join(",");
    const bodyLines = rows.map((row) =>
      headers.map((h) => escapeVal(row[h])).join(",")
    );

    return [headerLine, ...bodyLines].join("\n");
  }

  /**
   * Export Bookings dataset
   */
  static getBookingsData({ supplierId, fromDate, toDate, status }) {
    let sql = `
      SELECT 
        b.id, b.ref, b.product_type, b.activity_date, b.pickup_time,
        b.pickup_location, b.drop_location, b.traveler_name, b.traveler_phone,
        b.traveler_email, b.amount_inr, b.commission_amount, b.supplier_payout_amount,
        b.payment_status, b.status as booking_status, b.created_at,
        p.title as product_title, s.company_name as supplier_name
      FROM bookings b
      LEFT JOIN products p ON p.id = b.product_id
      LEFT JOIN suppliers s ON s.id = b.supplier_id
      WHERE 1=1
    `;
    const params = [];

    if (supplierId) {
      sql += " AND b.supplier_id = ?";
      params.push(supplierId);
    }
    if (fromDate) {
      sql += " AND b.activity_date >= ?";
      params.push(fromDate);
    }
    if (toDate) {
      sql += " AND b.activity_date <= ?";
      params.push(toDate);
    }
    if (status) {
      sql += " AND b.status = ?";
      params.push(status);
    }

    sql += " ORDER BY b.created_at DESC";
    return db.prepare(sql).all(...params);
  }

  /**
   * Export Products dataset
   */
  static getProductsData({ supplierId }) {
    let sql = `
      SELECT 
        p.id, p.product_code, p.product_type, p.title, p.city, p.state,
        p.category, p.duration_hours, p.price_inr, p.rating, p.review_count,
        p.status, p.is_published, p.created_at,
        s.company_name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE 1=1
    `;
    const params = [];

    if (supplierId) {
      sql += " AND p.supplier_id = ?";
      params.push(supplierId);
    }

    sql += " ORDER BY p.created_at DESC";
    return db.prepare(sql).all(...params);
  }

  /**
   * Export Payouts dataset
   */
  static getPayoutsData({ supplierId }) {
    let sql = `
      SELECT 
        py.id, py.booking_id, py.gross_amount, py.commission_amount,
        py.net_payout, py.payout_status, py.processed_at, py.created_at,
        b.ref as booking_ref, s.company_name as supplier_name
      FROM payouts py
      LEFT JOIN bookings b ON b.id = py.booking_id
      LEFT JOIN suppliers s ON s.id = py.supplier_id
      WHERE 1=1
    `;
    const params = [];

    if (supplierId) {
      sql += " AND py.supplier_id = ?";
      params.push(supplierId);
    }

    sql += " ORDER BY py.created_at DESC";
    return db.prepare(sql).all(...params);
  }

  /**
   * Create an export job
   */
  static createExportJob({ userId, exportType, format = "csv", filters = {} }) {
    const id = `exp_${crypto.randomBytes(8).toString("hex")}`;
    let rows = [];

    if (exportType === "bookings") {
      rows = this.getBookingsData(filters);
    } else if (exportType === "products") {
      rows = this.getProductsData(filters);
    } else if (exportType === "payouts") {
      rows = this.getPayoutsData(filters);
    }

    const content = format === "csv" ? this.objectsToCsv(rows) : JSON.stringify(rows, null, 2);

    db.prepare(`
      INSERT INTO export_jobs (
        id, requested_by, export_type, format, filters,
        status, row_count, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, datetime('now'), datetime('now'))
    `).run(id, userId || null, exportType, format, JSON.stringify(filters), rows.length);

    return {
      jobId: id,
      exportType,
      format,
      rowCount: rows.length,
      status: "COMPLETED",
      content,
    };
  }
}

export default ExportService;
