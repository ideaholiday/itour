import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Eye,
  FileText,
  Heart,
  HelpCircle,
  IndianRupee,
  Layers,
  MapPin,
  MessageCircle,
  Navigation,
  Plus,
  QrCode,
  Save,
  Search,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import SeoHead from "../components/SeoHead.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useCurrency } from "../lib/currency.jsx";

const TIME_SLOTS = [
  { id: "MORNING", label: "Morning", icon: "🌅", time: "08:00 – 12:00" },
  { id: "AFTERNOON", label: "Afternoon", icon: "☀️", time: "12:00 – 17:00" },
  { id: "EVENING", label: "Evening", icon: "🌆", time: "17:00 – 20:00" },
  { id: "NIGHT", label: "Night", icon: "🌙", time: "20:00 onwards" },
];

export default function CircuitPlanner() {
  const { user } = useAuth();
  const { formatPrice } = useCurrency();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [templates, setTemplates] = useState([]);
  const [userItineraries, setUserItineraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeDay, setActiveDay] = useState(1);
  const [copiedLink, setCopiedLink] = useState(false);

  // Circuit Data
  const [currentId, setCurrentId] = useState(searchParams.get("id") || null);
  const [title, setTitle] = useState("My Custom India Holiday Circuit");
  const [destination, setDestination] = useState("Delhi, Agra & Jaipur");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [daysCount, setDaysCount] = useState(4);
  const [items, setItems] = useState([]);
  const [adults, setAdults] = useState(2);

  // Modal State for adding activity / note
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDay, setPickerDay] = useState(1);
  const [pickerSlot, setPickerSlot] = useState("MORNING");
  const [productSearch, setProductSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [customNote, setCustomNote] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [pickerMode, setPickerMode] = useState("search"); // "search" | "custom" | "transfer"

  // Share Modal
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Load Templates & initial itinerary
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getItineraryTemplates().catch(() => ({ templates: [] })),
      user ? api.getUserItineraries().catch(() => ({ itineraries: [] })) : Promise.resolve({ itineraries: [] }),
    ])
      .then(([tplRes, userRes]) => {
        const tpls = tplRes.templates || [];
        setTemplates(tpls);
        setUserItineraries(userRes.itineraries || []);

        const initialId = searchParams.get("id");
        if (initialId) {
          loadItineraryById(initialId, tpls);
        } else if (tpls.length > 0) {
          // Load default Golden Triangle
          loadFromTemplate(tpls[0]);
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  const loadItineraryById = (id, availableTemplates = templates) => {
    // Check templates first
    const tpl = availableTemplates.find((t) => t.id === id);
    if (tpl) {
      loadFromTemplate(tpl);
      return;
    }
    // Fetch from API
    api.getPublicItinerary(id)
      .then((res) => {
        if (res?.itinerary) {
          const itin = res.itinerary;
          setCurrentId(itin.id);
          setTitle(itin.title || "Custom Circuit");
          setDestination(itin.destination || "India");
          setStartDate(itin.startDate || new Date().toISOString().slice(0, 10));
          setDaysCount(itin.daysCount || 3);
          setItems(itin.items || []);
        }
      })
      .catch((err) => console.error("Failed to load circuit:", err));
  };

  const loadFromTemplate = (tpl) => {
    setCurrentId(null);
    setTitle(tpl.title);
    setDestination(tpl.destination);
    setDaysCount(tpl.daysCount || 4);
    setStartDate(new Date().toISOString().slice(0, 10));
    setItems(
      (tpl.items || []).map((item, idx) => ({
        id: `item_${idx + 1}`,
        dayNumber: item.dayNumber || 1,
        timeSlot: item.timeSlot || "MORNING",
        title: item.title || "Experience",
        location: item.location || tpl.destination,
        notes: item.notes || "",
        durationHours: item.durationHours || 3,
        priceInr: item.priceInr || 1500,
        type: item.type || "TOUR",
        product: item.product || null,
        productId: item.productId || null,
      }))
    );
    setActiveDay(1);
  };

  // Search activities for adding to circuit
  useEffect(() => {
    if (!pickerOpen || pickerMode !== "search") return;
    const timer = setTimeout(() => {
      setSearchLoading(true);
      const query = productSearch.trim() || destination.split(",")[0] || "Tour";
      api.search({ q: query, limit: 8 })
        .then((res) => {
          setSearchResults(res.items || res.products || []);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [pickerOpen, productSearch, pickerMode, destination]);

  // Actions
  const handleAddProduct = (prod) => {
    const newItem = {
      id: `item_${Date.now()}`,
      dayNumber: pickerDay,
      timeSlot: pickerSlot,
      title: prod.title,
      location: prod.destination || prod.city || destination,
      notes: prod.short_description || "",
      durationHours: prod.duration_hours || 3,
      priceInr: prod.price_inr || 0,
      type: prod.product_type === "TRANSFER" ? "TRANSFER" : "TOUR",
      productId: prod.id,
      product: prod,
    };
    setItems((prev) => [...prev, newItem]);
    setPickerOpen(false);
  };

  const handleAddCustomItem = () => {
    if (!customTitle.trim()) return;
    const newItem = {
      id: `item_${Date.now()}`,
      dayNumber: pickerDay,
      timeSlot: pickerSlot,
      title: customTitle.trim(),
      location: destination,
      notes: customNote.trim(),
      durationHours: 2,
      priceInr: Number(customPrice) || 0,
      type: "CUSTOM",
      product: null,
      productId: null,
    };
    setItems((prev) => [...prev, newItem]);
    setCustomTitle("");
    setCustomNote("");
    setCustomPrice("");
    setPickerOpen(false);
  };

  const handleRemoveItem = (itemId) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleSaveCircuit = async () => {
    if (!user) {
      navigate(`/login?redirect=/circuit-planner`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title,
        destination,
        startDate,
        daysCount,
        items,
        isPublic: true,
      };
      let res;
      if (currentId && !currentId.startsWith("template_")) {
        res = await api.updateItinerary(currentId, payload);
      } else {
        res = await api.createItinerary(payload);
        if (res?.itinerary?.id) {
          setCurrentId(res.itinerary.id);
          setSearchParams({ id: res.itinerary.id });
        }
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save itinerary:", err);
    } finally {
      setSaving(false);
    }
  };

  // Calculations
  const calculatedTotalInr = useMemo(() => {
    return items.reduce((sum, item) => {
      const p = item.product?.price_inr || item.priceInr || 0;
      return sum + (p * adults);
    }, 0);
  }, [items, adults]);

  const totalExperienceHours = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.durationHours || 2), 0);
  }, [items]);

  const itemsByDay = useMemo(() => {
    const map = {};
    for (let d = 1; d <= daysCount; d++) {
      map[d] = [];
    }
    items.forEach((item) => {
      const d = item.dayNumber || 1;
      if (!map[d]) map[d] = [];
      map[d].push(item);
    });
    return map;
  }, [items, daysCount]);

  const shareableUrl = currentId ? `${window.location.origin}/circuit-planner?id=${currentId}` : window.location.href;

  const shareViaWhatsApp = () => {
    let msg = `🗺️ *${title}* (${daysCount} Days)\n`;
    msg += `📍 Destination: ${destination}\n`;
    msg += `💰 Estimated Budget: ₹${calculatedTotalInr.toLocaleString("en-IN")} for ${adults} travelers\n\n`;
    msg += `*Day-by-Day Circuit Plan:*\n`;

    for (let d = 1; d <= daysCount; d++) {
      msg += `\n*Day ${d}:*\n`;
      const dayList = itemsByDay[d] || [];
      if (dayList.length === 0) {
        msg += `  • Leisure & Free Exploration\n`;
      } else {
        dayList.forEach((it) => {
          const icon = it.timeSlot === "MORNING" ? "🌅" : it.timeSlot === "AFTERNOON" ? "☀️" : it.timeSlot === "EVENING" ? "🌆" : "🌙";
          msg += `  ${icon} [${it.timeSlot}] ${it.title}\n`;
        });
      }
    }
    msg += `\nExplore & customize on Idea Holiday: ${shareableUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900">
      <SeoHead
        title="Multi-Day Circuit Planner & Trip Builder | Idea Holiday"
        description="Design your custom multi-day India holiday circuit. Combine sightseeing tours, private airport cabs, and day-by-day itineraries with real-time budget calculation."
      />

      {/* ─── TOP HERO & CONTROLS ────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-stone-950 via-stone-900 to-amber-950 text-white pt-10 pb-8 px-4 sm:px-6 lg:px-8 border-b border-stone-800 shadow-lg">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 border border-amber-400/30 px-3 py-0.5 text-xs font-bold text-amber-300 uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Build My Circuit • Multi-Day Planner</span>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent font-display text-2xl sm:text-4xl font-extrabold text-white tracking-tight border-b border-transparent hover:border-stone-700 focus:border-amber-400 focus:outline-none transition"
                placeholder="Give your journey a name..."
              />
              <p className="text-xs sm:text-sm text-stone-300">
                Assemble tours, private highway transfers, and custom stops into a personalized day-by-day circuit.
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={handleSaveCircuit}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs sm:text-sm font-bold px-4 py-2.5 shadow-md transition cursor-pointer"
              >
                {saveSuccess ? <Check className="h-4 w-4 text-emerald-300" /> : <Save className="h-4 w-4" />}
                <span>{saveSuccess ? "Circuit Saved!" : saving ? "Saving..." : "Save Circuit"}</span>
              </button>

              <button
                onClick={() => setShareModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white text-xs sm:text-sm font-bold px-4 py-2.5 border border-stone-700 transition cursor-pointer"
              >
                <Share2 className="h-4 w-4 text-amber-300" />
                <span>Share</span>
              </button>
            </div>
          </div>

          {/* Circuit Filter & Specs Bar */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-900/90 border border-stone-800 rounded-2xl p-4">
            <div>
              <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">Destination</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full bg-transparent text-sm font-bold text-white focus:outline-none mt-1"
                placeholder="e.g. Rajasthan, Kerala"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-transparent text-sm font-bold text-white focus:outline-none mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">Duration (Days)</label>
              <select
                value={daysCount}
                onChange={(e) => setDaysCount(Number(e.target.value))}
                className="w-full bg-transparent text-sm font-bold text-white focus:outline-none mt-1"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map((d) => (
                  <option key={d} value={d} className="bg-stone-900 text-white">{d} Days</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">Travelers</label>
              <div className="flex items-center gap-2 mt-1">
                <Users className="h-4 w-4 text-stone-400" />
                <select
                  value={adults}
                  onChange={(e) => setAdults(Number(e.target.value))}
                  className="bg-transparent text-sm font-bold text-white focus:outline-none"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((pax) => (
                    <option key={pax} value={pax} className="bg-stone-900 text-white">{pax} {pax === 1 ? "Adult" : "Adults"}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CURATED INSPIRATION TEMPLATES CAROUSEL ─────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-700" />
            <h2 className="text-sm sm:text-base font-bold text-stone-900 uppercase tracking-wide">
              Iconic Pre-Built Circuit Inspirations
            </h2>
          </div>
          <span className="text-xs text-stone-500">1-click to customize & edit</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              onClick={() => loadFromTemplate(tpl)}
              className="group cursor-pointer rounded-2xl bg-white p-4 border border-stone-200 hover:border-amber-500 hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="relative h-32 w-full rounded-xl overflow-hidden mb-3 bg-stone-100">
                  <img
                    src={tpl.heroImage}
                    alt={tpl.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <span className="absolute top-2 left-2 rounded-full bg-stone-950/80 text-white text-[10px] font-bold px-2 py-0.5 backdrop-blur-sm">
                    {tpl.daysCount} Days
                  </span>
                </div>
                <h3 className="font-bold text-stone-900 text-sm group-hover:text-amber-800 transition line-clamp-1">
                  {tpl.title}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">{tpl.subtitle}</p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-stone-100 mt-3 text-xs">
                <span className="font-mono font-bold text-stone-900">
                  From ₹{tpl.estimatedBudgetInr?.toLocaleString("en-IN")}
                </span>
                <span className="text-amber-800 font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition">
                  Load <ChevronRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── MAIN BUILDER & SIDEBAR ─────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid gap-8 lg:grid-cols-12">

          {/* LEFT: DAY-BY-DAY TIMELINE (8 cols) */}
          <div className="lg:col-span-8 space-y-6">

            {/* Day Selector Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              {Array.from({ length: daysCount }).map((_, idx) => {
                const dayNum = idx + 1;
                const count = (itemsByDay[dayNum] || []).length;
                const isSelected = activeDay === dayNum;
                return (
                  <button
                    key={dayNum}
                    onClick={() => setActiveDay(dayNum)}
                    className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs sm:text-sm font-bold shrink-0 transition cursor-pointer ${
                      isSelected
                        ? "bg-amber-800 text-white shadow-md"
                        : "bg-white text-stone-700 hover:bg-stone-100 border border-stone-200"
                    }`}
                  >
                    <span>Day {dayNum}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600"
                    }`}>
                      {count} {count === 1 ? "act" : "acts"}
                    </span>
                  </button>
                );
              })}

              <button
                onClick={() => setDaysCount((prev) => Math.min(14, prev + 1))}
                className="flex items-center gap-1.5 rounded-2xl border-2 border-dashed border-stone-300 hover:border-amber-500 bg-white/50 px-3.5 py-2.5 text-xs font-bold text-stone-600 hover:text-amber-800 transition shrink-0 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Day</span>
              </button>
            </div>

            {/* Active Day Card & Time Slots */}
            <div className="rounded-3xl bg-white border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-stone-900">
                    Day {activeDay} Schedule
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Plan your morning, afternoon, evening and night activities
                  </p>
                </div>
                <span className="text-xs font-mono font-bold bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1 rounded-full">
                  {(itemsByDay[activeDay] || []).length} scheduled
                </span>
              </div>

              {/* 4 Time Slots */}
              <div className="space-y-6">
                {TIME_SLOTS.map((slot) => {
                  const slotItems = (itemsByDay[activeDay] || []).filter((i) => i.timeSlot === slot.id);

                  return (
                    <div key={slot.id} className="rounded-2xl border border-stone-200/80 bg-stone-50/50 p-4 sm:p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{slot.icon}</span>
                          <h4 className="text-xs sm:text-sm font-bold text-stone-900 uppercase tracking-wide">
                            {slot.label}
                          </h4>
                          <span className="text-[11px] font-mono text-stone-400">({slot.time})</span>
                        </div>

                        <button
                          onClick={() => {
                            setPickerDay(activeDay);
                            setPickerSlot(slot.id);
                            setPickerMode("search");
                            setPickerOpen(true);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200/70 rounded-xl px-2.5 py-1 transition cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Add Activity</span>
                        </button>
                      </div>

                      {/* Items in Slot */}
                      {slotItems.length === 0 ? (
                        <div className="py-4 text-center border-2 border-dashed border-stone-200 rounded-xl bg-white/50">
                          <p className="text-xs text-stone-400 font-medium">Free time for leisure or rest</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {slotItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-start justify-between gap-4 rounded-xl bg-white p-4 border border-stone-200 shadow-xs hover:border-amber-300 transition"
                            >
                              <div className="flex items-start gap-3">
                                {item.product?.hero_image ? (
                                  <img
                                    src={item.product.hero_image}
                                    alt={item.title}
                                    className="h-14 w-14 rounded-lg object-cover shrink-0 border border-stone-100"
                                  />
                                ) : (
                                  <div className="h-14 w-14 rounded-lg bg-amber-50 border border-amber-200 grid place-items-center text-amber-800 text-lg shrink-0">
                                    {item.type === "TRANSFER" ? "🚗" : "📍"}
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                      item.type === "TRANSFER" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"
                                    }`}>
                                      {item.type}
                                    </span>
                                    <span className="text-xs text-stone-500 font-medium">{item.location}</span>
                                  </div>
                                  <h5 className="text-xs sm:text-sm font-bold text-stone-900 leading-snug">
                                    {item.title}
                                  </h5>
                                  {item.notes && (
                                    <p className="text-xs text-stone-500 italic">
                                      📝 {item.notes}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col items-end justify-between shrink-0 space-y-2">
                                <span className="font-mono text-xs sm:text-sm font-bold text-stone-900">
                                  ₹{((item.product?.price_inr || item.priceInr || 0) * adults).toLocaleString("en-IN")}
                                </span>
                                <button
                                  onClick={() => handleRemoveItem(item.id)}
                                  className="text-stone-400 hover:text-rose-600 transition p-1 cursor-pointer"
                                  title="Remove from circuit"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: BUDGET & SUMMARY SIDEBAR (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-3xl bg-white border border-stone-200 p-6 shadow-md sticky top-24 space-y-6">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                  Circuit Summary
                </span>
                <h3 className="font-display text-2xl font-bold text-stone-900 mt-2">
                  Trip Overview
                </h3>
              </div>

              <div className="space-y-3 divide-y divide-stone-100 text-xs sm:text-sm">
                <div className="flex justify-between items-center py-2">
                  <span className="text-stone-600">Total Duration:</span>
                  <span className="font-bold text-stone-900">{daysCount} Days</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-stone-600">Total Scheduled Items:</span>
                  <span className="font-bold text-stone-900">{items.length} Activities</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-stone-600">Total Experience Time:</span>
                  <span className="font-bold text-stone-900">~{totalExperienceHours} Hours</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-stone-600">Group Size:</span>
                  <span className="font-bold text-stone-900">{adults} {adults === 1 ? "Traveler" : "Travelers"}</span>
                </div>
              </div>

              {/* Price Calculation Box */}
              <div className="rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-stone-50 border border-amber-200/80 p-4 text-center">
                <span className="text-xs font-bold text-stone-600 uppercase tracking-wide block">
                  Estimated Total Budget
                </span>
                <span className="text-3xl sm:text-4xl font-extrabold font-mono text-amber-950 mt-1 block">
                  ₹{calculatedTotalInr.toLocaleString("en-IN")}
                </span>
                <span className="text-[11px] text-stone-500 mt-1 block font-medium">
                  Includes tours, transfers & experiences for {adults} pax
                </span>
              </div>

              <div className="space-y-2.5">
                <button
                  onClick={handleSaveCircuit}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white py-3.5 px-4 text-sm font-bold shadow-md transition cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  <span>Save to My Circuits</span>
                </button>

                <button
                  onClick={shareViaWhatsApp}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white py-3 px-4 text-xs font-bold shadow-sm transition cursor-pointer"
                >
                  <MessageCircle className="h-4 w-4 fill-white" />
                  <span>Send Circuit on WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── ADD ACTIVITY / NOTE MODAL ──────────────────────────────────── */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl border border-stone-100 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900">
                  Add to Day {pickerDay} ({pickerSlot})
                </h3>
                <p className="text-xs text-stone-500">Attach marketplace experiences or custom notes</p>
              </div>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Tab switch */}
            <div className="flex gap-2 border-b border-stone-200 pb-2">
              <button
                onClick={() => setPickerMode("search")}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  pickerMode === "search" ? "bg-amber-800 text-white" : "bg-stone-100 text-stone-600"
                }`}
              >
                Marketplace Tours
              </button>
              <button
                onClick={() => setPickerMode("custom")}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  pickerMode === "custom" ? "bg-amber-800 text-white" : "bg-stone-100 text-stone-600"
                }`}
              >
                Custom Note / Meal
              </button>
            </div>

            {/* Tab 1: Marketplace Search */}
            {pickerMode === "search" && (
              <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search tours, attractions, boat cruises..."
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-4 py-2 text-xs text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                  />
                </div>

                {searchLoading ? (
                  <div className="py-8 text-center text-xs text-stone-500">Searching activities…</div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((prod) => (
                      <div
                        key={prod.id}
                        onClick={() => handleAddProduct(prod)}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 hover:border-amber-500 hover:bg-amber-50/50 cursor-pointer transition"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={prod.hero_image || "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=200"}
                            alt={prod.title}
                            className="h-12 w-12 rounded-lg object-cover shrink-0"
                          />
                          <div>
                            <h4 className="text-xs font-bold text-stone-900 line-clamp-1">{prod.title}</h4>
                            <span className="text-[11px] text-stone-500">{prod.destination || prod.city} • {prod.duration_hours || 3}h</span>
                          </div>
                        </div>
                        <span className="font-mono text-xs font-bold text-stone-900 shrink-0">
                          ₹{prod.price_inr?.toLocaleString("en-IN")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Custom Note */}
            {pickerMode === "custom" && (
              <div className="space-y-3 flex-1">
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">Activity / Stop Title</label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="e.g. Hotel Check-in / Dinner at Karim's"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs focus:outline-none focus:border-amber-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">Estimated Cost (INR)</label>
                  <input
                    type="number"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs focus:outline-none focus:border-amber-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">Notes / Instructions</label>
                  <textarea
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                    placeholder="e.g. Table booked under Sharma party. Bring camera."
                    rows={3}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs focus:outline-none focus:border-amber-600"
                  />
                </div>
                <button
                  onClick={handleAddCustomItem}
                  disabled={!customTitle.trim()}
                  className="w-full rounded-xl bg-amber-800 hover:bg-amber-900 text-white py-2.5 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  Add Custom Item
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── SHARE MODAL ────────────────────────────────────────────────── */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-stone-100 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-lg font-bold text-stone-900">Share Your Circuit</h3>
              <button onClick={() => setShareModalOpen(false)} className="text-stone-400 hover:text-stone-700 text-lg font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Anyone with this link can view this full day-by-day journey circuit, export to WhatsApp, or customize their own version.
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareableUrl}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-mono text-stone-600 select-all focus:outline-none"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareableUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="rounded-xl bg-stone-900 hover:bg-stone-800 text-white p-2.5 text-xs font-bold transition shrink-0 cursor-pointer"
              >
                {copiedLink ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <button
              onClick={shareViaWhatsApp}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white py-3 px-4 text-xs font-bold shadow-md transition cursor-pointer"
            >
              <MessageCircle className="h-4 w-4 fill-white" />
              <span>Share Formatted Summary on WhatsApp</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
