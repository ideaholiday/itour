import React, { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw, X } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

// A live selfie for an individual owner's KYC (owner decision 2026-09-24). The
// camera is the only source (no gallery), and an on-device MediaPipe face
// detector must see exactly one face, close and centred, before the photo can
// be taken. Nothing leaves the browser except the final photo, which goes to
// the private KYB store for an admin to compare with the PAN and licence.
const MIN_SCORE = 0.7;
const MIN_FACE_WIDTH = 0.25; // of the frame

async function loadDetector() {
  const { FaceDetector } = await import("@mediapipe/tasks-vision");
  return FaceDetector.createFromOptions(
    { wasmLoaderPath: "/mediapipe/vision_wasm_internal.js", wasmBinaryPath: "/mediapipe/vision_wasm_internal.wasm" },
    {
      baseOptions: { modelAssetPath: "/mediapipe/blaze_face_short_range.tflite" },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    }
  );
}

// "ok" when exactly one confident face fills enough of the frame and sits near its centre.
export function faceCheck(detections, frameWidth, frameHeight) {
  const faces = (detections || []).filter((face) => (face.categories?.[0]?.score ?? 0) >= MIN_SCORE);
  if (faces.length === 0) return "none";
  if (faces.length > 1) return "many";
  const box = faces[0].boundingBox;
  if (!box || box.width / frameWidth < MIN_FACE_WIDTH) return "far";
  const centreX = (box.originX + box.width / 2) / frameWidth;
  const centreY = (box.originY + box.height / 2) / frameHeight;
  if (Math.abs(centreX - 0.5) > 0.2 || Math.abs(centreY - 0.5) > 0.25) return "offcentre";
  return "ok";
}

const HINTS = {
  loading: "Starting the camera…",
  none: "No face found. Look straight at the camera in good light.",
  many: "Only you should be in the photo.",
  far: "Move closer so your face fills the circle.",
  offcentre: "Keep your face in the middle of the circle.",
  ok: "Face detected. Hold still and take the selfie.",
};

export default function SelfieCapture({ supplierId, onClose, onSuccess }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stream;
    let detector;
    let frame;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();
        detector = await loadDetector();
        const tick = () => {
          if (stopped) return;
          if (video.readyState >= 2) {
            const result = detector.detectForVideo(video, performance.now());
            setStatus(faceCheck(result.detections, video.videoWidth, video.videoHeight));
          }
          frame = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        setError(err?.name === "NotAllowedError"
          ? "Camera permission was denied. Allow the camera for this site and try again."
          : "The camera or face check could not start on this device. Try another phone or browser.");
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      detector?.close();
    };
  }, [photo]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || status !== "ok") return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setPhoto(canvas.toDataURL("image/jpeg", 0.85));
  };

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const upload = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ data: photo, filename: "selfie.jpg", mimeType: "image/jpeg", entityType: "KYB", entityId: supplierId }),
      });
      const uploaded = await upload.json().catch(() => ({}));
      if (!upload.ok || !uploaded.upload?.url) throw new Error(uploaded.error || "The selfie could not be uploaded. Please try again.");
      const res = await fetch(`/api/suppliers/${supplierId}/kyb`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ docType: "SELFIE", docUrl: uploaded.upload.url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "The selfie could not be saved. Please try again.");
      onSuccess?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const ready = status === "ok";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-stone-900">Take a live selfie</h3>
            <p className="text-xs text-stone-500">Remove glasses or a cap. Your face must match your PAN and licence photo.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-stone-400 hover:bg-stone-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mx-auto mt-4 aspect-square w-full max-w-xs overflow-hidden rounded-full bg-stone-900">
          {photo ? (
            <img src={photo} alt="Your selfie" className="h-full w-full -scale-x-100 object-cover" />
          ) : (
            <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          )}
          <div className={`pointer-events-none absolute inset-2 rounded-full border-4 ${photo || ready ? "border-emerald-400" : "border-amber-400/70"}`} />
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>
        ) : !photo && (
          <p className={`mt-4 text-center text-xs font-semibold ${ready ? "text-emerald-700" : "text-stone-600"}`}>
            {status === "loading" && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />}
            {HINTS[status]}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {photo ? (
            <>
              <button type="button" disabled={saving} onClick={() => setPhoto("")} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">
                <RefreshCw className="h-3.5 w-3.5" /> Retake
              </button>
              <button type="button" disabled={saving} onClick={submit} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-50">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Use this selfie
              </button>
            </>
          ) : (
            <button type="button" disabled={!ready} onClick={capture} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-50">
              <Camera className="h-3.5 w-3.5" /> Take selfie
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
