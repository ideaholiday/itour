import React, { useState } from "react";
import {
  MapPin,
  Calendar,
  Clock,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Tag,
  Utensils,
  Check,
  X,
  Info,
  Layers,
  ArrowUp,
  ArrowDown
} from "lucide-react";

export default function Step2Itinerary({ formData, category, onChange, errors }) {
  const { itinerary = [], timeSlots = [], pickupDropPoints = [], dayStops = [] } = formData;
  const [openDayIndex, setOpenDayIndex] = useState(0);
  const [newTagInput, setNewTagInput] = useState({});
  const [newTimeSlotInput, setNewTimeSlotInput] = useState("");
  const [newLocationInput, setNewLocationInput] = useState("");
  const [newLocationType, setNewLocationType] = useState("PICKUP");

  // Day Accordion Handlers
  const handleAddDay = () => {
    const nextDayNum = itinerary.length + 1;
    const newDayObj = {
      day: nextDayNum,
      title: `Day ${nextDayNum}: Sightseeing & Exploration`,
      description: "",
      placesCovered: [],
      meals: { breakfast: true, lunch: false, dinner: false },
    };
    const updated = [...itinerary, newDayObj];
    onChange({ itinerary: updated });
    setOpenDayIndex(updated.length - 1);
  };

  const handleRemoveDay = (index) => {
    if (itinerary.length <= 1) return;
    const updated = itinerary
      .filter((_, i) => i !== index)
      .map((item, idx) => ({ ...item, day: idx + 1 }));
    onChange({ itinerary: updated });
    if (openDayIndex >= updated.length) {
      setOpenDayIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleDayFieldChange = (index, field, value) => {
    const updated = [...itinerary];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ itinerary: updated });
  };

  const handleMealToggle = (index, mealType) => {
    const updated = [...itinerary];
    const currentMeals = updated[index].meals || { breakfast: false, lunch: false, dinner: false };
    updated[index].meals = { ...currentMeals, [mealType]: !currentMeals[mealType] };
    onChange({ itinerary: updated });
  };

  // Tag input for Key Places Covered
  const handleAddTag = (dayIndex) => {
    const val = (newTagInput[dayIndex] || "").trim();
    if (!val) return;
    const updated = [...itinerary];
    const currentPlaces = updated[dayIndex].placesCovered || [];
    if (!currentPlaces.includes(val)) {
      updated[dayIndex].placesCovered = [...currentPlaces, val];
      onChange({ itinerary: updated });
    }
    setNewTagInput({ ...newTagInput, [dayIndex]: "" });
  };

  const handleRemoveTag = (dayIndex, tagToRemove) => {
    const updated = [...itinerary];
    updated[dayIndex].placesCovered = (updated[dayIndex].placesCovered || []).filter(
      (p) => p !== tagToRemove
    );
    onChange({ itinerary: updated });
  };

  // Day Sightseeing Time Slots
  const handleAddTimeSlot = (slot) => {
    if (!slot || timeSlots.includes(slot)) return;
    onChange({ timeSlots: [...timeSlots, slot] });
    setNewTimeSlotInput("");
  };

  const handleRemoveTimeSlot = (slot) => {
    onChange({ timeSlots: timeSlots.filter((s) => s !== slot) });
  };

  // Pickup/Drop Location Handlers
  const handleAddLocation = () => {
    if (!newLocationInput.trim()) return;
    onChange({
      pickupDropPoints: [
        ...pickupDropPoints,
        { type: newLocationType, locationName: newLocationInput.trim() },
      ],
    });
    setNewLocationInput("");
  };

  const handleRemoveLocation = (index) => {
    onChange({
      pickupDropPoints: pickupDropPoints.filter((_, i) => i !== index),
    });
  };

  // Day Sightseeing Stops Handlers
  const handleAddStop = () => {
    const nextOrder = dayStops.length + 1;
    onChange({
      dayStops: [
        ...dayStops,
        { order: nextOrder, name: "", duration: "1.5 Hours", description: "" },
      ],
    });
  };

  const handleStopChange = (index, field, value) => {
    const updated = [...dayStops];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ dayStops: updated });
  };

  const handleRemoveStop = (index) => {
    const updated = dayStops
      .filter((_, i) => i !== index)
      .map((item, idx) => ({ ...item, order: idx + 1 }));
    onChange({ dayStops: updated });
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="border-b border-stone-200 pb-4">
        <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-amber-600" />
          Step 2: Itinerary & Places to Visit Builder
        </h2>
        <p className="text-sm text-stone-600 mt-1">
          {category === "MULTI_DAY"
            ? "Build detailed day-by-day itineraries, key attractions tags, and meal plans."
            : "Define time slots, pickup/drop locations, and attraction stops for single-day sightseeing."}
        </p>
      </div>

      {category === "MULTI_DAY" ? (
        /* MULTI-DAY ACCORDION BUILDER */
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-600" />
              Day-Wise Accordion Schedule ({itinerary.length} Days)
            </h3>
            <button
              type="button"
              onClick={handleAddDay}
              className="bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add Next Day
            </button>
          </div>

          {errors?.itinerary && (
            <p className="text-xs text-rose-600 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" /> {errors.itinerary}
            </p>
          )}

          <div className="space-y-3">
            {itinerary.map((dayItem, index) => {
              const isOpen = openDayIndex === index;
              return (
                <div
                  key={index}
                  className={`border rounded-2xl transition-all ${
                    isOpen
                      ? "bg-white border-amber-500 ring-2 ring-amber-400 shadow-sm"
                      : "bg-[#FAF9F6] border-stone-200 hover:border-stone-300 hover:bg-white"
                  }`}
                >
                  {/* Accordion Header */}
                  <div
                    onClick={() => setOpenDayIndex(isOpen ? -1 : index)}
                    className="p-4 flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs flex items-center justify-center shadow-sm">
                        D{dayItem.day}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-stone-900">
                          {dayItem.title || `Day ${dayItem.day}: Title`}
                        </h4>
                        <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-3">
                          <span>{(dayItem.placesCovered || []).length} Places Tagged</span>
                          <span>•</span>
                          <span className="capitalize">
                            Meals: {[
                              dayItem.meals?.breakfast && "Breakfast",
                              dayItem.meals?.lunch && "Lunch",
                              dayItem.meals?.dinner && "Dinner",
                            ]
                              .filter(Boolean)
                              .join(", ") || "None"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {itinerary.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveDay(index);
                          }}
                          className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-stone-100 rounded-lg transition"
                          title="Delete Day"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {isOpen ? (
                        <ChevronUp className="w-5 h-5 text-stone-500" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-stone-500" />
                      )}
                    </div>
                  </div>

                  {/* Accordion Body */}
                  {isOpen && (
                    <div className="p-4 border-t border-stone-200 space-y-4 bg-[#FAF9F6] rounded-b-2xl">
                      {/* Day Title */}
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          Day {dayItem.day} Title <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={dayItem.title || ""}
                          onChange={(e) => handleDayFieldChange(index, "title", e.target.value)}
                          placeholder="e.g. Arrival in Goa, Hotel Check-in & Evening Beach Sunset"
                          className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-stone-900 text-sm focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      {/* Detailed Description */}
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          Detailed Day Plan <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          rows={2}
                          value={dayItem.description || ""}
                          onChange={(e) => handleDayFieldChange(index, "description", e.target.value)}
                          placeholder="Describe the day schedule, pickup time, sight visits, lunch stop, and evening activities..."
                          className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-stone-900 text-sm focus:outline-none focus:border-amber-500 leading-relaxed"
                        />
                      </div>

                      {/* Key Places Covered (Tag Input Style) */}
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-amber-600" /> Key Places Covered (Tags) <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {(dayItem.placesCovered || []).map((place, pIdx) => (
                            <span
                              key={pIdx}
                              className="bg-amber-100 text-amber-900 border border-amber-300 text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 font-semibold"
                            >
                              <MapPin className="w-3 h-3 text-amber-700" />
                              {place}
                              <button
                                type="button"
                                onClick={() => handleRemoveTag(index, place)}
                                className="hover:text-rose-700 transition"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newTagInput[index] || ""}
                            onChange={(e) => setNewTagInput({ ...newTagInput, [index]: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddTag(index);
                              }
                            }}
                            placeholder="Type attraction name (e.g. Baga Beach) & press Add"
                            className="flex-1 bg-white border border-stone-300 rounded-xl px-3 py-1.5 text-stone-900 text-xs focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddTag(index)}
                            className="bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold px-3 py-1.5 rounded-xl border border-stone-300 transition"
                          >
                            + Add Tag
                          </button>
                        </div>
                      </div>

                      {/* Meal Plan Checkboxes */}
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1.5 flex items-center gap-1.5">
                          <Utensils className="w-3.5 h-3.5 text-amber-600" /> Meals Included for Day {dayItem.day}
                        </label>
                        <div className="flex items-center gap-6">
                          {["breakfast", "lunch", "dinner"].map((mType) => {
                            const isChecked = dayItem.meals?.[mType] || false;
                            return (
                              <label key={mType} className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleMealToggle(index, mType)}
                                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 bg-white border-stone-300 accent-amber-500"
                                />
                                <span className="text-xs font-medium text-stone-700 capitalize">{mType}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* DAY SIGHTSEEING TIME SLOTS & PICKUP/DROP BUILDER */
        <div className="space-y-6">
          {/* Time Slots Selector */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              Departure & Time Slots <span className="text-rose-500">*</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {["08:00 AM", "09:00 AM", "10:00 AM", "02:00 PM", "04:30 PM"].map((slot) => {
                const isSelected = timeSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() =>
                      isSelected ? handleRemoveTimeSlot(slot) : handleAddTimeSlot(slot)
                    }
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-amber-500 text-stone-950 border-amber-500 font-bold shadow-sm"
                        : "bg-[#FAF9F6] text-stone-700 border-stone-300 hover:border-amber-400 hover:bg-white"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                    {slot}
                  </button>
                );
              })}
            </div>

            {/* Custom Slot Input */}
            <div className="flex gap-2 pt-2 border-t border-stone-200">
              <input
                type="text"
                value={newTimeSlotInput}
                onChange={(e) => setNewTimeSlotInput(e.target.value)}
                placeholder="Custom Slot (e.g. 06:00 AM Sunrise)"
                className="bg-[#FAF9F6] border border-stone-300 rounded-xl px-3 py-1.5 text-stone-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white flex-1"
              />
              <button
                type="button"
                onClick={() => handleAddTimeSlot(newTimeSlotInput)}
                className="bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold px-3 py-1.5 rounded-xl transition shadow-sm"
              >
                + Add Time Slot
              </button>
            </div>
            {errors?.timeSlots && (
              <p className="text-xs text-rose-600 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> {errors.timeSlots}
              </p>
            )}
          </div>

          {/* Pick-up / Drop Points Manager */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-600" />
              Pick-up & Drop Points <span className="text-rose-500">*</span>
            </h3>
            <div className="space-y-2">
              {pickupDropPoints.map((pt, pIdx) => (
                <div
                  key={pIdx}
                  className="flex items-center justify-between bg-[#FAF9F6] border border-stone-200 rounded-xl p-2.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                        pt.type === "PICKUP"
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          : pt.type === "DROP"
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : "bg-stone-100 text-stone-800 border border-stone-300"
                      }`}
                    >
                      {pt.type}
                    </span>
                    <span className="text-stone-900 font-medium">{pt.locationName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveLocation(pIdx)}
                    className="text-stone-400 hover:text-rose-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2 border-t border-stone-200">
              <select
                value={newLocationType}
                onChange={(e) => setNewLocationType(e.target.value)}
                className="bg-[#FAF9F6] border border-stone-300 rounded-xl px-2.5 py-1.5 text-stone-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white"
              >
                <option value="PICKUP">Pickup</option>
                <option value="DROP">Drop</option>
                <option value="BOTH">Pickup & Drop</option>
              </select>
              <input
                type="text"
                value={newLocationInput}
                onChange={(e) => setNewLocationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddLocation();
                  }
                }}
                placeholder="e.g. Any Central City Hotel, Railway Station, Airport T1"
                className="bg-[#FAF9F6] border border-stone-300 rounded-xl px-3 py-1.5 text-stone-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white flex-1"
              />
              <button
                type="button"
                onClick={handleAddLocation}
                className="bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold px-3 py-1.5 rounded-xl transition shadow-sm"
              >
                + Add Point
              </button>
            </div>
            {errors?.pickupDropPoints && (
              <p className="text-xs text-rose-600 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> {errors.pickupDropPoints}
              </p>
            )}
          </div>

          {/* Sightseeing Tour Stops / Breakdown */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-600" />
                Tour Sightseeing Timeline & Stops Breakdown
              </h3>
              <button
                type="button"
                onClick={handleAddStop}
                className="bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold px-2.5 py-1.5 rounded-xl transition border border-stone-300"
              >
                + Add Stop
              </button>
            </div>

            <div className="space-y-2">
              {dayStops.map((stop, sIdx) => (
                <div
                  key={sIdx}
                  className="grid grid-cols-12 gap-2 bg-[#FAF9F6] border border-stone-200 rounded-xl p-2 items-center"
                >
                  <div className="col-span-1 text-center font-bold text-xs text-amber-800">
                    #{stop.order}
                  </div>
                  <div className="col-span-7">
                    <input
                      type="text"
                      value={stop.name}
                      onChange={(e) => handleStopChange(sIdx, "name", e.target.value)}
                      placeholder="Attraction / Activity Name"
                      className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1 text-xs text-stone-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="text"
                      value={stop.duration}
                      onChange={(e) => handleStopChange(sIdx, "duration", e.target.value)}
                      placeholder="Duration / Time"
                      className="w-full bg-white border border-stone-300 rounded-lg px-2 py-1 text-xs text-stone-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="col-span-1 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemoveStop(sIdx)}
                      className="text-stone-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="col-span-11 col-start-2">
                    <textarea
                      rows={2}
                      value={stop.description || ""}
                      onChange={(e) => handleStopChange(sIdx, "description", e.target.value)}
                      maxLength={1000}
                      placeholder="Stop description (optional)"
                      className="w-full resize-y bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-500"
                    />
                    <div className="mt-1 text-right text-[10px] text-stone-500">{(stop.description || "").length}/1000</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
