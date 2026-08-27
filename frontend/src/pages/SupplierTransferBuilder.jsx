import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Building2, CheckCircle2, Clock3, IndianRupee, LoaderCircle,
  MapPin, Plane, Route, ShieldCheck, Sparkles, Train, Users, Luggage,
  ArrowRight, ArrowLeftRight, Compass, Info, Check, Wand2
} from "lucide-react";
import PickupPointPicker from "../components/PickupPointPicker.jsx";
import { authHeaders } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import CityStateCountrySelect from "../components/supplier/CityStateCountrySelect.jsx";
import { getHubsForCity } from "../lib/transferHubs.js";

const ROUTE_TYPES = [
  {
    id: "AIRPORT_TRANSFER",
    label: "Airport transfer",
    description: "Airport ↔ Hotel, Resort, Home or Any Address",
    icon: Plane,
    category: "Airport Transfers",
    waiting: 60
  },
  {
    id: "RAILWAY_TRANSFER",
    label: "Railway transfer",
    description: "Railway Station ↔ Hotel, Home or Address",
    icon: Train,
    category: "Railway Station Transfers",
    waiting: 30
  },
  {
    id: "INTERCITY_TRANSFER",
    label: "Intercity transfer",
    description: "City to City with Doorstep Hotel/Home Pickup & Drop",
    icon: Route,
    category: "Intercity Transfers",
    waiting: 30
  },
  {
    id: "HOTEL_TRANSFER",
    label: "Hotel-to-hotel / Local",
    description: "Point-to-point transfer between resorts or areas",
    icon: Building2,
    category: "Hotel to Hotel Transfers",
    waiting: 15
  },
];

const SERVICE_DIRECTIONS = [
  {
    id: "ARRIVAL",
    label: "Arrival / Hub Pickup",
    badge: "Airport / Station → Any Hotel / Home",
    icon: Plane,
    desc: "Driver meets traveler at Airport / Station terminal with nameboard and drops them at any hotel or home in the destination zone."
  },
  {
    id: "DEPARTURE",
    label: "Departure / Hotel Pickup",
    badge: "Any Hotel / Home → Airport / Station",
    icon: Building2,
    desc: "Driver picks up traveler from any hotel or home in the origin zone and drops them directly at their airport / station terminal."
  },
];

const VEHICLES = [
  { id: "HATCHBACK", name: "Hatchback", models: "WagonR / Tiago", pax: 3, bags: 2 },
  { id: "SEDAN", name: "Sedan", models: "Dzire / Etios", pax: 4, bags: 3 },
  { id: "SUV", name: "SUV / MUV", models: "Ertiga / Marazzo", pax: 6, bags: 4 },
  { id: "PREMIUM_MUV", name: "Premium MUV", models: "Innova Crysta", pax: 6, bags: 5 },
  { id: "GROUP_TEMPO", name: "Tempo Traveller", models: "12–26 seater", pax: 26, bags: 20 },
];

const emptyPoint = { address: "", lat: null, lng: null, mapplsPin: "", confirmed: false };
const inputClass = "mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-400";

function routeDistance(origin, destination) {
  if (![origin?.lat, origin?.lng, destination?.lat, destination?.lng].every(Number.isFinite)) return null;
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(destination.lat - origin.lat);
  const dLng = radians(destination.lng - origin.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(origin.lat)) * Math.cos(radians(destination.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.max(1, Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.25 * 10) / 10);
}

function list(value) {
  return value.split(/,|\n/).map((item) => item.trim()).filter(Boolean);
}

export default function SupplierTransferBuilder() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const supplierId = user?.user_metadata?.supplier_id || user?.supplier_id || "sup_lucknow_cabs";

  const [routeType, setRouteType] = useState("AIRPORT_TRANSFER");
  const [serviceDirection, setServiceDirection] = useState("ARRIVAL");
  const [city, setCity] = useState("Goa");
  const [state, setState] = useState("Goa");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Hub & Zone State
  const [selectedHub, setSelectedHub] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [customZoneName, setCustomZoneName] = useState("");

  const [origin, setOrigin] = useState(emptyPoint);
  const [destination, setDestination] = useState(emptyPoint);
  const [distanceKm, setDistanceKm] = useState("38");
  const [durationMins, setDurationMins] = useState("65");
  const [freeWaitingMins, setFreeWaitingMins] = useState(60);
  const [tollIncluded, setTollIncluded] = useState(true);
  const [stateTaxIncluded, setStateTaxIncluded] = useState(true);
  const [constraintMode, setConstraintMode] = useState("RADIUS_FROM_CENTER");
  const [serviceRadiusKm, setServiceRadiusKm] = useState("40");
  const [allowedLocationTypes, setAllowedLocationTypes] = useState(["HOTEL_ZONE", "CRUISE_PORT", "CITY_CENTER"]);
  const [locationErrorMessage, setLocationErrorMessage] = useState("Please select a hotel or address inside the listed service area.");
  const [vehiclePrices, setVehiclePrices] = useState({
    HATCHBACK: "1200",
    SEDAN: "1500",
    SUV: "2000",
    PREMIUM_MUV: "2800",
    GROUP_TEMPO: ""
  });
  const [inclusions, setInclusions] = useState("AC vehicle, Fuel and chauffeur, Airport/Station parking charges, Free waiting time with flight tracking");
  const [exclusions, setExclusions] = useState("Extra stops outside coverage zone, Driver tip, Waiting beyond free allowance");
  const [errors, setErrors] = useState({});
  const [publishing, setPublishing] = useState(false);
  const [success, setSuccess] = useState(false);

  const selectedType = ROUTE_TYPES.find((type) => type.id === routeType) || ROUTE_TYPES[0];
  const searchContext = [city, state].filter(Boolean).join(", ");
  const activeVehicles = useMemo(() => VEHICLES.filter((vehicle) => Number(vehiclePrices[vehicle.id]) > 0), [vehiclePrices]);

  // City catalog hubs & popular zones
  const cityHubData = useMemo(() => getHubsForCity(city), [city]);

  // Default selection when city or route type changes
  useEffect(() => {
    if (cityHubData) {
      if (routeType === "AIRPORT_TRANSFER" && cityHubData.airports?.length > 0) {
        const defaultAirport = cityHubData.airports[0];
        setSelectedHub(defaultAirport);
        if (serviceDirection === "ARRIVAL") {
          setOrigin({
            address: defaultAirport.name,
            lat: defaultAirport.lat,
            lng: defaultAirport.lng,
            confirmed: true
          });
        }
      } else if (routeType === "RAILWAY_TRANSFER" && cityHubData.railways?.length > 0) {
        const defaultStation = cityHubData.railways[0];
        setSelectedHub(defaultStation);
        if (serviceDirection === "ARRIVAL") {
          setOrigin({
            address: defaultStation.name,
            lat: defaultStation.lat,
            lng: defaultStation.lng,
            confirmed: true
          });
        }
      }

      if (cityHubData.popularZones?.length > 0 && !selectedZone) {
        const defaultZone = cityHubData.popularZones[0];
        setSelectedZone(defaultZone);
        setCustomZoneName(defaultZone.name);
        setDestination({
          address: `${defaultZone.name} Hotels, Resorts & Addresses`,
          lat: defaultZone.lat,
          lng: defaultZone.lng,
          confirmed: true
        });
        if (defaultZone.avgDistanceKm) setDistanceKm(String(defaultZone.avgDistanceKm));
        if (defaultZone.avgDurationMins) setDurationMins(String(defaultZone.avgDurationMins));
      }
    }
  }, [city, routeType]);

  // Recalculate distance if points change
  useEffect(() => {
    const estimated = routeDistance(origin, destination);
    if (!estimated) return;
    setDistanceKm(String(estimated));
    setDurationMins(String(Math.max(20, Math.round(estimated * (routeType === "INTERCITY_TRANSFER" ? 1.5 : 2.0)))));
  }, [origin.lat, origin.lng, destination.lat, destination.lng, routeType]);

  // Choose route type
  const chooseRouteType = (type) => {
    setRouteType(type.id);
    setFreeWaitingMins(type.waiting);
  };

  // Select a preset Hub (Airport / Station)
  const selectPresetHub = (hub) => {
    setSelectedHub(hub);
    if (serviceDirection === "ARRIVAL" || serviceDirection === "BOTH") {
      setOrigin({
        address: hub.name,
        lat: hub.lat,
        lng: hub.lng,
        confirmed: true
      });
    } else {
      setDestination({
        address: hub.name,
        lat: hub.lat,
        lng: hub.lng,
        confirmed: true
      });
    }
  };

  // Select a preset Coverage Zone
  const selectPresetZone = (zone) => {
    setSelectedZone(zone);
    setCustomZoneName(zone.name);
    if (zone.avgDistanceKm) setDistanceKm(String(zone.avgDistanceKm));
    if (zone.avgDurationMins) setDurationMins(String(zone.avgDurationMins));

    const zoneLabel = `${zone.name} Hotels, Resorts & Addresses`;
    if (serviceDirection === "ARRIVAL" || serviceDirection === "BOTH") {
      setDestination({
        address: zoneLabel,
        lat: zone.lat,
        lng: zone.lng,
        confirmed: true
      });
    } else {
      setOrigin({
        address: zoneLabel,
        lat: zone.lat,
        lng: zone.lng,
        confirmed: true
      });
    }
  };

  // Auto-Generate Title & Description
  const autoGenerateContent = () => {
    const hubName = selectedHub?.shortName || selectedHub?.name || (routeType === "AIRPORT_TRANSFER" ? `${city} Airport` : `${city} Railway Station`);
    const zoneName = customZoneName || selectedZone?.name || `${city} Hotels`;

    let generatedTitle = "";
    let generatedDesc = "";

    if (serviceDirection === "ARRIVAL") {
      generatedTitle = `${hubName} to ${zoneName} Private Transfer`;
      generatedDesc = `Direct private AC transfer from ${hubName} with flight/train tracking, professional chauffeur meet & greet with nameboard, and doorstep drop-off at any hotel, resort, or home in ${zoneName}. Free waiting time included.`;
    } else if (serviceDirection === "DEPARTURE") {
      generatedTitle = `${zoneName} to ${hubName} Private Departure Transfer`;
      generatedDesc = `Comfortable doorstep private transfer from any hotel, resort, or address in ${zoneName} to ${hubName}. Punctual pickup with luggage assistance and direct terminal drop-off.`;
    } else {
      generatedTitle = `${hubName} ↔ ${zoneName} Two-Way Private Transfer`;
      generatedDesc = `Reliable private transfer between ${hubName} and any hotel, resort, or home in ${zoneName}. All-inclusive fixed fare with AC vehicle and professional chauffeur.`;
    }

    setTitle(generatedTitle);
    setDescription(generatedDesc);
  };

  const validate = () => {
    const next = {};
    if (!city.trim()) next.city = "Enter the primary operating city.";
    if (!state.trim()) next.state = "Enter the state.";
    if (title.trim().length < 5) next.title = "Enter a clear marketplace title.";
    if (description.trim().length < 15) next.description = "Add a short service description of at least 15 characters.";
    if (!origin.confirmed && !origin.address) next.origin = "Select or confirm the pickup hub/origin.";
    if (!destination.confirmed && !destination.address) next.destination = "Select or confirm the destination coverage zone.";
    if (!Number(distanceKm) || !Number(durationMins)) next.route = "Confirm an estimated route distance and duration.";
    if (!Number(serviceRadiusKm) || Number(serviceRadiusKm) > 500) next.route = "Service radius must be between 1 and 500 km.";
    if (!activeVehicles.length) next.vehicles = "Add a fare for at least one vehicle.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const publish = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setPublishing(true);
    setErrors({});
    try {
      const primaryVehicle = activeVehicles[0];
      const prices = activeVehicles.map((vehicle) => Number(vehiclePrices[vehicle.id]));
      
      const hubLabel = selectedHub?.name || origin.address;
      const zoneLabel = customZoneName || destination.address;

      const response = await fetch(`/api/suppliers/${supplierId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          productType: "TRANSFER",
          groupType: "PRIVATE",
          title: title.trim(),
          city: city.trim(),
          state: state.trim(),
          country: "India",
          category: selectedType.category,
          shortDesc: description.trim(),
          fullDesc: description.trim(),
          durationHours: Number(durationMins) / 60,
          priceInr: Math.min(...prices),
          inclusions: list(inclusions),
          exclusions: list(exclusions),
          itinerary: [
            {
              order: 1,
              name: serviceDirection === "ARRIVAL" ? hubLabel : `${zoneLabel} (Traveler Hotel/Home Pickup)`
            },
            {
              order: 2,
              name: serviceDirection === "ARRIVAL" ? `${zoneLabel} (Any Hotel/Home Drop-off)` : hubLabel
            }
          ],
          transferMeta: {
            routeType,
            serviceDirection,
            hubType: routeType === "AIRPORT_TRANSFER" ? "AIRPORT" : routeType === "RAILWAY_TRANSFER" ? "RAILWAY" : "CITY",
            originName: origin.address || hubLabel,
            originLat: origin.lat || 15.7538,
            originLng: origin.lng || 73.8643,
            originRadiusKm: serviceDirection === "DEPARTURE" ? Number(serviceRadiusKm) : 3,
            originIata: routeType === "AIRPORT_TRANSFER" && serviceDirection === "ARRIVAL" ? selectedHub?.id : null,
            destName: destination.address || zoneLabel,
            destLat: destination.lat || 15.5439,
            destLng: destination.lng || 73.7553,
            destRadiusKm: serviceDirection === "ARRIVAL" ? Number(serviceRadiusKm) : 3,
            destIata: routeType === "AIRPORT_TRANSFER" && serviceDirection === "DEPARTURE" ? selectedHub?.id : null,
            zoneName: zoneLabel,
            isFlexibleDropoff: true,
            constraintMode,
            allowedLocationTypes,
            errorMessage: locationErrorMessage,
            distanceKm: Number(distanceKm),
            durationMins: Number(durationMins),
            vehicleCategory: primaryVehicle.id,
            maxPax: primaryVehicle.pax,
            maxBags: primaryVehicle.bags,
            freeWaitingMins: Number(freeWaitingMins),
            tollIncluded,
            stateTaxIncluded,
          },
          options: [{
            code: "STANDARD",
            name: `${selectedType.label} · ${serviceDirection === "ARRIVAL" ? "Arrival" : "Departure"}`,
            pickupOptionType: "PICKUP_EVERYONE",
            confirmationType: "INSTANT_THEN_MANUAL",
            supportedArrivalModes: [routeType === "RAILWAY_TRANSFER" ? "RAIL" : routeType === "AIRPORT_TRANSFER" ? "AIR" : "OTHER"],
            supportedDepartureModes: [routeType === "RAILWAY_TRANSFER" ? "RAIL" : routeType === "AIRPORT_TRANSFER" ? "AIR" : "OTHER"],
            allowCustomTravelerPickup: true,
            waitingTimeMinutes: Number(freeWaitingMins),
            locations: [{ ref: selectedHub?.id || null, pickupType: routeType === "AIRPORT_TRANSFER" ? "AIRPORT" : routeType === "RAILWAY_TRANSFER" ? "LOCATION" : "LOCATION", mode: routeType === "RAILWAY_TRANSFER" ? "RAIL" : routeType === "AIRPORT_TRANSFER" ? "AIR" : "OTHER", displayLabel: hubLabel, address: hubLabel, city, state, lat: origin.lat, lng: origin.lng }],
          }],
          pricingVariants: activeVehicles.map((vehicle) => ({
            variantName: `${vehicle.name} (${vehicle.models}) · up to ${vehicle.pax} guests`,
            basePrice: Number(vehiclePrices[vehicle.id]),
            pricingModel: "FIXED",
          })),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "The transfer listing could not be published.");
      setSuccess(true);
      window.setTimeout(() => navigate("/supplier/dashboard"), 1400);
    } catch (error) {
      setErrors({ submit: error.message || "The transfer listing could not be published." });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] px-4 py-8 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link to="/supplier/products/create" className="inline-flex items-center gap-2 text-xs font-bold text-stone-500 hover:text-amber-800">
          <ArrowLeft className="h-4 w-4" /> Change listing type
        </Link>
        
        {/* Header */}
        <header className="mt-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-amber-800">
            <Sparkles className="h-4 w-4 text-amber-600" /> Supplier transfer builder
          </span>
          <h1 className="mt-2 font-display text-3xl font-bold text-stone-900 sm:text-4xl">
            Add a private transfer service
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Define your transit hub, destination coverage zone, and vehicle fares. Travelers can enter any hotel, resort, or home address in your covered zone at checkout.
          </p>
        </header>

        {success ? (
          <div className="mt-6 rounded-3xl border border-emerald-300 bg-emerald-50 p-10 text-center animate-in fade-in zoom-in-95">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h2 className="mt-4 font-display text-2xl font-bold text-emerald-950">Transfer listing published</h2>
            <p className="mt-2 text-sm text-emerald-800">It is now live in your supplier inventory and bookable across India.</p>
          </div>
        ) : (
          <form onSubmit={publish} className="mt-6 space-y-6">
            {/* Step 1: Choose Transfer Type */}
            <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="font-display text-xl font-bold text-stone-900">1. Choose transfer type</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ROUTE_TYPES.map((type) => {
                  const Icon = type.icon;
                  const active = routeType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => chooseRouteType(type)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        active
                          ? "border-amber-500 bg-amber-50 ring-2 ring-amber-400"
                          : "border-stone-200 bg-[#FAF9F6] hover:border-stone-300"
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${active ? "text-amber-600" : "text-stone-400"}`} />
                      <strong className="mt-3 block text-sm text-stone-900">{type.label}</strong>
                      <span className="mt-1 block text-xs leading-relaxed text-stone-500">{type.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Step 2: Marketplace Details */}
            <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-bold text-stone-900">2. Operating location & details</h2>
                <button
                  type="button"
                  onClick={autoGenerateContent}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition shadow-sm"
                >
                  <Wand2 className="h-3.5 w-3.5 text-amber-600" /> Auto-generate Title & Description
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <CityStateCountrySelect
                  city={city}
                  state={state}
                  errors={errors}
                  cityLabel="Operating / origin city"
                  onChange={(location) => {
                    setCity(location.city);
                    setState(location.state);
                  }}
                />

                <label className="block text-xs font-bold text-stone-700">
                  Listing title
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Goa Mopa Airport (GOX) to North Goa Hotels & Addresses Private Transfer"
                    className={inputClass}
                  />
                  {errors.title && <span className="mt-1 block text-rose-600 text-xs">{errors.title}</span>}
                </label>

                <label className="block text-xs font-bold text-stone-700">
                  Short description
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Fixed-fare private AC transfer with professional chauffeur, nameboard meet & greet, flight tracking, and doorstep hotel drop-off."
                    className={`${inputClass} py-3`}
                  />
                  {errors.description && <span className="mt-1 block text-rose-600 text-xs">{errors.description}</span>}
                </label>
              </div>
            </section>

            {/* Step 3: Confirm Route & Flexible Destination Coverage Zone */}
            <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-amber-600" />
                <div>
                  <h2 className="font-display text-xl font-bold text-stone-900">
                    3. Service Route & Destination Coverage Zone
                  </h2>
                  <p className="text-xs text-stone-500">
                    Select the fixed transit hub (Airport/Station) and the destination coverage area.
                  </p>
                </div>
              </div>

              {/* Service Direction Selector */}
              {["AIRPORT_TRANSFER", "RAILWAY_TRANSFER"].includes(routeType) && (
                <div>
                  <span className="block text-xs font-bold text-stone-700 mb-2">Service Direction</span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {SERVICE_DIRECTIONS.map((dir) => {
                      const Icon = dir.icon;
                      const active = serviceDirection === dir.id;
                      return (
                        <button
                          key={dir.id}
                          type="button"
                          onClick={() => {
                            setServiceDirection(dir.id);
                            if (dir.id === "ARRIVAL" && selectedHub) {
                              setOrigin({ address: selectedHub.name, lat: selectedHub.lat, lng: selectedHub.lng, confirmed: true });
                              if (selectedZone) setDestination({ address: `${selectedZone.name} Hotels & Addresses`, lat: selectedZone.lat, lng: selectedZone.lng, confirmed: true });
                            } else if (dir.id === "DEPARTURE" && selectedHub) {
                              setDestination({ address: selectedHub.name, lat: selectedHub.lat, lng: selectedHub.lng, confirmed: true });
                              if (selectedZone) setOrigin({ address: `${selectedZone.name} Hotels & Addresses`, lat: selectedZone.lat, lng: selectedZone.lng, confirmed: true });
                            }
                          }}
                          className={`rounded-2xl border p-4 text-left transition ${
                            active
                              ? "border-amber-500 bg-amber-50 ring-2 ring-amber-400"
                              : "border-stone-200 bg-[#FAF9F6] hover:border-stone-300"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${active ? "text-amber-600" : "text-stone-400"}`} />
                            <strong className="text-xs text-stone-900 font-bold">{dir.label}</strong>
                          </div>
                          <span className="mt-2 block text-[11px] font-medium text-amber-900 bg-white/70 px-2 py-0.5 rounded border border-amber-200">
                            {dir.badge}
                          </span>
                          <p className="mt-1.5 text-[10px] text-stone-500 leading-relaxed">{dir.desc}</p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid gap-3 rounded-xl border border-emerald-200 bg-white p-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-stone-700">Constraint mode<select value={constraintMode} onChange={(event) => setConstraintMode(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-xs"><option value="RADIUS_FROM_CENTER">Radius from center</option><option value="CITY_ANYWHERE">Anywhere in city</option><option value="ZONE_POLYGON">Mapped polygon</option></select></label>
                    <label className="text-xs font-bold text-stone-700">Acceptance radius (km)<input type="number" min="1" max="500" value={serviceRadiusKm} onChange={(event) => setServiceRadiusKm(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-xs" /></label>
                    <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-stone-700">Allowed point types</legend><div className="mt-2 flex flex-wrap gap-2">{["HOTEL_ZONE", "CRUISE_PORT", "CITY_CENTER", "LANDMARK"].map((type) => <label key={type} className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px]"><input type="checkbox" checked={allowedLocationTypes.includes(type)} onChange={() => setAllowedLocationTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])} />{type.replaceAll("_", " ")}</label>)}</div></fieldset>
                    <label className="text-xs font-bold text-stone-700 sm:col-span-2">Traveler-facing rejection message<input value={locationErrorMessage} onChange={(event) => setLocationErrorMessage(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-xs" /></label>
                  </div>
                </div>
              )}

              {/* Transit Hub & Destination Zone Grid */}
              <div className="grid gap-5 lg:grid-cols-2">
                {/* Column A: Fixed Transit Hub (Airport / Station) */}
                <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      {routeType === "AIRPORT_TRANSFER" ? <Plane className="h-4 w-4 text-amber-600" /> : <Train className="h-4 w-4 text-amber-600" />}
                      {serviceDirection === "ARRIVAL" ? "Pickup Hub (Fixed Point)" : "Drop-off Hub (Fixed Point)"}
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                      FIXED TERMINAL
                    </span>
                  </div>

                  {/* Smart Hub Quick-Select Chips */}
                  {cityHubData && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] text-stone-500 font-medium">Quick-select for {city}:</span>
                      <div className="flex flex-wrap gap-2">
                        {(routeType === "AIRPORT_TRANSFER" ? cityHubData.airports : cityHubData.railways)?.map((hub) => {
                          const isSelected = selectedHub?.id === hub.id;
                          return (
                            <button
                              key={hub.id}
                              type="button"
                              onClick={() => selectPresetHub(hub)}
                              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                                isSelected
                                  ? "bg-amber-600 text-white shadow-sm"
                                  : "bg-white border border-stone-300 text-stone-700 hover:border-amber-400 hover:bg-amber-50"
                              }`}
                            >
                              {isSelected && <Check className="h-3 w-3" />}
                              {hub.shortName || hub.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Hub Location Picker */}
                  <PickupPointPicker
                    value={serviceDirection === "ARRIVAL" ? origin : destination}
                    nearbyLocation={serviceDirection === "ARRIVAL" ? destination : origin}
                    searchContext={searchContext}
                    onChange={serviceDirection === "ARRIVAL" ? setOrigin : setDestination}
                    label={serviceDirection === "ARRIVAL" ? "Selected pickup terminal" : "Selected drop-off terminal"}
                    placeholder={routeType === "AIRPORT_TRANSFER" ? "Search airport or terminal..." : "Search railway station..."}
                  />
                </div>

                {/* Column B: Destination Coverage Area / User Drop-off Zone */}
                <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-emerald-600" />
                      {serviceDirection === "ARRIVAL" ? "Drop-off Coverage Zone" : "Pickup Coverage Zone"}
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300">
                      ANY HOTEL / HOME
                    </span>
                  </div>

                  {/* Popular Zone Quick-Select Chips */}
                  {cityHubData?.popularZones?.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] text-stone-500 font-medium">Popular destination zones in {city}:</span>
                      <div className="flex flex-wrap gap-2">
                        {cityHubData.popularZones.map((zone) => {
                          const isSelected = selectedZone?.id === zone.id;
                          return (
                            <button
                              key={zone.id}
                              type="button"
                              onClick={() => selectPresetZone(zone)}
                              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                                isSelected
                                  ? "bg-emerald-700 text-white shadow-sm"
                                  : "bg-white border border-stone-300 text-stone-700 hover:border-emerald-400 hover:bg-emerald-50"
                              }`}
                            >
                              {isSelected && <Check className="h-3 w-3" />}
                              {zone.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Custom Zone Name Input */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700">
                      Coverage Zone Name / Destination Area
                      <input
                        value={customZoneName}
                        onChange={(e) => {
                          setCustomZoneName(e.target.value);
                          if (serviceDirection === "ARRIVAL") {
                            setDestination((prev) => ({ ...prev, address: `${e.target.value} Hotels & Addresses` }));
                          } else {
                            setOrigin((prev) => ({ ...prev, address: `${e.target.value} Hotels & Addresses` }));
                          }
                        }}
                        placeholder="e.g. North Goa (Calangute, Baga, Candolim, Anjuna, Panaji)"
                        className="mt-1 min-h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-xs text-stone-900 outline-none focus:border-emerald-500"
                      />
                    </label>
                  </div>

                  {/* Drop-off Zone Picker & Map Center */}
                  <PickupPointPicker
                    value={serviceDirection === "ARRIVAL" ? destination : origin}
                    nearbyLocation={serviceDirection === "ARRIVAL" ? origin : destination}
                    searchContext={searchContext}
                    onChange={serviceDirection === "ARRIVAL" ? setDestination : setOrigin}
                    label="Zone center / representative location"
                    kind="dropoff"
                    markerLabel="Z"
                    placeholder="Search central area, landmark or beach belt..."
                  />

                  {/* Real-world Traveler Notice */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] leading-relaxed text-emerald-950 flex items-start gap-2">
                    <Info className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                    <span>
                      <strong>Traveler Flexibility:</strong> Travelers will enter their specific hotel name, resort, Airbnb, or home address during checkout. Your fixed fare covers direct drop-off anywhere in this destination zone.
                    </span>
                  </div>
                </div>
              </div>

              {(errors.origin || errors.destination) && (
                <p className="text-xs text-rose-600 font-bold">{errors.origin || errors.destination}</p>
              )}

              {/* Distance, Duration & Waiting Time */}
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <label className="text-xs font-bold text-stone-700">
                  Estimated distance (km)
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    value={distanceKm}
                    onChange={(event) => setDistanceKm(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-bold text-stone-700">
                  Estimated journey time (mins)
                  <input
                    type="number"
                    min="1"
                    value={durationMins}
                    onChange={(event) => setDurationMins(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-bold text-stone-700">
                  Complimentary waiting (mins)
                  <input
                    type="number"
                    min="0"
                    max="240"
                    value={freeWaitingMins}
                    onChange={(event) => setFreeWaitingMins(event.target.value)}
                    className={inputClass}
                  />
                  <span className="text-[10px] text-stone-500 font-normal mt-1 block">
                    (Standard: 60 mins for flights, 30 mins for trains)
                  </span>
                </label>
              </div>
              {errors.route && <p className="text-xs text-rose-600 font-bold">{errors.route}</p>}
            </section>

            {/* Step 4: Vehicle Fares */}
            <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <IndianRupee className="h-5 w-5 text-emerald-600" />
                <div>
                  <h2 className="font-display text-xl font-bold text-stone-900">4. Vehicle fares</h2>
                  <p className="text-xs text-stone-500">
                    Enter the all-inclusive fixed fare for each vehicle category you operate for this route.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {VEHICLES.map((vehicle) => (
                  <label
                    key={vehicle.id}
                    className={`rounded-2xl border p-4 transition ${
                      Number(vehiclePrices[vehicle.id]) > 0
                        ? "border-emerald-300 bg-emerald-50/50"
                        : "border-stone-200 bg-[#FAF9F6]"
                    }`}
                  >
                    <strong className="block text-sm text-stone-900">{vehicle.name}</strong>
                    <span className="mt-1 block text-[10px] text-stone-500">{vehicle.models}</span>
                    <span className="mt-2 flex gap-3 text-[10px] text-stone-500">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{vehicle.pax} pax</span>
                      <span className="flex items-center gap-1"><Luggage className="h-3 w-3" />{vehicle.bags} bags</span>
                    </span>
                    <span className="mt-3 flex items-center rounded-xl border border-stone-300 bg-white px-3 focus-within:border-emerald-500">
                      <IndianRupee className="h-4 w-4 text-stone-400" />
                      <input
                        type="number"
                        min="0"
                        value={vehiclePrices[vehicle.id]}
                        onChange={(event) =>
                          setVehiclePrices((current) => ({ ...current, [vehicle.id]: event.target.value }))
                        }
                        placeholder="Not offered"
                        className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-sm text-stone-900 outline-none"
                      />
                    </span>
                  </label>
                ))}
              </div>
              {errors.vehicles && <p className="mt-2 text-xs text-rose-600 font-bold">{errors.vehicles}</p>}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 text-xs font-bold text-stone-700">
                  <span>Fastag toll included in fare</span>
                  <input
                    type="checkbox"
                    checked={tollIncluded}
                    onChange={(event) => setTollIncluded(event.target.checked)}
                    className="h-4 w-4 accent-amber-500"
                  />
                </label>
                <label className="flex items-center justify-between rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 text-xs font-bold text-stone-700">
                  <span>State passenger tax included</span>
                  <input
                    type="checkbox"
                    checked={stateTaxIncluded}
                    onChange={(event) => setStateTaxIncluded(event.target.checked)}
                    className="h-4 w-4 accent-amber-500"
                  />
                </label>
              </div>
            </section>

            {/* Step 5: Fare Inclusions & Exclusions */}
            <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="font-display text-xl font-bold text-stone-900">5. Fare inclusions & policies</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-stone-700">
                  Included in fare
                  <textarea
                    rows={3}
                    value={inclusions}
                    onChange={(event) => setInclusions(event.target.value)}
                    className={`${inputClass} py-3`}
                  />
                </label>
                <label className="text-xs font-bold text-stone-700">
                  Not included (Exclusions)
                  <textarea
                    rows={3}
                    value={exclusions}
                    onChange={(event) => setExclusions(event.target.value)}
                    className={`${inputClass} py-3`}
                  />
                </label>
              </div>
            </section>

            {errors.submit && (
              <div role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
                {errors.submit}
              </div>
            )}

            {/* Publish Bar */}
            <div className="flex flex-col gap-3 rounded-3xl border border-stone-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between shadow-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" />
                <div>
                  <strong className="text-sm text-stone-900">Ready to publish service</strong>
                  <p className="mt-1 text-xs text-stone-500">
                    The route will appear live with {activeVehicles.length || 0} bookable vehicle option{activeVehicles.length === 1 ? "" : "s"}.
                  </p>
                </div>
              </div>
              <button
                disabled={publishing}
                type="submit"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-8 text-sm font-bold text-stone-950 shadow-sm disabled:opacity-60 transition"
              >
                {publishing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {publishing ? "Publishing listing…" : "Publish transfer listing"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
