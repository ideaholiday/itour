import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

// KYB files (PAN cards, permits, cheques) are identity documents. They are
// kept outside the public /uploads folder and only ever sent through routes
// that check the viewer is an admin or the supplier who uploaded them.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_UPLOADS_DIR = path.resolve(__dirname, "../../uploads");
export const KYB_FILES_DIR = process.env.KYB_FILES_DIR
  ? path.resolve(process.env.KYB_FILES_DIR)
  : path.resolve(__dirname, "../../private-uploads/kyb");

// Stored in kyb_documents.doc_url. Not a web address, so nothing can link to it.
export const KYB_FILE_SCHEME = "kyb-file://";

const MIME_EXTENSIONS = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const EXTENSION_MIMES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

export function kybMimeType(requestedMime) {
  const mime = String(requestedMime || "").toLowerCase();
  if (mime.includes("png")) return "image/png";
  if (mime.includes("webp")) return "image/webp";
  if (mime.includes("jpg") || mime.includes("jpeg")) return "image/jpeg";
  if (mime.includes("pdf")) return "application/pdf";
  return null;
}

// The extension comes from the checked type, never the uploaded file name.
export function saveKybFile(buffer, mimeType) {
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw Object.assign(new Error("KYB documents must be a PDF, PNG, JPG or WEBP file"), { status: 400 });
  fs.mkdirSync(KYB_FILES_DIR, { recursive: true });
  const filename = `kyb_${Date.now()}_${crypto.randomBytes(12).toString("hex")}${extension}`;
  fs.writeFileSync(path.join(KYB_FILES_DIR, filename), buffer, { mode: 0o600 });
  return { filename, url: `${KYB_FILE_SCHEME}${filename}` };
}

function safeBasename(name) {
  const base = path.basename(String(name || ""));
  return base && base === name && !base.startsWith(".") ? base : null;
}

// The filename a stored document reference points at, for either a private
// KYB file or one uploaded to the public folder before files were moved.
export function kybFileName(docUrl) {
  const url = String(docUrl || "");
  if (url.startsWith(KYB_FILE_SCHEME)) return safeBasename(url.slice(KYB_FILE_SCHEME.length));
  const legacy = url.match(/^\/(?:api\/uploads\/files|uploads)\/([^/?#]+)$/);
  return legacy ? safeBasename(legacy[1]) : null;
}

// Absolute path of the document's file on disk, or null when there is no real
// file behind it (a placeholder link, or a file that has gone missing).
export function resolveKybFilePath(docUrl) {
  const url = String(docUrl || "");
  const filename = kybFileName(url);
  if (!filename) return null;
  const directory = url.startsWith(KYB_FILE_SCHEME) ? KYB_FILES_DIR : PUBLIC_UPLOADS_DIR;
  const absolute = path.join(directory, filename);
  return fs.existsSync(absolute) ? absolute : null;
}

export function hasKybFile(doc) {
  return Boolean(resolveKybFilePath(doc?.doc_url));
}

export function sendKybDocumentFile(res, doc) {
  const absolute = doc ? resolveKybFilePath(doc.doc_url) : null;
  if (!absolute) return res.status(404).json({ error: "No file has been uploaded for this document" });
  res.set({
    "Content-Type": EXTENSION_MIMES[path.extname(absolute).toLowerCase()] || "application/octet-stream",
    "Content-Disposition": `inline; filename="${String(doc.doc_type || "document").replace(/[^A-Za-z0-9_-]/g, "")}${path.extname(absolute)}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  return res.sendFile(absolute);
}

// Files uploaded as KYB before they were moved out of /uploads must no longer
// be reachable through the public static folder.
export function blockPublicKybUploads(database) {
  return (req, res, next) => {
    let filename;
    try {
      filename = safeBasename(decodeURIComponent(req.path.replace(/^\//, "")));
    } catch {
      return res.status(400).json({ error: "Invalid file path" });
    }
    if (!filename) return next();
    const isKyb = database.prepare(`
      SELECT 1 FROM uploads WHERE filename = ? AND UPPER(COALESCE(entity_type, '')) = 'KYB'
      UNION ALL
      SELECT 1 FROM kyb_documents WHERE doc_url = ? OR doc_url = ?
      LIMIT 1
    `).get(filename, `/uploads/${filename}`, `/api/uploads/files/${filename}`);
    if (isKyb) return res.status(404).json({ error: "Not found" });
    return next();
  };
}
