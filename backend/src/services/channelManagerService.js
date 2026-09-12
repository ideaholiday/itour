import { nanoid } from "nanoid";
import { getChannelAdapter } from "./channels/channelRegistry.js";
import { saveInventoryRules } from "./nativeInventoryService.js";
import logger from "../config/logger.js";

export function listSupplierChannels(db, supplierId) {
  const rows = db.prepare(`
    SELECT id, supplier_id, channel_name, channel_title, endpoint_url, status, last_sync_at, last_sync_status, last_error, created_at, updated_at
    FROM supplier_channel_connections
    WHERE supplier_id = ?
    ORDER BY created_at DESC
  `).all(supplierId);

  return rows;
}

export async function connectSupplierChannel(db, { supplierId, channelName, channelTitle, endpointUrl, credentials }) {
  const adapter = getChannelAdapter(channelName);
  
  // Test connection against remote provider
  const testResult = await adapter.testConnection({ ...credentials, endpointUrl });
  if (!testResult?.success) {
    throw new Error(testResult?.error || "Remote connection failed");
  }

  const existing = db.prepare(`
    SELECT id FROM supplier_channel_connections
    WHERE supplier_id = ? AND channel_name = ?
  `).get(supplierId, channelName.toUpperCase());

  const connectionId = existing ? existing.id : `ch_${nanoid(12)}`;
  const credentialsJson = JSON.stringify(credentials || {});

  db.prepare(`
    INSERT INTO supplier_channel_connections (
      id, supplier_id, channel_name, channel_title, endpoint_url, credentials_json, status, last_sync_status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 'CONNECTED', CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      channel_title = excluded.channel_title,
      endpoint_url = excluded.endpoint_url,
      credentials_json = excluded.credentials_json,
      status = 'ACTIVE',
      last_sync_status = 'CONNECTED',
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    connectionId,
    supplierId,
    channelName.toUpperCase(),
    channelTitle || channelName,
    endpointUrl || null,
    credentialsJson
  );

  return {
    id: connectionId,
    supplierId,
    channelName: channelName.toUpperCase(),
    channelTitle: channelTitle || channelName,
    status: "ACTIVE",
    connectedAt: new Date().toISOString(),
  };
}

export function disconnectSupplierChannel(db, { supplierId, connectionId }) {
  const result = db.prepare(`
    DELETE FROM supplier_channel_connections
    WHERE id = ? AND supplier_id = ?
  `).run(connectionId, supplierId);

  if (result.changes === 0) {
    throw Object.assign(new Error("Channel connection not found"), { status: 404 });
  }
  return { success: true, message: "Channel disconnected" };
}

export async function fetchRemoteChannelProducts(db, { supplierId, connectionId }) {
  const connection = db.prepare(`
    SELECT * FROM supplier_channel_connections
    WHERE id = ? AND supplier_id = ?
  `).get(connectionId, supplierId);

  if (!connection) {
    throw Object.assign(new Error("Channel connection not found"), { status: 404 });
  }

  const credentials = JSON.parse(connection.credentials_json || "{}");
  const adapter = getChannelAdapter(connection.channel_name);

  try {
    const products = await adapter.fetchProducts({
      ...credentials,
      endpointUrl: connection.endpoint_url,
    });

    // Check which products are already imported
    const importedRefs = db.prepare(`
      SELECT external_id, internal_id FROM reservation_external_references
      WHERE supplier_id = ? AND provider = ? AND resource_type = 'PRODUCT'
    `).all(supplierId, connection.channel_name);

    const importedMap = new Map(importedRefs.map((r) => [r.external_id, r.internal_id]));

    return products.map((p) => ({
      ...p,
      isImported: importedMap.has(p.externalId),
      internalProductId: importedMap.get(p.externalId) || null,
      channelName: connection.channel_name,
    }));
  } catch (err) {
    db.prepare(`
      UPDATE supplier_channel_connections
      SET last_error = ?, last_sync_status = 'ERROR', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(err.message, connectionId);
    throw err;
  }
}

export async function importRemoteProducts(db, { supplierId, connectionId, productsToImport }) {
  const connection = db.prepare(`
    SELECT * FROM supplier_channel_connections
    WHERE id = ? AND supplier_id = ?
  `).get(connectionId, supplierId);

  if (!connection) {
    throw Object.assign(new Error("Channel connection not found"), { status: 404 });
  }

  const importedList = [];

  for (const item of productsToImport) {
    const productId = `prod_${nanoid(12)}`;
    const productCode = `${connection.channel_name.slice(0, 3)}-${nanoid(6).toUpperCase()}`;

    db.transaction(() => {
      // 1. Create product record
      db.prepare(`
        INSERT INTO products (
          id, product_code, supplier_id, product_type, group_type, title, city,
          category, short_desc, full_desc, duration_hours, price_inr, hero_image,
          status, is_published, is_instant_booking, cancellation_policy, created_at
        ) VALUES (
          ?, ?, ?, ?, 'PUBLIC', ?, ?,
          ?, ?, ?, ?, ?, ?,
          'DRAFT', 0, 1, 'STANDARD_FREE_24H', CURRENT_TIMESTAMP
        )
      `).run(
        productId,
        productCode,
        supplierId,
        item.productType || "DAY_TOUR",
        item.title,
        item.city || "Goa",
        item.category || "Sightseeing",
        item.shortDesc || item.title,
        item.fullDesc || item.shortDesc || item.title,
        item.durationHours || 4,
        item.priceInr || 1500,
        item.heroImage || "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&auto=format&fit=crop&q=80"
      );

      // 2. Map Product in reservation_external_references
      db.prepare(`
        INSERT INTO reservation_external_references (
          provider, resource_type, internal_id, external_id, supplier_id
        ) VALUES (?, 'PRODUCT', ?, ?, ?)
        ON CONFLICT(provider, supplier_id, resource_type, internal_id) DO NOTHING
      `).run(
        connection.channel_name,
        productId,
        item.externalId,
        supplierId
      );

      // 3. Create options and inventory rules
      const options = item.options && item.options.length > 0
        ? item.options
        : [
            {
              externalId: `${item.externalId}_opt_std`,
              name: "Standard Departure",
              departureTimes: ["09:00", "14:00"],
              capacity: 15,
              adultPrice: item.priceInr || 1500,
              childPrice: Math.round((item.priceInr || 1500) * 0.75),
            },
          ];

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const optionId = `opt_${nanoid(12)}`;

        db.prepare(`
          INSERT INTO product_options (
            id, product_id, name, is_default, confirmation_type, available_start_times, capacity, created_at
          ) VALUES (?, ?, ?, ?, 'INSTANT', ?, ?, CURRENT_TIMESTAMP)
        `).run(
          optionId,
          productId,
          opt.name || "Departure Slot",
          i === 0 ? 1 : 0,
          JSON.stringify(opt.departureTimes || ["09:00"]),
          opt.capacity || 15
        );

        // Map Option in reservation_external_references
        db.prepare(`
          INSERT INTO reservation_external_references (
            provider, resource_type, internal_id, external_id, supplier_id
          ) VALUES (?, 'OPTION', ?, ?, ?)
          ON CONFLICT(provider, supplier_id, resource_type, internal_id) DO NOTHING
        `).run(
          connection.channel_name,
          optionId,
          opt.externalId || `${item.externalId}_opt_${i}`,
          supplierId
        );

        // Save inventory rules
        try {
          saveInventoryRules(db, productId, optionId, {
            operatingDays: [0, 1, 2, 3, 4, 5, 6],
            departureTimes: opt.departureTimes || ["09:00", "14:00"],
            capacity: opt.capacity || 15,
            adultPrice: opt.adultPrice || item.priceInr || 1500,
            childPrice: opt.childPrice || Math.round((opt.adultPrice || item.priceInr || 1500) * 0.75),
            cutoffMinutes: 120,
            cancellationHours: 24,
            blackoutDates: [],
          });
        } catch (ruleErr) {
          logger.warn("Could not save initial rules for imported option", { optionId, error: ruleErr.message });
        }
      }

      importedList.push({
        id: productId,
        title: item.title,
        externalId: item.externalId,
        channelName: connection.channel_name,
        optionsCount: options.length,
      });
    })();
  }

  db.prepare(`
    UPDATE supplier_channel_connections
    SET last_sync_at = CURRENT_TIMESTAMP, last_sync_status = 'SUCCESS', last_error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(connectionId);

  return {
    success: true,
    importedCount: importedList.length,
    products: importedList,
  };
}
