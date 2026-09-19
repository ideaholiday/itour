import { createClient } from "@supabase/supabase-js";

// Where uploaded files live. Cloud Run's disk is wiped on every deploy, so
// production keeps files in Supabase Storage (ADR 021). Local development and
// CI keep writing to disk unless MEDIA_STORAGE=supabase is set explicitly, so a
// developer's SUPABASE_URL never sends test files to the production buckets.

export const PUBLIC_MEDIA_BUCKET = "supplier-media";
export const KYB_BUCKET = "kyb-documents";

export function mediaStorageEnabled(env = process.env) {
  return String(env.MEDIA_STORAGE || "").toLowerCase() === "supabase";
}

if (mediaStorageEnabled() && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error("MEDIA_STORAGE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
}

let client = null;
function storage() {
  // The service-role key bypasses storage policies; the buckets have none, so
  // only this backend can write to them.
  client ||= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.storage;
}

export async function putObject(bucket, objectPath, buffer, contentType) {
  const { error } = await storage().from(bucket).upload(objectPath, buffer, { contentType, upsert: false });
  if (error) throw Object.assign(new Error(`Storage upload failed: ${error.message}`), { status: 502 });
}

export async function getObject(bucket, objectPath) {
  const { data, error } = await storage().from(bucket).download(objectPath);
  if (error) return null;
  return Buffer.from(await data.arrayBuffer());
}

export function publicObjectUrl(objectPath) {
  return storage().from(PUBLIC_MEDIA_BUCKET).getPublicUrl(objectPath).data.publicUrl;
}
