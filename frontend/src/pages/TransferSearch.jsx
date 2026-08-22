import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MapPicker from "../components/MapPicker.jsx";
import DatePicker, { toLocalISO } from "../components/ui/DatePicker.jsx";

export default function TransferSearch() {
  const navigate = useNavigate();

  const [pickup, setPickup] = useState({
    name: "Lucknow Airport (LKO) - Terminal 1",
    lat: 26.7606,
    lng: 80.8893,
    state: "Uttar Pradesh"
  });

  const [drop, setDrop] = useState({
    name: "Hazratganj Market & Heritage Zone Lucknow",
    lat: 26.8467,
    lng: 80.9462,
    state: "Uttar Pradesh"
  });

  const [passengers, setPassengers] = useState(3);
  const [luggage, setLuggage] = useState(2);
  const [travelDate, setTravelDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [pickupTime, setPickupTime] = useState("10:30 AM");

  const [selectedVehicle, setSelectedVehicle] = useState("SEDAN");
  const [quoteResult, setQuoteResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchQuote = async (vehCode = selectedVehicle) => {
    setLoading(true);
    try {
      const res = await fetch("/api/transfers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          dropLat: drop.lat,
          dropLng: drop.lng,
          originState: pickup.state,
          destState: drop.state,
          passengers,
          luggage,
          selectedVehicle: vehCode
        })
      });
      const data = await res.json();
      if (data.success) {
        setQuoteResult(data);
      }
    } catch (err) {
      console.error("Failed to fetch transfer search", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote(selectedVehicle);
  }, [pickup, drop, passengers, luggage]);

  const handleVehicleSelect = (code) => {
    setSelectedVehicle(code);
    fetchQuote(code);
  };

  const handleBookNow = (option) => {
    const bookingParams = new URLSearchParams({
      vehicle: option.vehicleCategory,
      variant: option.vehicleDisplayName,
      date: travelDate,
      time: pickupTime,
      adults: String(passengers),
      children: "0",
      luggage: String(luggage),
      pickup: pickup.name,
      pickupLat: String(pickup.lat),
      pickupLng: String(pickup.lng),
      drop: drop.name,
      dropLat: String(drop.lat),
      dropLng: String(drop.lng),
      originState: pickup.state,
      destState: drop.state
    });
    navigate(`/checkout/prod_tr_lko_1?${bookingParams.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Strip */}
        <div className="text-center space-y-3">
          <span className="inline-block bg-amber-100 text-amber-900 border border-amber-300 text-xs font-mono px-3 py-1 rounded-full uppercase tracking-wider font-bold">
            Airport & Point-to-Point Transfers India
          </span>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold text-stone-900 tracking-tight">
            Reliable Chauffeur Cabs & Fleet Transfers
          </h1>
          <p className="text-sm sm:text-base text-stone-600 max-w-2xl mx-auto">
            Fixed rates, zero surge pricing, free airport waiting buffer & automated Fastag toll calculation across Tier-1, 2 & 3 Indian cities.
          </p>
        </div>

        {/* Top Controls Grid */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-md grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div>
            <label className="text-xs font-mono uppercase text-stone-500 mb-2 block font-bold">
              Travel Date & Pickup Time
            </label>
            <div className="grid grid-cols-2 gap-2">
              <DatePicker value={travelDate} min={toLocalISO(new Date())} onChange={setTravelDate} theme="light" ariaLabel="Choose transfer date" popoverTitle="Choose transfer date" buttonClassName="rounded-lg border-stone-300 bg-white py-2 text-xs text-stone-900" />
              <input
                type="text"
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                className="bg-[#FAF9F6] border border-stone-300 rounded-lg px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none"
                placeholder="e.g. 10:30 AM"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-mono uppercase text-stone-500 mb-2 block font-bold">
              Passengers (Adults & Kids)
            </label>
            <div className="flex items-center gap-3 bg-[#FAF9F6] border border-stone-300 rounded-lg px-3 py-1.5">
              <button
                onClick={() => setPassengers(Math.max(1, passengers - 1))}
                className="w-7 h-7 rounded bg-white border border-stone-300 text-stone-800 font-bold hover:bg-stone-100"
              >
                -
              </button>
              <span className="flex-1 text-center font-bold text-sm text-amber-700">
                {passengers} Pax
              </span>
              <button
                onClick={() => setPassengers(Math.min(26, passengers + 1))}
                className="w-7 h-7 rounded bg-white border border-stone-300 text-stone-800 font-bold hover:bg-stone-100"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-mono uppercase text-stone-500 mb-2 block font-bold">
              Check-in Luggage Bags
            </label>
            <div className="flex items-center gap-3 bg-[#FAF9F6] border border-stone-300 rounded-lg px-3 py-1.5">
              <button
                onClick={() => setLuggage(Math.max(0, luggage - 1))}
                className="w-7 h-7 rounded bg-white border border-stone-300 text-stone-800 font-bold hover:bg-stone-100"
              >
                -
              </button>
              <span className="flex-1 text-center font-bold text-sm text-emerald-700">
                {luggage} Bags
              </span>
              <button
                onClick={() => setLuggage(Math.min(20, luggage + 1))}
                className="w-7 h-7 rounded bg-white border border-stone-300 text-stone-800 font-bold hover:bg-stone-100"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => fetchQuote(selectedVehicle)}
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-2.5 px-4 rounded-lg transition-all shadow-md text-sm flex items-center justify-center gap-2"
            >
              {loading ? "Calculating Route..." : "⚡ Update Transfer Quote"}
            </button>
          </div>
        </div>

        {/* Map Picker & Geo-fence Visualizer */}
        <MapPicker
          originName={pickup.name}
          originLat={pickup.lat}
          originLng={pickup.lng}
          destName={drop.name}
          destLat={drop.lat}
          destLng={drop.lng}
          onLocationChange={({ pickup: p, drop: d }) => {
            setPickup(p);
            setDrop(d);
          }}
        />

        {/* Vehicle Options Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-serif font-bold text-stone-900 flex items-center gap-2">
              <span>🚗</span> Available Cab Categories for {passengers} Pax, {luggage} Bags
            </h2>
            {quoteResult && (
              <span className="text-xs font-mono text-stone-600">
                Estimated Distance: <strong className="text-amber-700">{quoteResult.selectedQuote.distanceKm} km</strong> ({quoteResult.selectedQuote.estimatedDurationMins} mins)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quoteResult?.allVehicleOptions?.map((option, idx) => {
              const isSelected = selectedVehicle === option.vehicleCategory;

              return (
                <div
                  key={idx}
                  onClick={() => handleVehicleSelect(option.vehicleCategory)}
                  className={`cursor-pointer rounded-2xl border transition-all p-6 relative flex flex-col justify-between ${
                    isSelected
                      ? "bg-white border-amber-500 ring-2 ring-amber-500/20 shadow-xl"
                      : "bg-white border-stone-200 hover:border-stone-300 shadow-sm hover:shadow-md"
                  }`}
                >
                  {isSelected && (
                    <span className="absolute -top-3 right-4 bg-amber-500 text-stone-950 font-bold text-[10px] uppercase px-2.5 py-0.5 rounded-full font-mono shadow-md">
                      Selected Category
                    </span>
                  )}

                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-serif text-lg font-bold text-stone-900">
                          {option.vehicleDisplayName}
                        </h3>
                        <p className="text-xs text-amber-700 font-mono font-semibold">
                          e.g. {option.exampleModels}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold font-mono text-emerald-700">
                          ₹{option.costBreakdown.totalAmount}
                        </span>
                        <span className="block text-[10px] text-stone-500 font-mono">
                          all-inclusive fare
                        </span>
                      </div>
                    </div>

                    {/* Specifications */}
                    <div className="grid grid-cols-2 gap-2 my-4 bg-stone-50 p-3 rounded-lg border border-stone-200 text-xs font-mono">
                      <div>
                        <span className="text-stone-500 block text-[10px]">PASSENGERS</span>
                        <span className="text-stone-900 font-bold">Up to {option.maxPassengers} Pax</span>
                      </div>
                      <div>
                        <span className="text-stone-500 block text-[10px]">CHECK-IN LUGGAGE</span>
                        <span className="text-stone-900 font-bold">Up to {option.maxLuggage} Bags</span>
                      </div>
                    </div>

                    {/* Matched Supplier Geo-Fence Polygon Badge */}
                    {option.supplier && (
                      <div className="mb-4 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs">
                        <div className="flex items-center justify-between text-amber-900 font-bold">
                          <span>🏢 {option.supplier.name}</span>
                          <span className="text-[10px] bg-amber-200/60 text-amber-900 font-mono px-2 py-0.5 rounded font-bold">
                            ⭐ {option.supplier.rating || 4.9}
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-600 mt-1 flex items-center gap-1 font-mono">
                          <span>📍 Matched Zone:</span>
                          <span className="text-amber-800 font-bold">{option.supplier.matchedZone}</span>
                          <span className="ml-auto text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono border border-emerald-300 font-bold">
                            {option.supplier.matchMethod === "POLYGON_BOUNDARY" ? "Precise boundary match" : "Verified route match"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Inclusions checklist */}
                    <ul className="space-y-1.5 text-xs text-stone-700 mb-6">
                      {option.inclusions.map((inc, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="text-emerald-600 font-bold">✓</span>
                          <span>{inc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBookNow(option);
                    }}
                    className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm ${
                      isSelected
                        ? "bg-amber-500 hover:bg-amber-400 text-stone-950"
                        : "bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300"
                    }`}
                  >
                    Select & Book Cab →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
