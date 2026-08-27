import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BookMarked,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Edit3,
  Eye,
  FileText,
  GripVertical,
  Heart,
  HelpCircle,
  IndianRupee,
  Layers,
  ListOrdered,
  Map,
  MapPin,
  MessageCircle,
  Navigation,
  Plus,
  Printer,
  QrCode,
  Save,
  Search,
  Send,
  Share2,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import SeoHead from "../components/SeoHead.jsx";
import CircuitRouteMapView from "../components/traveler/CircuitRouteMapView.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useCurrency } from "../lib/currency.jsx";
import { printCircuitPlan } from "../lib/circuitPrint.js";

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
  const [inspirationTab, setInspirationTab] = useState("TEMPLATES"); // "TEMPLATES" | "SAVED"
  const [viewMode, setViewMode] = useState("TIMELINE"); // "TIMELINE" | "MAP"
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [activeDay, setActiveDay] = useState(1);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activityAddedBanner, setActivityAddedBanner] = useState(null);
  const [draftRestoredBanner, setDraftRestoredBanner] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [orderCreating, setOrderCreating] = useState(false);
  const [circuitQuote, setCircuitQuote] = useState(null);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);

  // Circuit Data
  const [currentId, setCurrentId] = useState(searchParams.get("id") || null);
  const [title, setTitle] = useState("My Custom India Holiday Circuit");
  const [destination, setDestination] = useState("Delhi, Agra & Jaipur");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [daysCount, setDaysCount] = useState(4);
  const [items, setItems] = useState([]);
  const [adults, setAdults] = useState(2);
  const [childrenCount, setChildrenCount] = useState(0);

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

  // Modal State for editing item
  const [editItemModalOpen, setEditItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Share Modal
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Computed End Date
  const endDate = useMemo(() => {
    if (!startDate) return "";
    try {
      const d = new Date(startDate);
      if (isNaN(d.getTime())) return startDate;
      d.setDate(d.getDate() + Math.max(0, daysCount - 1));
      return d.toISOString().slice(0, 10);
    } catch {
      return startDate;
    }
  }, [startDate, daysCount]);

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const getDayCalendarInfo = (dayIndex) => {
    if (!startDate) return { dateStr: "", weekday: "" };
    try {
      const d = new Date(startDate);
      if (isNaN(d.getTime())) return { dateStr: "", weekday: "" };
      d.setDate(d.getDate() + dayIndex);
      return {
        dateStr: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        weekday: d.toLocaleDateString("en-IN", { weekday: "short" }),
      };
    } catch {
      return { dateStr: "", weekday: "" };
    }
  };

  // Load Templates & initial itinerary
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getItineraryTemplates().catch(() => ({ templates: [] })),
      user ? api.getUserItineraries().catch(() => ({ itineraries: [] })) : Promise.resolve({ itineraries: [] }),
    ])
      .then(async ([tplRes, userRes]) => {
        const tpls = tplRes.templates || [];
        setTemplates(tpls);
        setUserItineraries(userRes.itineraries || []);

        const initialId = searchParams.get("id");
        const addActivityId = searchParams.get("addActivityId");
        const paramDest = searchParams.get("destination");

        if (initialId) {
          loadItineraryById(initialId, tpls);
        } else if (addActivityId) {
          // Pre-populate with deep linked activity
          if (paramDest) {
            setDestination(paramDest);
            setTitle(`${paramDest} Custom Holiday Circuit`);
          }
          try {
            const prod = await api.getActivity(addActivityId);
            if (prod) {
              const addedItem = {
                id: `item_${Date.now()}`,
                dayNumber: 1,
                timeSlot: "MORNING",
                title: prod.title,
                location: prod.destination || prod.city || paramDest || "India",
                notes: prod.short_description || prod.shortDesc || "",
                durationHours: prod.duration_hours || prod.durationHours || 3,
                priceInr: prod.price_inr || prod.priceInr || 0,
                type: prod.product_type === "TRANSFER" ? "TRANSFER" : "TOUR",
                productId: prod.id,
                product: prod,
              };
              setItems([addedItem]);
              if (prod.destination || prod.city) {
                setDestination(prod.destination || prod.city);
                setTitle(`${prod.destination || prod.city} Multi-Day Holiday Circuit`);
              }
              setActivityAddedBanner(`Added "${prod.title}" to Day 1 Morning!`);
              setTimeout(() => setActivityAddedBanner(null), 6000);
            }
          } catch (e) {
            console.error("Failed to load deep-linked activity:", e);
            if (tpls.length > 0) loadFromTemplate(tpls[0]);
          }
        } else {
          // Check for saved local draft
          let restored = false;
          try {
            const rawDraft = localStorage.getItem("idea_holiday_circuit_draft");
            if (rawDraft) {
              const draft = JSON.parse(rawDraft);
              if (draft && Array.isArray(draft.items) && draft.items.length > 0) {
                setTitle(draft.title || "My Custom India Holiday Circuit");
                setDestination(draft.destination || "India");
                setStartDate(draft.startDate || new Date().toISOString().slice(0, 10));
                setDaysCount(draft.daysCount || 4);
                setAdults(draft.adults ?? 2);
                setChildrenCount(draft.childrenCount ?? 0);
                setItems(draft.items || []);
                setDraftRestoredBanner(true);
                restored = true;
              }
            }
          } catch {}

          if (!restored && tpls.length > 0) {
            loadFromTemplate(tpls[0]);
          }
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
          setStartDate(itin.travelDate || itin.startDate || new Date().toISOString().slice(0, 10));
          setDaysCount(itin.daysCount || 3);
          setAdults(itin.adultsCount ?? itin.adults ?? 2);
          setChildrenCount(itin.childrenCount ?? itin.children ?? 0);
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
    setAdults(2);
    setChildrenCount(0);
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
      notes: prod.short_description || prod.shortDesc || "",
      durationHours: prod.duration_hours || prod.durationHours || 3,
      priceInr: prod.price_inr || prod.priceInr || 0,
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

  const handleSaveCircuit = async (options = {}) => {
    const throwOnError = options?.throwOnError === true;
    if (!user) {
      navigate(`/login?from=${encodeURIComponent("/circuit-planner")}`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        title,
        destination,
        startDate,
        travelDate: startDate,
        endDate,
        daysCount,
        adultsCount: adults,
        childrenCount,
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

      // Clear local unsaved draft once saved to account
      try {
        localStorage.removeItem("idea_holiday_circuit_draft");
      } catch {}

      // Refresh saved circuits list
      if (user) {
        api.getUserItineraries()
          .then((uRes) => {
            if (uRes?.itineraries) setUserItineraries(uRes.itineraries);
          })
          .catch(() => {});
      }
      return res?.itinerary || null;
    } catch (err) {
      console.error("Failed to save itinerary:", err);
      setSaveError(err.message || "Unable to save circuit. Please check your details.");
      if (throwOnError) throw err;
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Auto-save unsaved draft to localStorage
  useEffect(() => {
    if (loading) return;
    if (!currentId && items.length > 0) {
      try {
        localStorage.setItem(
          "idea_holiday_circuit_draft",
          JSON.stringify({
            title,
            destination,
            startDate,
            daysCount,
            adults,
            childrenCount,
            items,
            updatedAt: Date.now(),
          })
        );
      } catch {}
    }
  }, [title, destination, startDate, daysCount, adults, childrenCount, items, currentId, loading]);

  const handleClearDraft = () => {
    try {
      localStorage.removeItem("idea_holiday_circuit_draft");
    } catch {}
    setDraftRestoredBanner(false);
    if (templates.length > 0) {
      loadFromTemplate(templates[0]);
    }
  };

  const handleOpenEditItem = (item) => {
    setEditingItem({
      ...item,
      priceInr: item.priceInr ?? item.product?.price_inr ?? item.product?.priceInr ?? 0,
      durationHours: item.durationHours ?? item.product?.duration_hours ?? 2,
    });
    setEditItemModalOpen(true);
  };

  const handleSaveEditedItem = () => {
    if (!editingItem) return;
    setItems((prev) =>
      prev.map((i) => (i.id === editingItem.id ? { ...editingItem } : i))
    );
    setEditItemModalOpen(false);
    setEditingItem(null);
    setActivityAddedBanner("Activity details updated!");
    setTimeout(() => setActivityAddedBanner(null), 3000);
  };

  const handleDeleteDay = (dayToDelete) => {
    if (daysCount <= 1) return;
    if (
      !window.confirm(
        `Are you sure you want to remove Day ${dayToDelete}? All scheduled activities on this day will be deleted and remaining days will be shifted.`
      )
    ) {
      return;
    }
    setItems((prev) => {
      return prev
        .filter((it) => it.dayNumber !== dayToDelete)
        .map((it) => {
          if (it.dayNumber > dayToDelete) {
            return { ...it, dayNumber: it.dayNumber - 1 };
          }
          return it;
        });
    });
    setDaysCount((prev) => Math.max(1, prev - 1));
    setActiveDay((prev) => (prev >= dayToDelete ? Math.max(1, prev - 1) : prev));
    setActivityAddedBanner(`Day ${dayToDelete} removed from circuit.`);
    setTimeout(() => setActivityAddedBanner(null), 3000);
  };

  const handleMoveItemToSlot = (itemId, targetDay, targetSlot) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === itemId) {
          return { ...it, dayNumber: targetDay, timeSlot: targetSlot };
        }
        return it;
      })
    );
    setDraggedItemId(null);
    setActivityAddedBanner(`Moved activity to Day ${targetDay} (${targetSlot})`);
    setTimeout(() => setActivityAddedBanner(null), 2500);
  };

  const handleMoveItemToDay = (itemId, targetDay) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === itemId) {
          return { ...it, dayNumber: targetDay };
        }
        return it;
      })
    );
    setDraggedItemId(null);
    setActivityAddedBanner(`Moved activity to Day ${targetDay}`);
    setTimeout(() => setActivityAddedBanner(null), 2500);
  };

  const handleBookEntireCircuit = async () => {
    if (!items || items.length === 0) {
      alert("Your circuit itinerary is currently empty. Please add at least one tour, activity, or transfer to proceed!");
      return;
    }

    if (!user) {
      navigate(`/login?from=${encodeURIComponent(`/circuit-planner${currentId ? `?id=${currentId}` : ""}`)}`);
      return;
    }

    setQuoteLoading(true);
    setSaveError(null);
    try {
      const saved = await handleSaveCircuit({ throwOnError: true });
      const itineraryId = saved?.id || currentId;
      if (!itineraryId || itineraryId.startsWith("template_")) {
        throw new Error("Save this circuit to your account before requesting a live quote.");
      }
      const response = await api.createCircuitQuote(itineraryId, {
        startDate,
        adultsCount: adults,
        childrenCount,
      });
      setCircuitQuote(response.quote);
      setQuoteModalOpen(true);
      setActivityAddedBanner("Your server-verified circuit quote is ready.");
      setTimeout(() => setActivityAddedBanner(null), 3500);
    } catch (error) {
      setSaveError(error.message || "We could not price this circuit right now.");
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleContinueToCircuitCheckout = async () => {
    if (!circuitQuote || circuitQuote.status !== "READY") return;
    if (new Date(circuitQuote.expiresAt).getTime() <= Date.now()) {
      setSaveError("This circuit quote has expired. Refresh the live quote before reserving inventory.");
      return;
    }
    setOrderCreating(true);
    setSaveError(null);
    const storageKey = `idea_holiday_circuit_order:${circuitQuote.quoteId}`;
    try {
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch {}
      if (stored?.orderId) {
        try {
          const existing = await api.getCircuitOrder(stored.orderId);
          const destinationPath = existing.order.status === "CONFIRMED"
            ? `/circuit-confirmed/${encodeURIComponent(existing.order.orderRef)}`
            : `/circuit-checkout/${encodeURIComponent(existing.order.orderId)}`;
          navigate(destinationPath);
          return;
        } catch {
          try { localStorage.removeItem(storageKey); } catch {}
        }
      }

      const idempotencyKey = stored?.idempotencyKey
        || `circuit-ui-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          quoteId: circuitQuote.quoteId,
          idempotencyKey,
          orderId: stored?.orderId || null,
          orderRef: stored?.orderRef || null,
        }));
      } catch {}
      const response = await api.createCircuitOrder({ quoteId: circuitQuote.quoteId }, idempotencyKey);
      const order = response.order;
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          quoteId: circuitQuote.quoteId,
          idempotencyKey,
          orderId: order.orderId,
          orderRef: order.orderRef,
        }));
      } catch {}
      navigate(`/circuit-checkout/${encodeURIComponent(order.orderId)}`);
    } catch (error) {
      if (error.code === "QUOTE_ALREADY_CONSUMED" && error.details?.circuitOrderId) {
        navigate(`/circuit-checkout/${encodeURIComponent(error.details.circuitOrderId)}`);
        return;
      }
      setSaveError(error.message || "We could not reserve this circuit for checkout.");
    } finally {
      setOrderCreating(false);
    }
  };

  const handlePrintItinerary = () => {
    try {
      printCircuitPlan({
        title,
        destination,
        startDate,
        endDate,
        daysCount,
        adults,
        childrenCount,
        itemsByDay,
        estimatedTotal: calculatedTotalInr,
        quote: circuitQuote,
        shareableUrl,
      });
    } catch (error) {
      setSaveError(error.message || "The print preview could not be opened.");
    }
  };

  const handleCloneCircuit = async (itinId, e) => {
    if (e) e.stopPropagation();
    if (!user) {
      navigate(`/login?from=${encodeURIComponent("/circuit-planner")}`);
      return;
    }
    try {
      const res = await api.cloneItinerary(itinId);
      if (res?.itinerary) {
        setActivityAddedBanner(`Cloned circuit "${res.itinerary.title}"!`);
        setTimeout(() => setActivityAddedBanner(null), 4000);
        api.getUserItineraries()
          .then((uRes) => {
            if (uRes?.itineraries) setUserItineraries(uRes.itineraries);
          })
          .catch(() => {});
        loadItineraryFromObject(res.itinerary);
      }
    } catch (err) {
      console.error("Failed to clone circuit:", err);
      setSaveError("Failed to clone circuit.");
    }
  };

  const handleDeleteCircuit = async (itinId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this saved circuit?")) return;
    try {
      await api.deleteItinerary(itinId);
      setUserItineraries((prev) => prev.filter((i) => i.id !== itinId));
      if (currentId === itinId) {
        setCurrentId(null);
        setSearchParams({});
      }
      setActivityAddedBanner("Circuit deleted successfully.");
      setTimeout(() => setActivityAddedBanner(null), 3000);
    } catch (err) {
      console.error("Failed to delete circuit:", err);
      setSaveError("Failed to delete circuit.");
    }
  };

  const loadItineraryFromObject = (itin) => {
    setCurrentId(itin.id);
    setTitle(itin.title || "Custom Circuit");
    setDestination(itin.destination || "India");
    setStartDate(itin.travelDate || itin.startDate || new Date().toISOString().slice(0, 10));
    setDaysCount(itin.daysCount || 3);
    setAdults(itin.adultsCount ?? itin.adults ?? 2);
    setChildrenCount(itin.childrenCount ?? itin.children ?? 0);
    setItems(itin.items || []);
    setActiveDay(1);
    setSearchParams({ id: itin.id });
    const el = document.getElementById("circuit-timeline-builder");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  // Calculations
  const calculatedTotalInr = useMemo(() => {
    return items.reduce((sum, item) => {
      const p = item.product?.price_inr || item.product?.priceInr || item.priceInr || 0;
      if (item.type === "TRANSFER") {
        // Vehicle fixed cost
        return sum + p;
      }
      const adultCost = p * adults;
      const childCost = Math.round(p * 0.7) * childrenCount;
      return sum + adultCost + childCost;
    }, 0);
  }, [items, adults, childrenCount]);

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
  const quoteReady = circuitQuote?.status === "READY" && new Date(circuitQuote.expiresAt).getTime() > Date.now();

  const shareViaWhatsApp = () => {
    const dateRange = `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`;
    const guestLabel = `${adults} Adults${childrenCount > 0 ? `, ${childrenCount} Child${childrenCount > 1 ? "ren" : ""}` : ""}`;

    let msg = `🗺️ *${title}* (${daysCount} Days)\n`;
    msg += `📍 Destination: ${destination}\n`;
    msg += `📅 Travel Dates: ${dateRange}\n`;
    msg += `👥 Travelers: ${guestLabel}\n`;
    msg += `💰 Estimated Budget: ₹${calculatedTotalInr.toLocaleString("en-IN")}\n\n`;
    msg += `*Day-by-Day Circuit Plan:*\n`;

    for (let d = 1; d <= daysCount; d++) {
      const dayCal = getDayCalendarInfo(d - 1);
      const dayHeader = dayCal.dateStr ? `Day ${d} (${dayCal.dateStr}, ${dayCal.weekday})` : `Day ${d}`;
      msg += `\n*${dayHeader}:*\n`;
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

      {/* Activity Added Alert Banner */}
      {activityAddedBanner && (
        <div className="bg-emerald-600 text-white text-xs sm:text-sm font-bold py-2.5 px-4 text-center sticky top-0 z-40 shadow-md flex items-center justify-center gap-2">
          <Check className="h-4 w-4 shrink-0" />
          <span>{activityAddedBanner}</span>
        </div>
      )}

      {/* Draft Restored Banner */}
      {draftRestoredBanner && (
        <div className="bg-amber-900 text-amber-100 text-xs sm:text-sm font-medium py-2.5 px-4 sticky top-0 z-40 shadow-md flex items-center justify-between border-b border-amber-800">
          <div className="flex items-center gap-2 mx-auto">
            <Sparkles className="h-4 w-4 text-amber-300 shrink-0" />
            <span>Restored your unsaved circuit draft from earlier.</span>
            <button
              onClick={handleClearDraft}
              className="underline font-bold text-white hover:text-amber-200 ml-2 cursor-pointer"
            >
              Reset to Default
            </button>
          </div>
          <button
            onClick={() => setDraftRestoredBanner(false)}
            className="text-amber-200 font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Shared Circuit Plan Banner */}
      {searchParams.get("id") && currentId && (
        <div className="bg-gradient-to-r from-amber-800 to-amber-900 text-white text-xs sm:text-sm font-semibold py-2.5 px-4 sticky top-0 z-40 shadow-md flex items-center justify-between border-b border-amber-700">
          <div className="flex items-center gap-2 mx-auto">
            <Sparkles className="h-4 w-4 text-amber-300 shrink-0" />
            <span>Viewing shared circuit &ldquo;{title}&rdquo;. You can customize any stop or save a copy to your account!</span>
            <button
              onClick={(e) => handleCloneCircuit(currentId, e)}
              className="ml-3 inline-flex items-center gap-1.5 bg-white text-amber-950 px-3 py-1 rounded-xl text-xs font-bold hover:bg-amber-100 transition cursor-pointer shadow-sm"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Clone & Customize</span>
            </button>
          </div>
        </div>
      )}

      {/* Save Error Alert Banner */}
      {saveError && (
        <div className="bg-rose-600 text-white text-xs sm:text-sm font-bold py-2.5 px-4 text-center sticky top-0 z-40 shadow-md flex items-center justify-between">
          <div className="flex items-center gap-2 mx-auto">
            <HelpCircle className="h-4 w-4 shrink-0" />
            <span>{saveError}</span>
          </div>
          <button onClick={() => setSaveError(null)} className="text-white font-bold p-1 cursor-pointer">✕</button>
        </div>
      )}

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
                onClick={handlePrintItinerary}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white text-xs sm:text-sm font-bold px-4 py-2.5 border border-stone-700 transition cursor-pointer"
                title="Preview or save this trip plan as PDF"
              >
                <Printer className="h-4 w-4 text-amber-300" />
                <span>Print / PDF</span>
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
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-stone-900/90 border border-stone-800 rounded-2xl p-4 sm:p-5">
            <div>
              <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">Destination</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full bg-transparent text-sm font-bold text-white focus:outline-none mt-1.5"
                placeholder="e.g. Rajasthan, Kerala, Goa"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">Travel Date</label>
                {endDate && (
                  <span className="text-[10px] text-amber-300 font-mono font-semibold">
                    End: {formatDisplayDate(endDate)}
                  </span>
                )}
              </div>
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-transparent text-sm font-bold text-white focus:outline-none mt-1.5 [color-scheme:dark]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">Duration</label>
              <select
                value={daysCount}
                onChange={(e) => setDaysCount(Number(e.target.value))}
                className="w-full bg-transparent text-sm font-bold text-white focus:outline-none mt-1.5"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map((d) => (
                  <option key={d} value={d} className="bg-stone-900 text-white">{d} Days</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">Travelers (Guests)</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="flex items-center gap-1.5 bg-stone-800/80 rounded-xl px-2.5 py-1 border border-stone-700">
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Adults:</span>
                  <select
                    value={adults}
                    onChange={(e) => setAdults(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-white focus:outline-none w-full"
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map((pax) => (
                      <option key={pax} value={pax} className="bg-stone-900 text-white">{pax}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 bg-stone-800/80 rounded-xl px-2.5 py-1 border border-stone-700">
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Child:</span>
                  <select
                    value={childrenCount}
                    onChange={(e) => setChildrenCount(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-white focus:outline-none w-full"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 8, 10].map((c) => (
                      <option key={c} value={c} className="bg-stone-900 text-white">{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── INSPIRATIONS & SAVED CIRCUITS TABS ─────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-stone-200 pb-3">
          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setInspirationTab("TEMPLATES")}
              className={`flex items-center gap-2 pb-2.5 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer shrink-0 ${
                inspirationTab === "TEMPLATES"
                  ? "border-amber-800 text-amber-900"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>Pre-Built Inspirations</span>
              <span className="bg-amber-100 text-amber-900 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full font-mono">
                {templates.length}
              </span>
            </button>

            <button
              onClick={() => setInspirationTab("SAVED")}
              className={`flex items-center gap-2 pb-2.5 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer shrink-0 ${
                inspirationTab === "SAVED"
                  ? "border-amber-800 text-amber-900"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              <BookMarked className="h-4 w-4" />
              <span>My Saved Circuits</span>
              {user ? (
                <span className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full font-mono ${
                  userItineraries.length > 0 ? "bg-amber-800 text-white" : "bg-stone-200 text-stone-600"
                }`}>
                  {userItineraries.length}
                </span>
              ) : (
                <span className="text-[10px] bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full">
                  Login
                </span>
              )}
            </button>
          </div>

          <span className="text-xs text-stone-500 hidden sm:block">
            {inspirationTab === "TEMPLATES"
              ? "1-click to customize & edit pre-built templates"
              : "Manage, duplicate, or resume your planned circuits"}
          </span>
        </div>

        {/* Tab 1: Pre-built templates */}
        {inspirationTab === "TEMPLATES" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-200">
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
        )}

        {/* Tab 2: User's saved circuits */}
        {inspirationTab === "SAVED" && (
          <div className="animate-in fade-in duration-200">
            {!user ? (
              <div className="text-center py-10 px-4 rounded-3xl bg-white border border-stone-200 shadow-sm max-w-md mx-auto space-y-3">
                <BookMarked className="h-9 w-9 text-amber-700 mx-auto" />
                <h3 className="font-bold text-stone-900 text-base">Sign In to View Saved Circuits</h3>
                <p className="text-xs text-stone-500">
                  Save your custom multi-day travel plans to your Idea Holiday account to access them anytime.
                </p>
                <Link
                  to={`/login?from=${encodeURIComponent("/circuit-planner")}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold px-4 py-2.5 shadow-sm transition mt-1"
                >
                  <span>Sign In / Create Account</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : userItineraries.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-3xl bg-white border-2 border-dashed border-stone-200 shadow-sm max-w-md mx-auto space-y-2">
                <Sparkles className="h-8 w-8 text-amber-500 mx-auto" />
                <h3 className="font-bold text-stone-900 text-sm">No Saved Circuits Yet</h3>
                <p className="text-xs text-stone-500">
                  Customize a circuit below and click &ldquo;Save Circuit&rdquo; to store your trips here!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {userItineraries.map((itin) => {
                  const isCurrent = currentId === itin.id;
                  const dateStr = formatDisplayDate(itin.travelDate || itin.startDate);
                  const endStr = formatDisplayDate(itin.endDate);

                  return (
                    <div
                      key={itin.id}
                      onClick={() => loadItineraryFromObject(itin)}
                      className={`group cursor-pointer rounded-2xl bg-white p-5 border transition flex flex-col justify-between ${
                        isCurrent
                          ? "border-amber-600 ring-2 ring-amber-500/20 shadow-md"
                          : "border-stone-200 hover:border-amber-400 hover:shadow-sm"
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 font-mono">
                            {itin.daysCount || 3} Days • {itin.activityCount || (itin.items || []).length} Stops
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Check className="h-3 w-3" /> Active
                            </span>
                          )}
                        </div>

                        <h4 className="font-bold text-stone-900 text-sm sm:text-base group-hover:text-amber-800 transition line-clamp-1">
                          {itin.title}
                        </h4>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-amber-700 shrink-0" />
                            {itin.destination}
                          </span>
                          {dateStr && (
                            <span className="flex items-center gap-1 font-mono text-[11px]">
                              <Calendar className="h-3 w-3 text-stone-400 shrink-0" />
                              {dateStr}{endStr ? ` – ${endStr}` : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-stone-100 mt-4 text-xs">
                        <div>
                          <span className="text-[10px] text-stone-400 block font-medium">Estimated Total</span>
                          <span className="font-mono font-bold text-stone-900 text-sm">
                            ₹{(itin.totalEstimatedInr || 0).toLocaleString("en-IN")}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleCloneCircuit(itin.id, e)}
                            title="Duplicate / Clone circuit"
                            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 border border-stone-200 transition cursor-pointer"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteCircuit(itin.id, e)}
                            title="Delete circuit"
                            className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 border border-stone-200 hover:border-rose-200 transition cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => loadItineraryFromObject(itin)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-1.5 transition cursor-pointer"
                          >
                            <span>Load</span>
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─── MAIN BUILDER & SIDEBAR ─────────────────────────────────────── */}
      <section id="circuit-timeline-builder" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid gap-8 lg:grid-cols-12">

          {/* LEFT: DAY-BY-DAY TIMELINE (8 cols) */}
          <div className="lg:col-span-8 space-y-6">

            {/* Day Selector Pills with Calendar Dates */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              {Array.from({ length: daysCount }).map((_, idx) => {
                const dayNum = idx + 1;
                const count = (itemsByDay[dayNum] || []).length;
                const isSelected = activeDay === dayNum;
                const dayCal = getDayCalendarInfo(idx);

                return (
                  <button
                    key={dayNum}
                    onClick={() => setActiveDay(dayNum)}
                    className={`flex flex-col items-start rounded-2xl px-4 py-2.5 text-xs sm:text-sm font-bold shrink-0 transition cursor-pointer ${
                      isSelected
                        ? "bg-amber-800 text-white shadow-md"
                        : "bg-white text-stone-700 hover:bg-stone-100 border border-stone-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span>Day {dayNum}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isSelected ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600"
                      }`}>
                        {count} {count === 1 ? "act" : "acts"}
                      </span>
                    </div>
                    {dayCal.dateStr && (
                      <span className={`text-[10px] font-normal mt-0.5 ${isSelected ? "text-amber-200" : "text-stone-400"}`}>
                        {dayCal.dateStr} • {dayCal.weekday}
                      </span>
                    )}
                  </button>
                );
              })}

              <button
                onClick={() => setDaysCount((prev) => Math.min(14, prev + 1))}
                className="flex items-center gap-1.5 rounded-2xl border-2 border-dashed border-stone-300 hover:border-amber-500 bg-white/50 px-3.5 py-2.5 text-xs font-bold text-stone-600 hover:text-amber-800 transition shrink-0 cursor-pointer self-stretch justify-center"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Day</span>
              </button>
            </div>

            {/* View Mode Switcher: Timeline vs Route Map */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-stone-200 shadow-xs">
              <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl w-fit">
                <button
                  onClick={() => setViewMode("TIMELINE")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    viewMode === "TIMELINE"
                      ? "bg-white text-stone-900 shadow-xs"
                      : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  <ListOrdered className="h-3.5 w-3.5 text-amber-800" />
                  <span>Timeline View</span>
                </button>
                <button
                  onClick={() => setViewMode("MAP")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    viewMode === "MAP"
                      ? "bg-white text-stone-900 shadow-xs"
                      : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  <Map className="h-3.5 w-3.5 text-amber-700" />
                  <span>Interactive Route Map</span>
                </button>
              </div>

              <span className="text-[11px] text-stone-500 font-medium hidden sm:block">
                💡 Drag activities across time slots & days to reorder your itinerary
              </span>
            </div>

            {/* Render View: Interactive Route Map vs Active Day Card & Time Slots */}
            {viewMode === "MAP" ? (
              <CircuitRouteMapView
                items={items}
                daysCount={daysCount}
                destination={destination}
                activeDay={activeDay}
              />
            ) : (
              <div className="rounded-3xl bg-white border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-xl sm:text-2xl font-bold text-stone-900">
                        Day {activeDay} Schedule
                      </h3>
                      {(() => {
                        const cal = getDayCalendarInfo(activeDay - 1);
                        return cal.dateStr ? (
                          <span className="text-xs font-bold text-amber-800 bg-amber-100/70 border border-amber-200 px-2.5 py-0.5 rounded-full">
                            {cal.dateStr}, {cal.weekday}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Plan your morning, afternoon, evening and night activities
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1 rounded-full">
                      {(itemsByDay[activeDay] || []).length} scheduled
                    </span>
                    {daysCount > 1 && (
                      <button
                        onClick={() => handleDeleteDay(activeDay)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-full px-3 py-1 transition cursor-pointer"
                        title={`Remove Day ${activeDay} from circuit`}
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete Day {activeDay}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 4 Time Slots */}
                <div className="space-y-6">
                  {TIME_SLOTS.map((slot) => {
                    const slotItems = (itemsByDay[activeDay] || []).filter((i) => i.timeSlot === slot.id);

                    return (
                      <div
                        key={slot.id}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const itemId = e.dataTransfer.getData("text/plain") || draggedItemId;
                          if (itemId) handleMoveItemToSlot(itemId, activeDay, slot.id);
                        }}
                        className="rounded-2xl border border-stone-200/80 bg-stone-50/50 p-4 sm:p-5 transition hover:border-amber-300/80"
                      >
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
                            <p className="text-xs text-stone-400 font-medium">Free time for leisure or drag activities here</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {slotItems.map((item) => {
                              const unitPrice = item.product?.price_inr || item.product?.priceInr || item.priceInr || 0;
                              const itemTotal = item.type === "TRANSFER"
                                ? unitPrice
                                : (unitPrice * adults) + (Math.round(unitPrice * 0.7) * childrenCount);

                              return (
                                <div
                                  key={item.id}
                                  draggable={true}
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData("text/plain", item.id);
                                    setDraggedItemId(item.id);
                                  }}
                                  onDragEnd={() => setDraggedItemId(null)}
                                  className={`flex items-start justify-between gap-4 rounded-xl bg-white p-4 border border-stone-200 shadow-xs hover:border-amber-300 transition ${
                                    draggedItemId === item.id ? "opacity-40 ring-2 ring-amber-500 scale-[0.99]" : ""
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <GripVertical className="h-5 w-5 text-stone-300 hover:text-stone-600 cursor-grab shrink-0 mt-1" />
                                    {item.product?.hero_image || item.product?.heroImage ? (
                                      <img
                                        src={item.product?.hero_image || item.product?.heroImage}
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

                                  <div className="flex flex-col items-end justify-between shrink-0 space-y-1">
                                    <span className="font-mono text-xs sm:text-sm font-bold text-stone-900">
                                      ₹{itemTotal.toLocaleString("en-IN")}
                                    </span>
                                    {item.type !== "TRANSFER" && (
                                      <span className="text-[10px] text-stone-400 font-medium">
                                        {adults} Ad{childrenCount > 0 ? ` + ${childrenCount} Ch` : ""}
                                      </span>
                                    )}
                                    {item.type === "TRANSFER" && (
                                      <span className="text-[10px] text-sky-600 font-medium">
                                        Per Vehicle
                                      </span>
                                    )}
                                    <div className="flex items-center gap-1 mt-1">
                                      <button
                                        onClick={() => handleOpenEditItem(item)}
                                        className="text-stone-400 hover:text-amber-800 hover:bg-amber-50 p-1 rounded-lg transition cursor-pointer"
                                        title="Edit activity details"
                                      >
                                        <Edit3 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleRemoveItem(item.id)}
                                        className="text-stone-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded-lg transition cursor-pointer"
                                        title="Remove from circuit"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
                  <span className="text-stone-600">Travel Dates:</span>
                  <span className="font-bold text-stone-900 text-right">
                    {formatDisplayDate(startDate)} – {formatDisplayDate(endDate)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-stone-600">Total Duration:</span>
                  <span className="font-bold text-stone-900">{daysCount} Days</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-stone-600">Total Scheduled:</span>
                  <span className="font-bold text-stone-900">{items.length} Activities</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-stone-600">Total Experience Time:</span>
                  <span className="font-bold text-stone-900">~{totalExperienceHours} Hours</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-stone-600">Travelers (Guests):</span>
                  <span className="font-bold text-stone-900">
                    {adults} {adults === 1 ? "Adult" : "Adults"}
                    {childrenCount > 0 ? `, ${childrenCount} ${childrenCount === 1 ? "Child" : "Children"}` : ""}
                  </span>
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
                  Calculated for {adults} Adult{adults > 1 ? "s" : ""}{childrenCount > 0 ? ` + ${childrenCount} Child${childrenCount > 1 ? "ren" : ""}` : ""}
                </span>
              </div>

              <div className="space-y-2.5">
                <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4" aria-label="Circuit booking progress">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-amber-800">Booking flow</p><h4 className="mt-1 text-sm font-bold text-stone-900">{quoteReady ? "Your circuit is ready to reserve" : "Continue from plan to payment"}</h4></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${quoteReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{quoteReady ? "STEP 2 OF 4" : "STEP 1 OF 4"}</span></div>
                  <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="Booking stages">
                    {["Save", "Quote", "Reserve", "Pay"].map((label, index) => {
                      const complete = quoteReady ? index <= 1 : Boolean(currentId) && index === 0;
                      const active = quoteReady ? index === 2 : index === (currentId ? 1 : 0);
                      return <li key={label} className="text-center"><span className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-[10px] font-black ${complete ? "bg-emerald-700 text-white" : active ? "bg-amber-500 text-stone-950 ring-2 ring-amber-200" : "bg-stone-200 text-stone-500"}`}>{complete ? "✓" : index + 1}</span><span className="mt-1 block text-[9px] font-bold text-stone-500">{label}</span></li>;
                    })}
                  </ol>
                  <p className="mt-3 text-[10px] leading-relaxed text-stone-600">{quoteReady ? `Verified total ${formatPrice(circuitQuote.breakdown.totalAmount)}. Reserve all items for 15 minutes, then pay once in Cashfree sandbox or demo mode.` : "Get a server-verified quote first. Available items then unlock grouped reservation and checkout."}</p>
                </section>

                <button
                  onClick={quoteReady ? handleContinueToCircuitCheckout : handleBookEntireCircuit}
                  disabled={quoteLoading || saving || orderCreating}
                  className={`w-full flex items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-sm font-bold shadow-md transition cursor-pointer disabled:cursor-wait disabled:opacity-60 ${quoteReady ? "bg-emerald-700 text-white hover:bg-emerald-800" : "bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white"}`}
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span>{orderCreating ? "Reserving your circuit…" : quoteLoading ? "Checking live prices…" : quoteReady ? "Continue to grouped checkout" : "Get Live Circuit Quote"}</span>
                </button>
                {quoteReady && <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setQuoteModalOpen(true)} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-[10px] font-black text-emerald-800 hover:bg-emerald-100">View verified quote</button><button type="button" onClick={handleBookEntireCircuit} disabled={quoteLoading} className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[10px] font-black text-stone-700 hover:bg-stone-50">Refresh quote</button></div>}
                <p className="text-center text-[10px] leading-relaxed text-stone-500">
                  The server checks every linked product, date and guest count. Planner estimates are never used for payment.
                </p>

                <button
                  onClick={handleSaveCircuit}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white py-3 px-4 text-xs sm:text-sm font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? "Saving..." : "Save to My Circuits"}</span>
                </button>

                <button
                  onClick={handlePrintItinerary}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white py-3 px-4 text-xs font-bold shadow-sm transition cursor-pointer"
                >
                  <Printer className="h-4 w-4 text-amber-300" />
                  <span>{quoteReady ? "Print Live Quote / Trip Plan PDF" : "Print Trip Plan PDF"}</span>
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

      {/* ─── CANONICAL CIRCUIT QUOTE MODAL ─────────────────────────────── */}
      {quoteModalOpen && circuitQuote && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="circuit-quote-title">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-stone-200 bg-stone-950 px-5 py-4 text-white sm:px-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Server-verified · valid for 15 minutes</p>
                <h2 id="circuit-quote-title" className="mt-1 font-serif text-2xl font-bold">Your live circuit quote</h2>
                <p className="mt-1 text-xs text-stone-300">Quote {circuitQuote.quoteId}</p>
              </div>
              <button type="button" onClick={() => setQuoteModalOpen(false)} className="rounded-full p-2 text-stone-300 hover:bg-white/10 hover:text-white" aria-label="Close circuit quote">✕</button>
            </div>

            <div className="overflow-y-auto p-5 sm:p-6">
              <div className={`rounded-2xl border p-4 ${circuitQuote.status === "READY" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-stone-600">{circuitQuote.status === "READY" ? "All items available" : "Action required"}</p>
                    <p className="mt-1 text-xs text-stone-600">{circuitQuote.lineItems.length} of {items.length} itinerary items priced from live marketplace data.</p>
                  </div>
                  <strong className="font-mono text-3xl text-stone-950">{formatPrice(circuitQuote.breakdown.totalAmount)}</strong>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {circuitQuote.lineItems.map((line) => (
                  <article key={line.itemId} className="rounded-2xl border border-stone-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-amber-800">Day {line.dayNumber} · {formatDisplayDate(line.activityDate)}</p>
                        <h3 className="mt-1 text-sm font-bold text-stone-900">{line.productTitle}</h3>
                        <p className="mt-1 text-xs text-stone-500">{line.supplierName || "Verified marketplace partner"} · {line.variantName}</p>
                      </div>
                      <strong className="shrink-0 font-mono text-sm text-stone-950">{formatPrice(line.breakdown.totalAmount)}</strong>
                    </div>
                  </article>
                ))}
              </div>

              {circuitQuote.issues.length > 0 && (
                <section className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4" aria-label="Items requiring attention">
                  <h3 className="text-sm font-bold text-amber-950">Items that need attention before checkout</h3>
                  <ul className="mt-3 space-y-2">
                    {circuitQuote.issues.map((issue) => (
                      <li key={`${issue.itemId}-${issue.code}`} className="text-xs leading-relaxed text-amber-900">
                        <strong>Day {issue.dayNumber}: {issue.title}</strong> — {issue.message}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-stone-100 p-4 text-xs">
                <span className="text-stone-600">Activities and transfers</span><strong className="text-right">{formatPrice(circuitQuote.breakdown.baseAmount)}</strong>
                <span className="text-stone-600">Taxes, tolls and permits</span><strong className="text-right">{formatPrice(circuitQuote.breakdown.taxesAmount)}</strong>
                <span className="border-t border-stone-300 pt-3 font-bold text-stone-900">Verified circuit total</span><strong className="border-t border-stone-300 pt-3 text-right font-mono text-base">{formatPrice(circuitQuote.breakdown.totalAmount)}</strong>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-stone-500">
                {circuitQuote.status === "READY"
                  ? "Continue to reserve every listed experience for 15 minutes. Checkout collects one grouped payment and confirms the complete circuit together."
                  : "This quote does not charge your account or reserve inventory. Link or replace every item requiring attention before grouped checkout."}
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4 sm:px-6">
              <button type="button" onClick={() => setQuoteModalOpen(false)} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-100">Close</button>
              <button type="button" onClick={handleBookEntireCircuit} disabled={quoteLoading} className="rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-60">Refresh live quote</button>
              {circuitQuote.status === "READY" && (
                <button
                  type="button"
                  onClick={handleContinueToCircuitCheckout}
                  disabled={orderCreating || quoteLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-black text-white shadow-sm hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {orderCreating ? "Reserving your circuit…" : "Reserve circuit & continue"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* ─── EDIT ACTIVITY MODAL ────────────────────────────────────────── */}
      {editItemModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-stone-100 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-amber-800" />
                <h3 className="text-lg font-bold text-stone-900">Edit Scheduled Activity</h3>
              </div>
              <button
                onClick={() => setEditItemModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Title</label>
                <input
                  type="text"
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Day</label>
                  <select
                    value={editingItem.dayNumber}
                    onChange={(e) => setEditingItem({ ...editingItem, dayNumber: Number(e.target.value) })}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                  >
                    {Array.from({ length: daysCount }).map((_, idx) => (
                      <option key={idx + 1} value={idx + 1}>Day {idx + 1}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Time Slot</label>
                  <select
                    value={editingItem.timeSlot}
                    onChange={(e) => setEditingItem({ ...editingItem, timeSlot: e.target.value })}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                  >
                    {TIME_SLOTS.map((s) => (
                      <option key={s.id} value={s.id}>{s.icon} {s.label} ({s.time})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Duration (Hours)</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={editingItem.durationHours || 2}
                    onChange={(e) => setEditingItem({ ...editingItem, durationHours: Number(e.target.value) })}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Base Price (₹ INR)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingItem.priceInr ?? 0}
                    onChange={(e) => setEditingItem({ ...editingItem, priceInr: Number(e.target.value) })}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Notes / Instructions</label>
                <textarea
                  rows={2}
                  value={editingItem.notes || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
                  placeholder="e.g. Carry warm layer, camera fee extra, pickup from lobby..."
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                onClick={() => setEditItemModalOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditedItem}
                className="rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold px-4 py-2 shadow-sm cursor-pointer"
              >
                Save Changes
              </button>
            </div>
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

            <div className="space-y-2 pt-2">
              <button
                onClick={shareViaWhatsApp}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white py-3 px-4 text-xs font-bold shadow-md transition cursor-pointer"
              >
                <MessageCircle className="h-4 w-4 fill-white" />
                <span>Share Formatted Summary on WhatsApp</span>
              </button>

              <button
                onClick={handlePrintItinerary}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white py-3 px-4 text-xs font-bold shadow-sm transition cursor-pointer"
              >
                <Printer className="h-4 w-4 text-amber-300" />
                <span>Preview / Save Trip Plan PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
