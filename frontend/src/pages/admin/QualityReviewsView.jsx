import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, Star, XCircle } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

export default function QualityReviewsView() {
  const [data, setData] = useState({ reviews: [], scores: [], metrics: {} });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("QUEUE");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews/admin/dashboard", { headers: authHeaders() });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function moderate(review, action) {
    const res = await fetch(`/api/reviews/admin/${review.id}/moderate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action, reason })
    });
    const result = await res.json();
    if (!res.ok) return setMessage(result.error);
    setMessage(`${review.booking_ref} review changed to ${action}. Quality scores recalculated.`);
    setReason("");
    setSelected(null);
    load();
  }

  const reviews = filter === "QUEUE"
    ? data.reviews.filter((item) => ["PENDING", "FLAGGED"].includes(item.status))
    : filter === "ALL"
    ? data.reviews
    : data.reviews.filter((item) => item.status === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Reviews and quality</span>
        <h1 className="mt-1 flex items-center gap-3 font-serif text-2xl font-bold text-stone-900">
          <Star className="h-7 w-7 fill-amber-500 text-amber-500" /> Verified feedback control
        </h1>
        <p className="mt-1 text-xs text-stone-600">
          Moderate traveler content and monitor product, supplier and driver scores calculated from operational evidence.
        </p>
      </section>

      {message && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {message}
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Total reviews", data.metrics?.total],
          ["Published", data.metrics?.published],
          ["Moderation queue", data.metrics?.moderation_queue],
          ["Average rating", Number(data.metrics?.average_rating || 0).toFixed(1)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <strong className="text-2xl text-stone-900">{value || 0}</strong>
            <span className="mt-1 block text-[10px] uppercase text-stone-500">{label}</span>
          </div>
        ))}
      </div>

      {/* Quality-score register */}
      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-bold text-stone-900">Quality-score register</h2>
          <button onClick={load} className="rounded-xl bg-stone-100 p-2 text-stone-600 hover:text-stone-900 border border-stone-200">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-amber-600" : ""}`} />
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="text-[10px] uppercase text-stone-500 border-b border-stone-200">
              <tr>
                <th className="pb-3 px-2">Entity</th>
                <th className="pb-3 px-2">Type</th>
                <th className="pb-3 px-2">Reviews</th>
                <th className="pb-3 px-2">Rating</th>
                <th className="pb-3 px-2">Completion</th>
                <th className="pb-3 px-2">Complaints</th>
                <th className="pb-3 px-2">Score</th>
                <th className="pb-3 px-2">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.scores.map((score) => (
                <tr key={`${score.entity_type}-${score.entity_id}`}>
                  <td className="py-3 px-2 font-bold text-stone-900">{score.entity_name || score.entity_id}</td>
                  <td className="py-3 px-2 text-stone-600">{score.entity_type}</td>
                  <td className="py-3 px-2 text-stone-800">{score.review_count}</td>
                  <td className="py-3 px-2 text-stone-800">{score.average_rating ? Number(score.average_rating).toFixed(1) : "—"}</td>
                  <td className="py-3 px-2 text-stone-800">{score.completion_rate == null ? "—" : `${score.completion_rate}%`}</td>
                  <td className="py-3 px-2 text-stone-800">{score.complaint_rate == null ? "—" : `${score.complaint_rate}%`}</td>
                  <td className="py-3 px-2 font-bold text-amber-700">{score.score_100}</td>
                  <td className="py-3 px-2">
                    <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${
                      score.score_100 >= 80 ? "bg-emerald-100 text-emerald-900 border border-emerald-300" : "bg-amber-100 text-amber-900 border border-amber-300"
                    }`}>
                      {score.tier}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.scores.length && (
            <p className="p-6 text-center text-xs text-stone-500">Scores appear when verified reviews are published.</p>
          )}
        </div>
      </section>

      {/* Review Moderation */}
      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-bold text-stone-900">Review moderation</h2>
          <div className="flex gap-2">
            {["QUEUE", "PUBLISHED", "REJECTED", "ALL"].map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`rounded-full px-3 py-2 text-[10px] font-bold transition ${
                  filter === item ? "bg-amber-500 text-stone-950 shadow-sm" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4">
              <div className="flex justify-between items-center">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <Star
                      key={score}
                      className={`h-4 w-4 ${
                        score <= review.experience_rating ? "fill-amber-500 text-amber-500" : "text-stone-300"
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-[9px] font-bold uppercase rounded-full px-2 py-0.5 border ${
                  review.status === "PUBLISHED"
                    ? "border-emerald-300 text-emerald-900 bg-emerald-100"
                    : "border-amber-300 text-amber-900 bg-amber-100"
                }`}>
                  {review.status}
                </span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-stone-900">{review.title || review.product_title}</h3>
              <p className="mt-1 text-[10px] text-stone-500">
                {review.booking_ref} · {review.supplier_name} · {review.driver_name || "No driver"}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-stone-700">{review.comment}</p>
              {review.moderation_reason && (
                <p className="mt-2 text-[10px] text-amber-800">Auto/moderation note: {review.moderation_reason}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => moderate(review, "PUBLISHED")}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-100 border border-emerald-300 px-3 py-2 text-[10px] font-bold text-emerald-900 hover:bg-emerald-200 transition"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Publish
                </button>
                <button
                  onClick={() => setSelected(review)}
                  className="inline-flex items-center gap-1 rounded-xl bg-rose-100 border border-rose-300 px-3 py-2 text-[10px] font-bold text-rose-900 hover:bg-rose-200 transition"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject / flag
                </button>
              </div>
            </article>
          ))}
          {!reviews.length && (
            <div className="col-span-2 rounded-2xl border border-dashed border-stone-300 p-8 text-center text-xs text-stone-500">
              No reviews in {filter} status.
            </div>
          )}
        </div>
      </section>

      {/* Moderation Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-rose-600" />
              <h2 className="font-serif text-xl font-bold text-stone-900">Moderate review</h2>
            </div>
            <p className="text-xs text-stone-600">
              Enter the reason for flagging or rejecting this traveler review.
            </p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              placeholder="Required reason shown in the audit record (min 5 chars)..."
              className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-3 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-500 focus:bg-white"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelected(null)}
                className="rounded-xl bg-stone-100 border border-stone-300 px-4 py-2 text-xs text-stone-700 hover:bg-stone-200"
              >
                Cancel
              </button>
              <button
                onClick={() => moderate(selected, "FLAGGED")}
                disabled={reason.trim().length < 5}
                className="rounded-xl bg-amber-100 border border-amber-300 px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-200 disabled:opacity-50"
              >
                Flag
              </button>
              <button
                onClick={() => moderate(selected, "REJECTED")}
                disabled={reason.trim().length < 5}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50 shadow-sm"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
