import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Heart,
  Calendar,
  Compass,
  Star,
  Trash2,
  ArrowRight,
  Plus,
  Share2,
  Clock,
  MapPin,
  Sparkles,
  Check,
  FolderHeart,
  Layers,
  ChevronRight,
  SunMedium,
  Sunset,
  Moon,
} from "lucide-react";
import api from "../lib/api";
import { useCurrency } from "../lib/currency";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import WishlistButton from "../components/traveler/WishlistButton";

export function WishlistPage() {
  const { formatPrice } = useCurrency();
  const [activeTab, setActiveTab] = useState("wishlist"); // "wishlist" | "planner"
  const [items, setItems] = useState([]);
  const [itineraries, setItineraries] = useState([]);
  const [selectedItinerary, setSelectedItinerary] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [creatingItin, setCreatingItin] = useState(false);
  const [newItinData, setNewItinData] = useState({
    title: "My Golden Triangle Getaway",
    destination: "Delhi & Agra",
    startDate: new Date().toISOString().slice(0, 10),
    daysCount: 3,
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [wishRes, itinRes] = await Promise.all([
        api.getWishlists().catch(() => ({ wishlists: [] })),
        api.getUserItineraries().catch(() => ({ itineraries: [] })),
      ]);

      const wishList = wishRes?.wishlists || wishRes?.wishlist || [];
      const itinList = itinRes?.itineraries || [];

      setItems(wishList);
      setItineraries(itinList);
      if (itinList.length > 0 && !selectedItinerary) {
        setSelectedItinerary(itinList[0]);
      }
    } catch (err) {
      console.error("Failed to load wishlist or itineraries", err);
    } finally {
      setLoading(false);
    }
  }

  const handleRemoveWishlist = (productId) => {
    setItems((prev) => prev.filter((item) => item.product_id !== productId && item.id !== productId && item.product?.id !== productId));
  };

  const handleCreateItinerary = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createItinerary({
        title: newItinData.title,
        destination: newItinData.destination,
        startDate: newItinData.startDate,
        daysCount: newItinData.daysCount,
        items: [],
      });
      if (res?.itinerary) {
        setItineraries((prev) => [res.itinerary, ...prev]);
        setSelectedItinerary(res.itinerary);
        setCreatingItin(false);
        setActiveTab("planner");
      }
    } catch (err) {
      console.error("Failed to create itinerary", err);
    }
  };

  const handleAddItemToDay = async (itineraryId, dayNumber, timeSlot, productId) => {
    if (!selectedItinerary) return;
    const currentItems = selectedItinerary.items.map((i) => ({
      dayNumber: i.dayNumber,
      timeSlot: i.timeSlot,
      productId: i.productId || i.product?.id,
      notes: i.notes || "",
    }));

    const nextItems = [
      ...currentItems,
      { dayNumber, timeSlot, productId, notes: "" },
    ];

    try {
      const res = await api.updateItinerary(itineraryId, { items: nextItems });
      if (res?.itinerary) {
        setSelectedItinerary(res.itinerary);
        setItineraries((prev) => prev.map((itin) => (itin.id === itineraryId ? res.itinerary : itin)));
      }
    } catch (err) {
      console.error("Failed to add item to itinerary", err);
    }
  };

  const handleRemoveItemFromItinerary = async (itineraryId, itemIndex) => {
    if (!selectedItinerary) return;
    const nextItems = selectedItinerary.items
      .filter((_, idx) => idx !== itemIndex)
      .map((i) => ({
        dayNumber: i.dayNumber,
        timeSlot: i.timeSlot,
        productId: i.productId || i.product?.id,
        notes: i.notes || "",
      }));

    try {
      const res = await api.updateItinerary(itineraryId, { items: nextItems });
      if (res?.itinerary) {
        setSelectedItinerary(res.itinerary);
        setItineraries((prev) => prev.map((itin) => (itin.id === itineraryId ? res.itinerary : itin)));
      }
    } catch (err) {
      console.error("Failed to update itinerary items", err);
    }
  };

  const handleDeleteItinerary = async (itineraryId) => {
    if (!window.confirm("Are you sure you want to delete this trip itinerary?")) return;
    try {
      await api.deleteItinerary(itineraryId);
      const remaining = itineraries.filter((i) => i.id !== itineraryId);
      setItineraries(remaining);
      setSelectedItinerary(remaining[0] || null);
    } catch (err) {
      console.error("Failed to delete itinerary", err);
    }
  };

  // Extract unique collection names from items
  const collections = ["ALL", ...new Set(items.map((i) => i.collection_name || "Favorites"))];
  const filteredItems = selectedCollection === "ALL"
    ? items
    : items.filter((i) => (i.collection_name || "Favorites") === selectedCollection);

  // Helper for WhatsApp itinerary text
  const generateWhatsAppShareText = (itin) => {
    if (!itin) return "";
    let text = `🇮🇳 *${itin.title}* (${itin.destination || "India"})\n`;
    text += `📅 Start Date: ${itin.startDate || "Flexible"} • Duration: ${itin.daysCount} Days\n`;
    text += `💰 Estimated Total: ₹${(itin.totalEstimatedInr || 0).toLocaleString("en-IN")}\n\n`;

    for (let day = 1; day <= itin.daysCount; day++) {
      const dayActivities = (itin.items || []).filter((i) => i.dayNumber === day);
      text += `*Day ${day}:*\n`;
      if (dayActivities.length === 0) {
        text += `  • Free time for leisure & local shopping\n`;
      } else {
        dayActivities.forEach((act) => {
          text += `  • [${act.timeSlot}] ${act.product?.title || "Curated Excursion"}\n`;
        });
      }
      text += `\n`;
    }
    text += `Plan and book authentic Indian experiences at: https://ideaholiday.com`;
    return encodeURIComponent(text);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header & Dual Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100 font-display">
            Saved Trips & Itinerary Planner
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Organize your bookmarked excursions and assemble multi-day custom travel plans.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800/80 p-1 rounded-2xl border border-stone-200 dark:border-stone-700">
          <button
            type="button"
            onClick={() => setActiveTab("wishlist")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "wishlist"
                ? "bg-white dark:bg-stone-900 text-amber-700 dark:text-amber-400 shadow-xs"
                : "text-stone-600 dark:text-stone-400 hover:text-stone-900"
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${activeTab === "wishlist" ? "fill-amber-500 text-amber-500" : ""}`} />
            Saved Wishlist ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("planner")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "planner"
                ? "bg-white dark:bg-stone-900 text-amber-700 dark:text-amber-400 shadow-xs"
                : "text-stone-600 dark:text-stone-400 hover:text-stone-900"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-600" />
            Trip Planner ({itineraries.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 bg-stone-100 dark:bg-stone-800 rounded-3xl" />
          ))}
        </div>
      ) : activeTab === "wishlist" ? (
        /* ================= TAB 1: SAVED WISHLIST ================= */
        <div className="space-y-6">
          {/* Collection Filter Pills */}
          {collections.length > 2 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <span className="font-bold text-stone-500 flex items-center gap-1 font-mono text-[11px]">
                <FolderHeart className="w-3.5 h-3.5 text-amber-600" /> COLLECTIONS:
              </span>
              {collections.map((col) => (
                <button
                  key={col}
                  onClick={() => setSelectedCollection(col)}
                  className={`px-3 py-1.5 rounded-full font-bold transition ${
                    selectedCollection === col
                      ? "bg-stone-900 text-white dark:bg-amber-500 dark:text-stone-950"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"
                  }`}
                >
                  {col}
                </button>
              ))}
            </div>
          )}

          {filteredItems.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="Your wishlist is empty"
              description="Explore our handpicked activities, historical monuments, and luxury transfers to start saving your favorites."
              actionLabel="Discover Experiences"
              onAction={() => (window.location.href = "/search")}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {filteredItems.map((item) => {
                const prod = item.product || item;
                const productId = prod.id || item.product_id;
                return (
                  <div
                    key={productId}
                    className="group relative rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col"
                  >
                    <div className="relative aspect-video overflow-hidden bg-stone-100 dark:bg-stone-800">
                      <img
                        src={prod.hero_image || "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=600&q=80"}
                        alt={prod.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-3 right-3 z-10">
                        <WishlistButton
                          productId={productId}
                          initialSaved={true}
                          onToggle={() => handleRemoveWishlist(productId)}
                        />
                      </div>
                      {prod.destination && (
                        <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-xl bg-stone-900/80 backdrop-blur-xs text-white text-[10px] font-bold">
                          {prod.destination}
                        </span>
                      )}
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-bold mb-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span>{prod.rating || 4.9}</span>
                          {prod.duration_hours && (
                            <span className="text-stone-400 font-normal">
                              &bull; {prod.duration_hours}h duration
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-display line-clamp-2 group-hover:text-amber-600 transition-colors">
                          {prod.title}
                        </h3>
                        <p className="text-xs text-stone-500 line-clamp-2 mt-1">
                          {prod.short_desc || prod.subtitle || "Authentic curated excursion."}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-stone-400 block">From</span>
                          <span className="text-sm font-bold font-mono text-stone-900 dark:text-stone-100">
                            {formatPrice(prod.price_inr || 1499)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {itineraries.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("planner");
                                if (selectedItinerary) {
                                  handleAddItemToDay(selectedItinerary.id, 1, "MORNING", productId);
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold border border-amber-200 transition flex items-center gap-1"
                              title="Add to current trip itinerary"
                            >
                              <Plus className="w-3 h-3" /> Add to Plan
                            </button>
                          )}
                          <Link to={`/activity/${productId}`}>
                            <Button size="sm" variant="primary" icon={ArrowRight}>
                              Book
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ================= TAB 2: MULTI-DAY TRIP PLANNER ================= */
        <div className="space-y-6">
          {/* Trip Selector & Create New Action */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#FAF9F6] dark:bg-stone-900/60 p-4 rounded-3xl border border-stone-200 dark:border-stone-800">
            <div className="flex items-center gap-3 overflow-x-auto w-full sm:w-auto">
              <span className="text-xs font-bold text-stone-500 font-mono whitespace-nowrap">YOUR TRIPS:</span>
              {itineraries.map((itin) => (
                <button
                  key={itin.id}
                  onClick={() => setSelectedItinerary(itin)}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                    selectedItinerary?.id === itin.id
                      ? "bg-amber-500 text-stone-950 shadow-xs"
                      : "bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700"
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  {itin.title}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCreatingItin(!creatingItin)}
              className="px-3.5 py-2 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              New Trip Plan
            </button>
          </div>

          {/* New Trip Form */}
          {creatingItin && (
            <form onSubmit={handleCreateItinerary} className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-amber-300 dark:border-amber-700 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" /> Create a Custom Multi-Day Travel Plan
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-stone-700 dark:text-stone-300 block mb-1">Trip Name</label>
                  <input
                    type="text"
                    required
                    value={newItinData.title}
                    onChange={(e) => setNewItinData({ ...newItinData, title: e.target.value })}
                    placeholder="e.g. Goa Beach & Heritage Weekend"
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 p-2.5 text-xs text-stone-900 dark:text-stone-100 bg-[#FAF9F6] dark:bg-stone-800 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700 dark:text-stone-300 block mb-1">Destination</label>
                  <input
                    type="text"
                    required
                    value={newItinData.destination}
                    onChange={(e) => setNewItinData({ ...newItinData, destination: e.target.value })}
                    placeholder="e.g. Goa, Agra, Jaipur"
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 p-2.5 text-xs text-stone-900 dark:text-stone-100 bg-[#FAF9F6] dark:bg-stone-800 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700 dark:text-stone-300 block mb-1">Days Count</label>
                  <select
                    value={newItinData.daysCount}
                    onChange={(e) => setNewItinData({ ...newItinData, daysCount: parseInt(e.target.value, 10) })}
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 p-2.5 text-xs text-stone-900 dark:text-stone-100 bg-[#FAF9F6] dark:bg-stone-800 outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                      <option key={num} value={num}>
                        {num} {num === 1 ? "Day" : "Days"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreatingItin(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100"
                >
                  Cancel
                </button>
                <Button type="submit" variant="primary">
                  Save & Start Planning
                </Button>
              </div>
            </form>
          )}

          {/* Active Itinerary View */}
          {selectedItinerary ? (
            <div className="space-y-6">
              {/* Itinerary Banner Card */}
              <div className="bg-gradient-to-r from-stone-900 to-stone-800 text-white rounded-3xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold bg-amber-500 text-stone-950 px-2.5 py-0.5 rounded-full uppercase">
                      {selectedItinerary.destination || "India"} &bull; {selectedItinerary.daysCount} DAYS
                    </span>
                    <span className="text-xs text-stone-400">Created by {selectedItinerary.creatorName}</span>
                  </div>
                  <h2 className="text-2xl font-bold font-display">{selectedItinerary.title}</h2>
                  <p className="text-xs text-stone-300">
                    {selectedItinerary.activityCount || 0} activities scheduled across {selectedItinerary.daysCount} days.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-stone-800/80 border border-stone-700 px-4 py-2.5 rounded-2xl text-right">
                    <span className="text-[10px] text-stone-400 uppercase font-mono block">Estimated Budget</span>
                    <span className="text-lg font-mono font-bold text-amber-400">
                      {formatPrice(selectedItinerary.totalEstimatedInr || 0)}
                    </span>
                  </div>

                  <a
                    href={`https://api.whatsapp.com/send?text=${generateWhatsAppShareText(selectedItinerary)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-3 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold flex items-center gap-2 transition shadow-sm"
                  >
                    <Share2 className="w-4 h-4" /> Share on WhatsApp
                  </a>

                  <button
                    type="button"
                    onClick={() => handleDeleteItinerary(selectedItinerary.id)}
                    className="p-3 rounded-2xl bg-stone-800 hover:bg-rose-900/50 text-stone-400 hover:text-rose-300 border border-stone-700 transition"
                    title="Delete Itinerary"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Day-by-Day Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(selectedItinerary.daysCount || 3)].map((_, dayIdx) => {
                  const dayNum = dayIdx + 1;
                  const dayItems = (selectedItinerary.items || []).filter((i) => i.dayNumber === dayNum);
                  const dayPrice = dayItems.reduce((acc, i) => acc + (i.product?.price_inr || 0), 0);

                  return (
                    <div
                      key={dayNum}
                      className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-5 space-y-4 shadow-xs flex flex-col justify-between"
                    >
                      <div className="space-y-4">
                        {/* Day Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
                          <div>
                            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 font-display">
                              Day {dayNum}
                            </h3>
                            <span className="text-[11px] text-stone-500 font-mono">
                              {dayItems.length} {dayItems.length === 1 ? "Activity" : "Activities"}
                            </span>
                          </div>
                          {dayPrice > 0 && (
                            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-xl">
                              {formatPrice(dayPrice)}
                            </span>
                          )}
                        </div>

                        {/* Activity Slots in this Day */}
                        {dayItems.length === 0 ? (
                          <div className="p-6 text-center border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl text-xs text-stone-400">
                            No activities added yet for Day {dayNum}.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {dayItems.map((item, itemIdx) => {
                              const prod = item.product;
                              const timeIcon = item.timeSlot === "MORNING"
                                ? <SunMedium className="w-3.5 h-3.5 text-amber-500" />
                                : item.timeSlot === "AFTERNOON"
                                ? <Sunset className="w-3.5 h-3.5 text-orange-500" />
                                : <Moon className="w-3.5 h-3.5 text-indigo-500" />;

                              return (
                                <div
                                  key={item.id || itemIdx}
                                  className="p-3 rounded-2xl border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-stone-800/40 space-y-2 relative group"
                                >
                                  <div className="flex items-center justify-between text-[10px] font-bold font-mono text-stone-500">
                                    <span className="flex items-center gap-1 uppercase">
                                      {timeIcon} {item.timeSlot}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveItemFromItinerary(selectedItinerary.id, itemIdx)}
                                      className="text-stone-400 hover:text-rose-500 transition opacity-0 group-hover:opacity-100"
                                      title="Remove from Day"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>

                                  {prod ? (
                                    <div className="flex items-center gap-3">
                                      <img
                                        src={prod.hero_image || "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=200&q=80"}
                                        alt={prod.title}
                                        className="w-12 h-12 rounded-xl object-cover shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                                          {prod.title}
                                        </h4>
                                        <span className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-400 block">
                                          {formatPrice(prod.price_inr)}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-stone-600 italic">Custom free-time exploration</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Add Activity Trigger from Wishlist */}
                      <div className="pt-3 border-t border-stone-100 dark:border-stone-800">
                        {items.length === 0 ? (
                          <Link to="/search" className="text-xs text-amber-600 font-bold block text-center hover:underline">
                            + Explore & save activities
                          </Link>
                        ) : (
                          <div className="relative">
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleAddItemToDay(selectedItinerary.id, dayNum, "MORNING", e.target.value);
                                  e.target.value = "";
                                }
                              }}
                              defaultValue=""
                              className="w-full text-xs font-bold py-2 px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 outline-none"
                            >
                              <option value="" disabled>+ Add from Saved Wishlist...</option>
                              {items.map((it) => {
                                const p = it.product || it;
                                return (
                                  <option key={p.id || it.product_id} value={p.id || it.product_id}>
                                    {p.title} ({formatPrice(p.price_inr)})
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="No custom trip plan selected"
              description="Create a new trip plan above to organize your saved activities into a seamless day-by-day itinerary."
              actionLabel="Create Trip Plan"
              onAction={() => setCreatingItin(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default WishlistPage;
