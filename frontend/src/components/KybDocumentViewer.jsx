import React, { useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";

export const KYB_DOC_LABELS = {
  COMMERCIAL_TRANSPORT_LICENSE: "Commercial Transport License / Permit",
  COMMERCIAL_PERMIT: "Commercial Transport License / Permit",
  GSTIN: "GSTIN Certificate",
  PAN: "PAN Card",
  BANK_CANCELLED_CHEQUE: "Cancelled Cheque / Bank Passbook",
  TOURISM_LICENSE: "Tourism Department Registration",
  OTHER: "Other Document",
};

export const kybDocLabel = (docType) => KYB_DOC_LABELS[docType] || String(docType || "Document").replaceAll("_", " ");

/**
 * Shows a private KYB file. The file route needs the viewer's sign-in token,
 * so it is fetched here and shown from a local blob instead of a plain link.
 */
export default function KybDocumentViewer({ fileUrl, title, onClose }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    setFile(null);
    setError("");
    authenticatedFetch(fileUrl)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Could not open the document");
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setFile({ url: objectUrl, isPdf: blob.type === "application/pdf" });
      })
      .catch((err) => !cancelled && setError(err.message || "Could not open the document"));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl]);

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-w-3xl w-full bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close document"
          className="absolute top-4 right-4 p-2 bg-stone-100 text-stone-600 hover:text-stone-900 border border-stone-200 rounded-xl"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-base font-serif font-bold text-stone-900 flex items-center gap-2 pr-12">
          <FileText className="w-5 h-5 text-amber-600" /> {title}
        </h3>
        <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl overflow-hidden h-[70vh] flex items-center justify-center">
          {error ? (
            <p className="text-sm text-rose-700 px-6 text-center">{error}</p>
          ) : !file ? (
            <Loader2 className="w-6 h-6 animate-spin text-stone-400" aria-label="Loading document" />
          ) : file.isPdf ? (
            <iframe src={file.url} title={title} className="w-full h-full bg-white" />
          ) : (
            <img src={file.url} alt={title} className="max-h-full max-w-full object-contain" />
          )}
        </div>
        {file && (
          <a href={file.url} target="_blank" rel="noreferrer" className="inline-block text-xs font-bold text-amber-800 underline">
            Open in a new tab
          </a>
        )}
      </div>
    </div>
  );
}
