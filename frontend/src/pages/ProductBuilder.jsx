import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp,
  Plus, Trash2, Star, MapPin, Clock, Users, Zap, Globe,
  Camera, Package, Navigation, Ticket, Sparkles, Loader2,
  Building2, Car, Bus, Plane, Train, AlertCircle, CheckCircle2,
  Eye, DollarSign, Settings, FileText, Calendar, Image
} from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { authHeaders } from "../lib/api.js";

// ─── Product taxonomy ─────────────────────────────────────────────────────────
const PRODUCT_TYPES = {
  PACKAGE: {
    label: "Package",
    emoji: "🎒",
    color: "amber",
    description: "Multi-day holiday bundle — transport, sightseeing, with or without hotel.",
    subtypes: [
      { value: "WITH_HOTEL", label: "Package with Hotel", desc: "Includes accommodation (3-star / 4-star / 5-star tier selection)" },
      { value: "WITHOUT_HOTEL", label: "Package without Hotel", desc: "Transport + sightseeing only. Traveller arranges hotel." },
    ],
  },
  TOUR: {
    label: "Tour",
    emoji: "🗺️",
    color: "blue",
    description: "Day tours & excursions — shared coach or private vehicle.",
    subtypes: [
      { value: "SIC", label: "Shared (SIC Coach)", desc: "Fixed pickup hubs, shared coach, per-person ticket pricing" },
      { value: "PRIVATE", label: "Private Tour", desc: "Exclusive private vehicle — vehicle types & prices" },
    ],
  },
  TRANSFER: {
    label: "Transfer",
    emoji: "🚗",
    color: "indigo",
    description: "Point-to-point private transfers — airport, railway, intercity.",
    subtypes: [
      { value: "AIRPORT_RAILWAY", label: "Airport / Railway Transfer", desc: "Fixed hub (airport / station) to hotel drop" },
      { value: "INTERCITY_HOTEL", label: "Intercity Hotel Transfer", desc: "Hotel to hotel between zones in same city" },
      { value: "CITY_TO_CITY", label: "City to City Transfer", desc: "Full intercity run (e.g. Bangkok → Pattaya)" },
    ],
  },
  ATTRACTION: {
    label: "Attraction",
    emoji: "🎡",
    color: "rose",
    description: "Visit a fixed venue — theme park, show, museum, casino.",
    subtypes: [
      { value: "TICKET_ONLY", label: "Ticket Only", desc: "Entry ticket(s) only. Traveller arranges own transport." },
      { value: "TICKET_SIC", label: "Ticket + SIC Transfer", desc: "Ticket bundled with shared hotel pickup & drop" },
      { value: "TICKET_PRIVATE", label: "Ticket + Private Transfer", desc: "Ticket bundled with private vehicle pickup & drop" },
    ],
  },
  EXPERIENCE: {
    label: "Experience",
    emoji: "🤿",
    color: "emerald",
    description: "Active, hands-on activity — scuba, cooking, ATV, skydiving.",
    subtypes: [
      { value: "TICKET_ONLY", label: "Ticket Only", desc: "Activity ticket only — traveller arrives independently" },
      { value: "TICKET_SIC", label: "Ticket + SIC Transfer", desc: "Activity bundled with shared hotel pickup & drop" },
      { value: "TICKET_PRIVATE", label: "Ticket + Private Transfer", desc: "Activity bundled with private vehicle" },
    ],
  },
};

const VEHICLE_TYPES = [
  { value: "SEDAN", label: "Sedan", example: "Toyota Corolla / Dzire (up to 4 pax)" },
  { value: "SUV", label: "SUV / MPV", example: "Innova / Ertiga (up to 7 pax)" },
  { value: "TEMPO", label: "Tempo Traveller", example: "Force Traveller (up to 12 pax)" },
  { value: "MINI_BUS", label: "Mini Bus", example: "Marcopolo (up to 22 pax)" },
  { value: "BUS", label: "AC Coach", example: "Volvo (up to 45 pax)" },
];

const LANGUAGES = ["English", "Hindi", "Thai", "Marathi", "Tamil", "Telugu", "Malayalam", "Kannada", "Bengali", "Gujarati"];
const CANCELLATION_POLICIES = [
  { value: "NON_REFUNDABLE", label: "Non-Refundable" },
  { value: "FLEXIBLE_24H", label: "Flexible — Full refund if cancelled 24h before" },
  { value: "FLEXIBLE_48H", label: "Flexible — Full refund if cancelled 48h before" },
  { value: "MODERATE_48H", label: "Moderate — 50% refund if cancelled 48h before" },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const colorClass = {
  amber: { ring: "ring-amber-400", bg: "bg-amber-50", badge: "bg-amber-100 text-amber-900", btn: "bg-amber-500 hover:bg-amber-600" },
  blue: { ring: "ring-blue-400", bg: "bg-blue-50", badge: "bg-blue-100 text-blue-900", btn: "bg-blue-500 hover:bg-blue-600" },
  indigo: { ring: "ring-indigo-400", bg: "bg-indigo-50", badge: "bg-indigo-100 text-indigo-900", btn: "bg-indigo-500 hover:bg-indigo-600" },
  rose: { ring: "ring-rose-400", bg: "bg-rose-50", badge: "bg-rose-100 text-rose-900", btn: "bg-rose-500 hover:bg-rose-600" },
  emerald: { ring: "ring-emerald-400", bg: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-900", btn: "bg-emerald-500 hover:bg-emerald-600" },
};

// ─── Reusable list editor ─────────────────────────────────────────────────────
function ListEditor({ label, placeholder, items = [], onChange, max = 12 }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t || items.length >= max) return;
    onChange([...items, t]);
    setDraft("");
  };
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">{label}</label>
      <div className="flex gap-2 mb-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim() || items.length >= max}
          className="px-3 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-40 transition"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-sm text-stone-800">
              <span className="flex-1">✓ {item}</span>
              <button type="button" onClick={() => remove(i)} className="text-stone-400 hover:text-red-500 transition">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[10px] text-stone-400">{items.length}/{max} items</p>
    </div>
  );
}

// ─── Step 0: Type + Sub-Type selector ────────────────────────────────────────
function StepType({ value, onChange }) {
  const { productType, productSubType } = value;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900">What type of product are you listing?</h2>
        <p className="mt-1 text-sm text-stone-500">Select the product type — the builder will adapt to show you only the relevant fields.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(PRODUCT_TYPES).map(([type, meta]) => {
          const sel = productType === type;
          const cc = colorClass[meta.color];
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange({ productType: type, productSubType: meta.subtypes[0].value })}
              className={`relative flex flex-col rounded-3xl border-2 p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                sel ? `${cc.ring} ring-2 ${cc.bg} border-transparent` : "border-stone-200 bg-white hover:border-stone-300"
              }`}
            >
              {sel && (
                <span className="absolute right-3 top-3 h-5 w-5 rounded-full bg-stone-900 flex items-center justify-center">
                  <Check className="h-3 w-3 text-white" />
                </span>
              )}
              <span className="text-3xl mb-3">{meta.emoji}</span>
              <h3 className="font-bold text-stone-900">{meta.label}</h3>
              <p className="mt-1 text-xs text-stone-500 leading-relaxed">{meta.description}</p>
            </button>
          );
        })}
      </div>

      {productType && (
        <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
          <h3 className="font-bold text-stone-800 mb-3 text-sm uppercase tracking-wider">
            Select Sub-Type for {PRODUCT_TYPES[productType]?.label}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCT_TYPES[productType]?.subtypes.map((sub) => (
              <button
                key={sub.value}
                type="button"
                onClick={() => onChange({ productType, productSubType: sub.value })}
                className={`rounded-2xl border-2 p-4 text-left transition-all ${
                  productSubType === sub.value
                    ? "border-amber-400 bg-white shadow-md"
                    : "border-stone-200 bg-white hover:border-amber-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-stone-900">{sub.label}</span>
                  {productSubType === sub.value && <Check className="h-4 w-4 text-amber-600" />}
                </div>
                <p className="mt-1 text-[11px] text-stone-500 leading-snug">{sub.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 1: Basic Info ───────────────────────────────────────────────────────
function StepBasicInfo({ data, onChange, errors }) {
  const upd = (key, val) => onChange({ ...data, [key]: val });
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900">About & Photos</h2>
        <p className="mt-1 text-sm text-stone-500">Give your product a compelling title, description and hero images.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Product Title *</label>
          <input
            value={data.title || ""}
            onChange={(e) => upd("title", e.target.value)}
            placeholder="e.g. 3N4D Goa Beach Holiday with Hotel"
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
          {errors?.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">City *</label>
          <input
            value={data.city || ""}
            onChange={(e) => upd("city", e.target.value)}
            placeholder="e.g. Goa, Bangkok, Pattaya"
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
          {errors?.city && <p className="mt-1 text-xs text-red-500">{errors.city}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">State / Region *</label>
          <input
            value={data.state || ""}
            onChange={(e) => upd("state", e.target.value)}
            placeholder="e.g. Goa, Thailand"
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
          {errors?.state && <p className="mt-1 text-xs text-red-500">{errors.state}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Short Summary * <span className="text-stone-400 font-normal">(shown on listing card)</span></label>
          <textarea
            value={data.shortDesc || ""}
            onChange={(e) => upd("shortDesc", e.target.value)}
            placeholder="Write a 1–2 sentence hook that makes travellers want to click..."
            rows={3}
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
          />
          <p className="mt-1 text-[10px] text-stone-400">{(data.shortDesc || "").length}/300 characters</p>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Full Description</label>
          <textarea
            value={data.fullDesc || ""}
            onChange={(e) => upd("fullDesc", e.target.value)}
            placeholder="Detailed description — what makes this product special, what travellers will experience..."
            rows={6}
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Hero Image URL *</label>
          <input
            value={data.heroImage || ""}
            onChange={(e) => upd("heroImage", e.target.value)}
            placeholder="https://images.unsplash.com/..."
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
          {data.heroImage && (
            <div className="mt-2 h-40 rounded-2xl overflow-hidden border border-stone-200">
              <img src={data.heroImage} alt="preview" className="h-full w-full object-cover" onError={(e) => (e.target.style.display = "none")} />
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Gallery Images <span className="text-stone-400 font-normal">(up to 5 additional)</span></label>
          {(data.images || []).map((img, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                value={img}
                onChange={(e) => {
                  const imgs = [...(data.images || [])];
                  imgs[i] = e.target.value;
                  upd("images", imgs);
                }}
                placeholder="https://..."
                className="flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              <button type="button" onClick={() => upd("images", (data.images || []).filter((_, idx) => idx !== i))} className="text-stone-400 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {(data.images || []).length < 5 && (
            <button type="button" onClick={() => upd("images", [...(data.images || []), ""])} className="flex items-center gap-2 text-xs font-bold text-amber-700 hover:text-amber-900">
              <Plus className="h-3.5 w-3.5" /> Add gallery image
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Overview ─────────────────────────────────────────────────────────
function StepOverview({ data, onChange }) {
  const upd = (key, val) => onChange({ ...data, [key]: val });
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Overview</h2>
        <p className="mt-1 text-sm text-stone-500">Add highlights, inclusions, exclusions and essential information for travellers.</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <ListEditor
          label="✨ Highlights (max 8)"
          placeholder="e.g. Dudhsagar Waterfall visit included"
          items={data.highlights || []}
          onChange={(v) => upd("highlights", v)}
          max={8}
        />
        <ListEditor
          label="✅ Inclusions (what's included)"
          placeholder="e.g. AC vehicle, English guide, Breakfast"
          items={data.inclusions || []}
          onChange={(v) => upd("inclusions", v)}
          max={12}
        />
        <ListEditor
          label="❌ Exclusions (not included)"
          placeholder="e.g. Airfare, Meals, Personal expenses"
          items={data.exclusions || []}
          onChange={(v) => upd("exclusions", v)}
          max={8}
        />
        <ListEditor
          label="ℹ️ Essential Information"
          placeholder="e.g. Minimum age 18 years"
          items={data.essentialInfo || []}
          onChange={(v) => upd("essentialInfo", v)}
          max={6}
        />
      </div>
    </div>
  );
}

// ─── Step 3: Itinerary ────────────────────────────────────────────────────────
function StepItinerary({ data, onChange, productType, productSubType }) {
  const isMultiDay = productType === "PACKAGE";
  const upd = (items) => onChange({ ...data, itineraryItems: items });
  const items = data.itineraryItems || [];

  const addItem = () => {
    const day = isMultiDay ? (items.length > 0 ? items[items.length - 1].dayNumber : 1) : 0;
    upd([...items, {
      id: uid(), dayNumber: day, timeLabel: isMultiDay ? `Day ${day}` : "09:00",
      title: "", description: "", icon: "📍", durationText: "",
    }]);
  };

  const updateItem = (i, key, val) => {
    const next = [...items];
    next[i] = { ...next[i], [key]: val };
    upd(next);
  };

  const removeItem = (i) => upd(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Itinerary</h2>
          <p className="mt-1 text-sm text-stone-500">
            {isMultiDay ? "Day-by-day plan with activities for each day." : "Hour-by-hour flow of the experience."}
          </p>
        </div>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 transition"
        >
          <Plus className="h-4 w-4" /> Add step
        </button>
      </div>

      {items.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-stone-200 p-10 text-center">
          <Calendar className="h-8 w-8 text-stone-300 mx-auto mb-3" />
          <p className="text-sm text-stone-500">No itinerary steps yet. Click "Add step" to begin.</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={item.id || i} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-12">
              {isMultiDay ? (
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Day #</label>
                  <input
                    type="number"
                    min={1}
                    value={item.dayNumber || 1}
                    onChange={(e) => updateItem(i, "dayNumber", Number(e.target.value))}
                    className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Time</label>
                  <input
                    value={item.timeLabel || ""}
                    onChange={(e) => updateItem(i, "timeLabel", e.target.value)}
                    placeholder="09:00"
                    className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
              )}
              <div className="sm:col-span-1">
                <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Icon</label>
                <input
                  value={item.icon || "📍"}
                  onChange={(e) => updateItem(i, "icon", e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-base text-center focus:outline-none focus:ring-1 focus:ring-amber-300"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Step Title *</label>
                <input
                  value={item.title || ""}
                  onChange={(e) => updateItem(i, "title", e.target.value)}
                  placeholder={isMultiDay ? "Arrival & North Goa Beaches" : "Safety Briefing"}
                  className="w-full rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Duration</label>
                <input
                  value={item.durationText || ""}
                  onChange={(e) => updateItem(i, "durationText", e.target.value)}
                  placeholder="1.5 hrs"
                  className="w-full rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
                />
              </div>
              <div className="sm:col-span-1 flex items-end justify-end">
                <button type="button" onClick={() => removeItem(i)} className="text-stone-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="sm:col-span-12">
                <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Description</label>
                <textarea
                  value={item.description || ""}
                  onChange={(e) => updateItem(i, "description", e.target.value)}
                  placeholder="What happens at this step..."
                  rows={2}
                  className="w-full rounded-lg border border-stone-200 px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 4: Pricing ──────────────────────────────────────────────────────────
function StepPricing({ data, onChange, productType, productSubType }) {
  const upd = (key, val) => onChange({ ...data, [key]: val });
  const needsTicketTiers = ["ATTRACTION", "EXPERIENCE", "TOUR"].includes(productType) && productSubType !== "PRIVATE";
  const needsVehicleOptions = productType === "TRANSFER" || productSubType === "PRIVATE" || productSubType === "TICKET_PRIVATE";
  const needsHotelTiers = productType === "PACKAGE" && productSubType === "WITH_HOTEL";

  const updateTier = (i, key, val) => {
    const tiers = [...(data.ticketTiers || [])];
    tiers[i] = { ...tiers[i], [key]: val };
    upd("ticketTiers", tiers);
  };
  const removeTier = (i) => upd("ticketTiers", (data.ticketTiers || []).filter((_, idx) => idx !== i));
  const addTier = () => upd("ticketTiers", [...(data.ticketTiers || []), { id: uid(), tierName: "Adult", ageMin: "", ageMax: "", priceInr: "", isFree: false }]);

  const updateVeh = (i, key, val) => {
    const vehs = [...(data.vehicleOptions || [])];
    vehs[i] = { ...vehs[i], [key]: val };
    upd("vehicleOptions", vehs);
  };
  const removeVeh = (i) => upd("vehicleOptions", (data.vehicleOptions || []).filter((_, idx) => idx !== i));
  const addVeh = () => upd("vehicleOptions", [...(data.vehicleOptions || []), { id: uid(), vehicleType: "SEDAN", label: "", maxPax: 4, maxLuggage: 2, priceInr: "", isRecommended: false }]);

  const updateHotel = (i, key, val) => {
    const tiers = [...(data.hotelTiers || [])];
    tiers[i] = { ...tiers[i], [key]: val };
    upd("hotelTiers", tiers);
  };
  const removeHotel = (i) => upd("hotelTiers", (data.hotelTiers || []).filter((_, idx) => idx !== i));
  const addHotel = () => upd("hotelTiers", [...(data.hotelTiers || []), { id: uid(), tierName: "3-Star", pricePerPersonPerNightInr: "", isRecommended: false }]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Pricing</h2>
        <p className="mt-1 text-sm text-stone-500">Set your pricing. The fields shown depend on your product type.</p>
      </div>

      {/* Base price — always shown */}
      <div className="rounded-3xl border border-stone-200 bg-white p-6">
        <h3 className="font-bold text-stone-900 mb-4">Base Price</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">
              {needsTicketTiers ? "Starting From Price (₹)" : "Price (₹) *"}
            </label>
            <input
              type="number"
              value={data.priceInr || ""}
              onChange={(e) => upd("priceInr", e.target.value)}
              placeholder="e.g. 2999"
              className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Strike / Crossed Price (₹)</label>
            <input
              type="number"
              value={data.strikePriceInr || ""}
              onChange={(e) => upd("strikePriceInr", e.target.value)}
              placeholder="e.g. 3999 (optional)"
              className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
        </div>
      </div>

      {/* Ticket Tiers */}
      {needsTicketTiers && (
        <div className="rounded-3xl border border-stone-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-stone-900">🎫 Ticket Tiers</h3>
              <p className="text-xs text-stone-500 mt-0.5">Adult, Child, Senior, Infant — set per-person prices</p>
            </div>
            <button type="button" onClick={addTier} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600">
              <Plus className="h-3.5 w-3.5" /> Add Tier
            </button>
          </div>
          {(data.ticketTiers || []).length === 0 && (
            <p className="text-sm text-stone-400 text-center py-4">No tiers yet. Add Adult tier at minimum.</p>
          )}
          <div className="space-y-3">
            {(data.ticketTiers || []).map((tier, i) => (
              <div key={tier.id || i} className="grid gap-2 sm:grid-cols-12 items-end border border-stone-100 rounded-2xl p-3 bg-stone-50">
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Tier Name</label>
                  <input value={tier.tierName || ""} onChange={(e) => updateTier(i, "tierName", e.target.value)} placeholder="Adult" className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Age Min</label>
                  <input type="number" value={tier.ageMin || ""} onChange={(e) => updateTier(i, "ageMin", e.target.value)} placeholder="12" className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Age Max</label>
                  <input type="number" value={tier.ageMax || ""} onChange={(e) => updateTier(i, "ageMax", e.target.value)} placeholder="65" className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Price (₹)</label>
                  <input type="number" value={tier.priceInr || ""} onChange={(e) => updateTier(i, "priceInr", e.target.value)} placeholder="1299" className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                </div>
                <div className="sm:col-span-1 flex items-center gap-1">
                  <input type="checkbox" id={`free-${i}`} checked={!!tier.isFree} onChange={(e) => updateTier(i, "isFree", e.target.checked)} className="rounded" />
                  <label htmlFor={`free-${i}`} className="text-[10px] font-bold text-stone-500">Free</label>
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <button type="button" onClick={() => removeTier(i)} className="text-stone-400 hover:text-red-500 p-1 rounded-lg">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vehicle Options */}
      {needsVehicleOptions && (
        <div className="rounded-3xl border border-stone-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-stone-900">🚗 Vehicle Options</h3>
              <p className="text-xs text-stone-500 mt-0.5">Sedan, SUV, Tempo — prices per vehicle (not per person)</p>
            </div>
            <button type="button" onClick={addVeh} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600">
              <Plus className="h-3.5 w-3.5" /> Add Vehicle
            </button>
          </div>
          <div className="space-y-3">
            {(data.vehicleOptions || []).map((veh, i) => (
              <div key={veh.id || i} className="grid gap-2 sm:grid-cols-12 items-end border border-stone-100 rounded-2xl p-3 bg-stone-50">
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Vehicle Type</label>
                  <select value={veh.vehicleType || "SEDAN"} onChange={(e) => updateVeh(i, "vehicleType", e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300">
                    {VEHICLE_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Display Label</label>
                  <input value={veh.label || ""} onChange={(e) => updateVeh(i, "label", e.target.value)} placeholder="Sedan (up to 4 pax)" className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Max Pax</label>
                  <input type="number" value={veh.maxPax || ""} onChange={(e) => updateVeh(i, "maxPax", e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Price (₹)</label>
                  <input type="number" value={veh.priceInr || ""} onChange={(e) => updateVeh(i, "priceInr", e.target.value)} placeholder="2800" className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                </div>
                <div className="sm:col-span-1 flex items-center gap-1">
                  <input type="checkbox" id={`rec-${i}`} checked={!!veh.isRecommended} onChange={(e) => updateVeh(i, "isRecommended", e.target.checked)} className="rounded" />
                  <label htmlFor={`rec-${i}`} className="text-[10px] font-bold text-stone-500">★ Best</label>
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <button type="button" onClick={() => removeVeh(i)} className="text-stone-400 hover:text-red-500 p-1 rounded-lg">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {(data.vehicleOptions || []).length === 0 && <p className="text-sm text-stone-400 text-center py-4">No vehicles yet. Add Sedan at minimum.</p>}
          </div>
        </div>
      )}

      {/* Hotel Tiers */}
      {needsHotelTiers && (
        <div className="rounded-3xl border border-stone-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-stone-900">🏨 Hotel Tiers</h3>
              <p className="text-xs text-stone-500 mt-0.5">Additional price per person per night for each star category</p>
            </div>
            <button type="button" onClick={addHotel} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600">
              <Plus className="h-3.5 w-3.5" /> Add Tier
            </button>
          </div>
          <div className="space-y-3">
            {(data.hotelTiers || []).map((tier, i) => (
              <div key={tier.id || i} className="grid gap-2 sm:grid-cols-12 items-end border border-stone-100 rounded-2xl p-3 bg-stone-50">
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Category</label>
                  <select value={tier.tierName || "3-Star"} onChange={(e) => updateHotel(i, "tierName", e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300">
                    {["3-Star", "4-Star", "5-Star", "Budget", "Heritage"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-6">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Extra Price/Person/Night (₹)</label>
                  <input type="number" value={tier.pricePerPersonPerNightInr || ""} onChange={(e) => updateHotel(i, "pricePerPersonPerNightInr", e.target.value)} placeholder="1800" className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                </div>
                <div className="sm:col-span-2 flex items-center gap-1">
                  <input type="checkbox" id={`hrec-${i}`} checked={!!tier.isRecommended} onChange={(e) => updateHotel(i, "isRecommended", e.target.checked)} className="rounded" />
                  <label htmlFor={`hrec-${i}`} className="text-[10px] font-bold text-stone-500">Recommended</label>
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <button type="button" onClick={() => removeHotel(i)} className="text-stone-400 hover:text-red-500 p-1 rounded-lg">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {(data.hotelTiers || []).length === 0 && <p className="text-sm text-stone-400 text-center py-4">No hotel tiers yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 5: Settings (SIC hubs, capacity, booking mode) ─────────────────────
function StepSettings({ data, onChange, productType, productSubType }) {
  const upd = (key, val) => onChange({ ...data, [key]: val });
  const needsSicHubs = ["SIC", "TICKET_SIC"].includes(productSubType);

  const updateHub = (i, key, val) => {
    const hubs = [...(data.sicHubs || [])];
    hubs[i] = { ...hubs[i], [key]: val };
    upd("sicHubs", hubs);
  };
  const removeHub = (i) => upd("sicHubs", (data.sicHubs || []).filter((_, idx) => idx !== i));
  const addHub = () => upd("sicHubs", [...(data.sicHubs || []), { id: uid(), hubName: "", hubAddress: "", departureTime: "09:00", capacity: 20 }]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Booking Settings</h2>
        <p className="mt-1 text-sm text-stone-500">Capacity, advance booking rules, languages, and cancellation policy.</p>
      </div>

      {/* Capacity */}
      <div className="rounded-3xl border border-stone-200 bg-white p-6">
        <h3 className="font-bold text-stone-900 mb-4">Duration & Capacity</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Duration Hours</label>
            <input type="number" value={data.durationHours || ""} onChange={(e) => upd("durationHours", e.target.value)} placeholder="8" className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>
          {productType === "PACKAGE" && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Duration Days</label>
              <input type="number" value={data.durationDays || ""} onChange={(e) => upd("durationDays", e.target.value)} placeholder="4" className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Min Pax</label>
            <input type="number" value={data.minPax || 1} onChange={(e) => upd("minPax", e.target.value)} className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Max Pax</label>
            <input type="number" value={data.maxPax || 20} onChange={(e) => upd("maxPax", e.target.value)} className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Min Advance Booking (hours)</label>
            <input type="number" value={data.minAdvanceHours || 4} onChange={(e) => upd("minAdvanceHours", e.target.value)} className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>
        </div>
      </div>

      {/* Booking Mode */}
      <div className="rounded-3xl border border-stone-200 bg-white p-6">
        <h3 className="font-bold text-stone-900 mb-4">Booking Mode</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { value: "INSTANT", label: "⚡ Instant Confirmation", desc: "Booking confirmed automatically — no manual review" },
            { value: "REQUEST_APPROVAL", label: "📋 Request Approval", desc: "You manually accept or reject each booking" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => upd("bookingMode", opt.value)}
              className={`rounded-2xl border-2 p-4 text-left transition-all ${data.bookingMode === opt.value ? "border-amber-400 bg-amber-50" : "border-stone-200 bg-white hover:border-amber-200"}`}
            >
              <div className="font-bold text-sm text-stone-900">{opt.label}</div>
              <p className="mt-1 text-xs text-stone-500">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Cancellation */}
      <div className="rounded-3xl border border-stone-200 bg-white p-6">
        <h3 className="font-bold text-stone-900 mb-4">Cancellation Policy</h3>
        <div className="grid gap-3">
          {CANCELLATION_POLICIES.map((p) => (
            <label key={p.value} className={`flex items-center gap-3 rounded-2xl border-2 p-3 cursor-pointer transition-all ${data.cancellationPolicy === p.value ? "border-amber-400 bg-amber-50" : "border-stone-200 hover:border-amber-200"}`}>
              <input type="radio" name="cancel" value={p.value} checked={data.cancellationPolicy === p.value} onChange={() => upd("cancellationPolicy", p.value)} className="accent-amber-500" />
              <span className="text-sm text-stone-800">{p.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <input type="checkbox" id="freeCancellation" checked={!!data.freeCancellation} onChange={(e) => upd("freeCancellation", e.target.checked)} className="h-4 w-4 rounded accent-amber-500" />
          <label htmlFor="freeCancellation" className="text-sm font-medium text-stone-700">Show "Free Cancellation" badge on listing</label>
        </div>
      </div>

      {/* Languages */}
      <div className="rounded-3xl border border-stone-200 bg-white p-6">
        <h3 className="font-bold text-stone-900 mb-4">Languages</h3>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => {
            const selected = (data.languages || ["English"]).includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => {
                  const curr = data.languages || ["English"];
                  upd("languages", selected ? curr.filter((l) => l !== lang) : [...curr, lang]);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${selected ? "border-amber-400 bg-amber-100 text-amber-900" : "border-stone-200 bg-white text-stone-700 hover:border-amber-200"}`}
              >
                {lang}
              </button>
            );
          })}
        </div>
      </div>

      {/* SIC Hubs */}
      {needsSicHubs && (
        <div className="rounded-3xl border border-stone-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-stone-900">🚌 SIC Pickup Hubs</h3>
              <p className="text-xs text-stone-500 mt-0.5">Define where shared travellers are picked up</p>
            </div>
            <button type="button" onClick={addHub} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600">
              <Plus className="h-3.5 w-3.5" /> Add Hub
            </button>
          </div>
          <div className="space-y-3">
            {(data.sicHubs || []).map((hub, i) => (
              <div key={hub.id || i} className="grid gap-2 sm:grid-cols-12 items-end border border-stone-100 rounded-2xl p-3 bg-stone-50">
                <div className="sm:col-span-4">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Hub Name</label>
                  <input value={hub.hubName || ""} onChange={(e) => updateHub(i, "hubName", e.target.value)} placeholder="Sukhumvit Hub" className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Address</label>
                  <input value={hub.hubAddress || ""} onChange={(e) => updateHub(i, "hubAddress", e.target.value)} placeholder="Near Asok BTS, Bangkok" className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Departure</label>
                  <input type="time" value={hub.departureTime || "09:00"} onChange={(e) => updateHub(i, "departureTime", e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Cap</label>
                  <input type="number" value={hub.capacity || 20} onChange={(e) => updateHub(i, "capacity", e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <button type="button" onClick={() => removeHub(i)} className="text-stone-400 hover:text-red-500 p-1 rounded-lg">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {(data.sicHubs || []).length === 0 && <p className="text-sm text-stone-400 text-center py-4">No pickup hubs. Add at least one.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 6: Review & Publish ─────────────────────────────────────────────────
function StepReview({ formData, productType, productSubType }) {
  const typeMeta = PRODUCT_TYPES[productType] || {};
  const subtype = typeMeta.subtypes?.find((s) => s.value === productSubType);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Review & Publish</h2>
        <p className="mt-1 text-sm text-stone-500">Check your product details before publishing to the marketplace.</p>
      </div>

      {/* Preview card */}
      <div className="rounded-3xl border border-stone-200 bg-white overflow-hidden shadow-sm">
        {formData.basic.heroImage && (
          <div className="h-52 overflow-hidden">
            <img src={formData.basic.heroImage} alt="hero" className="h-full w-full object-cover" onError={(e) => (e.target.style.display = "none")} />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-start gap-3 flex-wrap">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-900">
              {typeMeta.emoji} {typeMeta.label}
            </span>
            {subtype && (
              <span className="rounded-full bg-stone-100 px-3 py-1 text-[10px] font-semibold text-stone-700">
                {subtype.label}
              </span>
            )}
          </div>
          <h3 className="mt-3 text-xl font-bold text-stone-900">{formData.basic.title || "Untitled Product"}</h3>
          <p className="mt-1 text-sm text-stone-500 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {formData.basic.city}, {formData.basic.state}
          </p>
          <p className="mt-3 text-sm text-stone-700 leading-relaxed">{formData.basic.shortDesc}</p>

          <div className="mt-4 pt-4 border-t border-stone-100 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase text-stone-400">Base Price</p>
              <p className="font-bold text-amber-700">₹{Number(formData.pricing.priceInr || 0).toLocaleString("en-IN")}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-stone-400">Duration</p>
              <p className="font-bold text-stone-900">{formData.settings.durationHours || "—"}h</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-stone-400">Max Pax</p>
              <p className="font-bold text-stone-900">{formData.settings.maxPax || "—"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Checklist */}
      {[
        { label: "Product type selected", ok: !!productType },
        { label: "Title provided", ok: !!(formData.basic.title?.trim()) },
        { label: "City & State provided", ok: !!(formData.basic.city?.trim() && formData.basic.state?.trim()) },
        { label: "Short description written", ok: !!(formData.basic.shortDesc?.trim()) },
        { label: "Hero image set", ok: !!(formData.basic.heroImage?.trim()) },
        { label: "Base price set", ok: !!(formData.pricing.priceInr && Number(formData.pricing.priceInr) > 0) },
      ].map(({ label, ok }) => (
        <div key={label} className={`flex items-center gap-3 rounded-xl px-4 py-2 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
          {label}
        </div>
      ))}
    </div>
  );
}

// ─── STEPS CONFIG ─────────────────────────────────────────────────────────────
const STEPS = [
  { key: "type",      label: "Product Type",  icon: Sparkles },
  { key: "basic",     label: "About & Photos", icon: Image },
  { key: "overview",  label: "Overview",       icon: FileText },
  { key: "itinerary", label: "Itinerary",      icon: Calendar },
  { key: "pricing",   label: "Pricing",        icon: DollarSign },
  { key: "settings",  label: "Settings",       icon: Settings },
  { key: "review",    label: "Review",         icon: Eye },
];

const DRAFT_KEY = "product_builder_v2_draft";

const DEFAULT_FORM = {
  type: { productType: "", productSubType: "" },
  basic: { title: "", city: "", state: "", shortDesc: "", fullDesc: "", heroImage: "", images: [] },
  overview: { highlights: [], inclusions: [], exclusions: [], essentialInfo: [] },
  itinerary: { itineraryItems: [] },
  pricing: { priceInr: "", strikePriceInr: "", ticketTiers: [], vehicleOptions: [], hotelTiers: [] },
  settings: {
    durationHours: "", durationDays: "1", minPax: 1, maxPax: 20, minAdvanceHours: 4,
    bookingMode: "INSTANT", cancellationPolicy: "FLEXIBLE_24H", freeCancellation: true,
    languages: ["English"], sicHubs: [],
  },
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ProductBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const supplierId = user?.user_metadata?.supplier_id || user?.supplier_id || "";

  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_FORM;
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishedId, setPublishedId] = useState(null);

  // Auto-save draft
  const draftTimerRef = useRef(null);
  useEffect(() => {
    clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(formData)); } catch {}
    }, 800);
    return () => clearTimeout(draftTimerRef.current);
  }, [formData]);

  const updStep = useCallback((key, val) => {
    setFormData((prev) => ({ ...prev, [key]: val }));
  }, []);

  const stepKey = STEPS[step].key;
  const productType = formData.type.productType;
  const productSubType = formData.type.productSubType;

  const canProceed = () => {
    if (step === 0) return !!productType && !!productSubType;
    if (step === 1) return !!(formData.basic.title?.trim() && formData.basic.city?.trim() && formData.basic.state?.trim() && formData.basic.shortDesc?.trim() && formData.basic.heroImage?.trim());
    if (step === 4) return !!(formData.pricing.priceInr && Number(formData.pricing.priceInr) > 0);
    return true;
  };

  const handlePublish = async (asDraft = false) => {
    if (!supplierId) {
      setPublishError("Supplier account not found. Please log in again.");
      return;
    }
    setIsPublishing(true);
    setPublishError("");

    const payload = {
      productType,
      productSubType,
      ...formData.basic,
      highlights: formData.overview.highlights,
      inclusions: formData.overview.inclusions,
      exclusions: formData.overview.exclusions,
      essentialInfo: formData.overview.essentialInfo,
      itineraryItems: formData.itinerary.itineraryItems,
      priceInr: formData.pricing.priceInr,
      strikePriceInr: formData.pricing.strikePriceInr || undefined,
      ticketTiers: formData.pricing.ticketTiers,
      vehicleOptions: formData.pricing.vehicleOptions,
      hotelTiers: formData.pricing.hotelTiers,
      ...formData.settings,
      status: asDraft ? "DRAFT" : "PUBLISHED",
    };

    try {
      const res = await fetch(`/api/suppliers/${supplierId}/products/v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setPublishError(json.error || "Something went wrong.");
        setIsPublishing(false);
        return;
      }
      setPublishedId(json.productId);
      localStorage.removeItem(DRAFT_KEY);
      // Navigate to supplier dashboard
      setTimeout(() => navigate("/supplier/dashboard"), 2000);
    } catch (err) {
      setPublishError("Network error. Please try again.");
      setIsPublishing(false);
    }
  };

  // Success screen
  if (publishedId) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900">Product Published! 🎉</h1>
          <p className="mt-2 text-stone-600">Your {PRODUCT_TYPES[productType]?.label} is now live on IdeaHoliday marketplace.</p>
          <p className="mt-1 text-xs text-stone-400">Product ID: {publishedId}</p>
          <p className="mt-4 text-sm text-stone-500">Redirecting to dashboard…</p>
          <Link to="/supplier/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-6 py-3 text-sm font-bold text-white hover:bg-amber-600 transition">
            Go to Dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-stone-200 bg-white/90 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <Link to="/supplier/products/create" className="flex items-center gap-2 text-xs font-bold text-stone-500 hover:text-amber-800 transition">
            <ArrowLeft className="h-4 w-4" /> Choose type
          </Link>
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = i === step;
              const done = i < step;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  className={`hidden sm:flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all ${
                    active ? "bg-amber-100 text-amber-900" : done ? "text-stone-500 hover:text-amber-800 cursor-pointer" : "text-stone-300 cursor-default"
                  }`}
                >
                  {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                  {s.label}
                </button>
              );
            })}
            {/* Mobile step indicator */}
            <span className="sm:hidden text-xs font-bold text-stone-600">Step {step + 1}/{STEPS.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => handlePublish(true)} className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:border-stone-300 transition">
              Save Draft
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mx-auto max-w-5xl mt-2">
          <div className="h-1 rounded-full bg-stone-100">
            <div className="h-1 rounded-full bg-amber-400 transition-all duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-sm">

          {step === 0 && (
            <StepType value={formData.type} onChange={(v) => updStep("type", v)} />
          )}
          {step === 1 && (
            <StepBasicInfo data={formData.basic} onChange={(v) => updStep("basic", v)} errors={{}} />
          )}
          {step === 2 && (
            <StepOverview data={formData.overview} onChange={(v) => updStep("overview", v)} />
          )}
          {step === 3 && (
            <StepItinerary
              data={formData.itinerary}
              onChange={(v) => updStep("itinerary", v)}
              productType={productType}
              productSubType={productSubType}
            />
          )}
          {step === 4 && (
            <StepPricing
              data={formData.pricing}
              onChange={(v) => updStep("pricing", v)}
              productType={productType}
              productSubType={productSubType}
            />
          )}
          {step === 5 && (
            <StepSettings
              data={formData.settings}
              onChange={(v) => updStep("settings", v)}
              productType={productType}
              productSubType={productSubType}
            />
          )}
          {step === 6 && (
            <StepReview formData={formData} productType={productType} productSubType={productSubType} />
          )}

          {/* Error */}
          {publishError && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {publishError}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between border-t border-stone-100 pt-6">
            <button
              type="button"
              onClick={() => { setStep((s) => s - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={step === 0}
              className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm font-bold text-stone-700 hover:border-stone-300 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                disabled={!canProceed()}
                onClick={() => { setStep((s) => s + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="flex items-center gap-2 rounded-2xl bg-amber-500 px-6 py-3 text-sm font-bold text-white hover:bg-amber-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handlePublish(false)}
                disabled={isPublishing}
                className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-8 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-60"
              >
                {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {isPublishing ? "Publishing…" : "Publish to Marketplace"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
