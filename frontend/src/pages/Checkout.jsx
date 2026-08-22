import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, CalendarDays, Check, Clock3, CreditCard, Info,
  LockKeyhole, MapPin, Navigation, ShieldCheck, Sparkles, TestTube2,
  UserRound, Users
} from "lucide-react";
import { api } from "../lib/api.js";
import { analytics } from "../lib/analytics.js";
import { useAuth } from "../lib/auth.jsx";
import PickupPointPicker from "../components/PickupPointPicker.jsx";

const PICKUP_TYPES = [
  { id: "HOTEL", label: "Hotel / stay", icon: "🏨", placeholder: "Hotel or property name, full address and area" },
  { id: "AIRPORT", label: "Airport", icon: "✈️", placeholder: "Airport, terminal and arrival flight number" },
  { id: "MEETING_POINT", label: "Meeting point", icon: "📍", placeholder: "Landmark, attraction entrance or meeting-point address" },
  { id: "OTHER", label: "Other address", icon: "🧭", placeholder: "Complete pickup address with a nearby landmark" }
];

const PAYMENT_OPTIONS = [
  {
    id: "CASHFREE",
    name: "Cashfree Payment Gateway",
    description: "Pay securely via UPI (Google Pay, PhonePe, Paytm), Debit/Credit Cards, Netbanking & Wallets.",
    badge: "INSTANT SECURE",
    icon: CreditCard
  },
  {
    id: "DEMO",
    name: "Demo sandbox payment",
    description: "Confirm a test booking instantly with ₹0 charged.",
    badge: "TEST MODE",
    icon: TestTube2
  }
];

function loadCashfreeSdk() {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) {
      resolve(window.Cashfree);
      return;
    }
    const existing = document.getElementById("cashfree-js-sdk");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Cashfree));
      existing.addEventListener("error", () => reject(new Error("Cashfree SDK failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.id = "cashfree-js-sdk";
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.onload = () => resolve(window.Cashfree);
    script.onerror = () => reject(new Error("Failed to load Cashfree payment gateway SDK"));
    document.body.appendChild(script);
  });
}

function locationFromParams(params, name) {
  const address = params.get(name) || "";
  const lat = params.has(`${name}Lat`) ? Number(params.get(`${name}Lat`)) : null;
  const lng = params.has(`${name}Lng`) ? Number(params.get(`${name}Lng`)) : null;
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
  return { address, lat, lng, mapplsPin: "", confirmed: Boolean(address && hasCoordinates) };
}

export default function Checkout() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [activity, setActivity] = useState(null);
  const [loadingError, setLoadingError] = useState("");
  const [travelerName, setTravelerName] = useState(user?.name || "");
  const [travelerPhone, setTravelerPhone] = useState(user?.phone || "");
  const [travelerEmail, setTravelerEmail] = useState(user?.email || "");
  const [pickupType, setPickupType] = useState("HOTEL");
  const [joiningMethod, setJoiningMethod] = useState("");
  const [pickupPoint, setPickupPoint] = useState(() => locationFromParams(params, "pickup"));
  const [dropPoint, setDropPoint] = useState(() => locationFromParams(params, "drop"));
  const [pickupTime, setPickupTime] = useState(params.get("time") || "09:00");
  const [flightNumber, setFlightNumber] = useState("");
  const [pickupInstructions, setPickupInstructions] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASHFREE");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError, setQuoteError] = useState("");
  const [clientRequestId] = useState(() => globalThis.crypto?.randomUUID?.() || `booking-${Date.now()}-${Math.random()}`);

  const date = params.get("date") || new Date().toISOString().split("T")[0];
  const adults = Number(params.get("adults") || params.get("pax") || 1);
  const children = Number(params.get("children") || 0);
  const luggage = Number(params.get("luggage") || 0);
  const vehicle = params.get("vehicle") || "SEDAN";
  const variant = params.get("variant") || "Standard Booking";

  useEffect(() => {
    let active = true;
    api.getActivity(id)
      .then((data) => {
        if (!active) return;
        setActivity(data);
        // Prepopulate origin or destination from listing transferMeta if available
        if (data?.transferMeta) {
          const meta = data.transferMeta;
          const isArr = String(meta.serviceDirection || "ARRIVAL").toUpperCase() !== "DEPARTURE";
          if (isArr && meta.originName && !pickupPoint.address) {
            setPickupPoint({ address: meta.originName, lat: meta.originLat, lng: meta.originLng, mapplsPin: "", confirmed: true });
          }
          if (!isArr && meta.destName && !dropPoint.address) {
            setDropPoint({ address: meta.destName, lat: meta.destLat, lng: meta.destLng, mapplsPin: "", confirmed: true });
          }
        }
      })
      .catch((err) => { if (active) setLoadingError(err.message || "This experience is unavailable."); });
    window.scrollTo(0, 0);
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!user) return;
    setTravelerName((current) => current || user.name || "");
    setTravelerPhone((current) => current || user.phone || "");
    setTravelerEmail((current) => current || user.email || "");
  }, [user]);

  useEffect(() => {
    if (!activity || joiningMethod) return;
    const type = activity.productType || activity.product_type;
    const shared = vehicle === "SHARED_SEAT" || activity.groupType === "SHARED" || activity.group_type === "SHARED";
    setJoiningMethod(type === "TRANSFER" ? "PICKUP" : type === "MULTI_DAY_PACKAGE" ? "PICKUP" : shared ? "MEET" : "PICKUP");
  }, [activity, joiningMethod, vehicle]);

  const pickupOption = PICKUP_TYPES.find((option) => option.id === pickupType) || PICKUP_TYPES[0];
  const isShared = activity && (vehicle === "SHARED_SEAT" || activity.groupType === "SHARED" || activity.group_type === "SHARED");
  const productType = activity?.productType || activity?.product_type || "DAY_TOUR";
  const isTransfer = productType === "TRANSFER";
  const isPackage = productType === "MULTI_DAY_PACKAGE";
  const isArrivalTransfer = isTransfer && String(activity?.transferMeta?.serviceDirection || "ARRIVAL").toUpperCase() !== "DEPARTURE";

  const destinationSearchContext = [
    isPackage ? activity?.packageItinerary?.start_city : "",
    activity?.city,
    activity?.state,
  ].filter((part, index, parts) => part && parts.indexOf(part) === index).join(", ");
  const firstStop = Array.isArray(activity?.itinerary) ? activity.itinerary[0] : null;
  const meetingPoint = isPackage
    ? activity?.packageItinerary?.start_point || activity?.packageItinerary?.start_city || `${activity?.city || "Destination"} arrival point`
    : (typeof firstStop === "string" ? firstStop : firstStop?.name) || `${activity?.city || "Destination"} meeting point`;
  const rawBaseFare = Number(quote?.breakdown?.baseAmount || 0);
  const fastagTolls = Number(quote?.breakdown?.fastagTolls || 0) + Number(quote?.breakdown?.stateTax || 0);
  const gstTax = Number(quote?.breakdown?.gstAmount || 0);
  const totalAmount = Number(quote?.breakdown?.totalAmount || 0);
  const pickupLocation = isTransfer || joiningMethod === "PICKUP"
    ? pickupPoint.address
    : joiningMethod === "MEET"
      ? `Meet at departure point — ${meetingPoint}`
      : "Pickup details to be confirmed";
  const dropLocation = dropPoint.address;
  const pickupReady = Boolean(pickupTime) && (
    joiningMethod === "MEET" || joiningMethod === "LATER" ||
    (pickupPoint.address.trim().length >= 3)
  );
  const travelerReady = Boolean(travelerName.trim() && travelerPhone.trim() && travelerEmail.trim());
  const dropReady = !isTransfer || Boolean(dropLocation.trim().length >= 3);

  useEffect(() => {
    if (!activity) return;
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      setQuoteError("");
      api.getBookingQuote({
        product_id: id,
        activity_date: date,
        adults,
        children,
        luggage_bags: luggage,
        vehicle_category: vehicle,
        variant_name: variant,
        pickup_lat: pickupPoint.lat,
        pickup_lng: pickupPoint.lng,
        drop_lat: dropPoint.lat,
        drop_lng: dropPoint.lng,
        origin_state: params.get("originState"),
        dest_state: params.get("destState")
      }).then((data) => {
        setQuote(data.quote);
        if (data.quote && activity) {
          analytics.trackBeginCheckout(activity, data.quote.breakdown?.totalAmount, adults + children);
        }
      }).catch((err) => {
        setQuote(null);
        setQuoteError(err.message || "This option could not be priced.");
      }).finally(() => setQuoteLoading(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [activity, id, date, adults, children, luggage, vehicle, variant, pickupPoint.lat, pickupPoint.lng, dropPoint.lat, dropPoint.lng, params]);

  const progress = useMemo(() => [
    { label: "Traveler", ready: travelerReady, icon: UserRound },
    { label: isTransfer ? "Route" : "Meeting", ready: pickupReady && dropReady, icon: MapPin },
    { label: "Confirm", ready: false, icon: LockKeyhole }
  ], [dropReady, isTransfer, pickupReady, travelerReady]);

  const handleSubmitBooking = async (event) => {
    event.preventDefault();
    setError("");
    if (!pickupReady) {
      setError(isTransfer ? "Select and confirm the exact pickup point, then choose the ready time." : "Choose how you will join the experience and add the requested details.");
      document.getElementById("pickup-details")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!dropReady) {
      setError("Select the drop-off from Mappls and confirm its exact point on the map.");
      document.getElementById("dropoff-details")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!quote) {
      setError(quoteError || "Wait for the secure server price before continuing.");
      return;
    }

    setProcessing(true);
    try {
      const bookingRes = await api.createBooking({
        product_id: id,
        activity_id: id,
        activity_date: date,
        pickup_type: isTransfer || joiningMethod === "PICKUP" ? pickupType : joiningMethod === "MEET" ? "MEETING_POINT" : "PROVIDE_LATER",
        pickup_time: pickupTime,
        pickup_location: pickupLocation.trim(),
        pickup_instructions: pickupInstructions.trim(),
        pickup_lat: pickupPoint.lat,
        pickup_lng: pickupPoint.lng,
        drop_location: dropLocation.trim() || null,
        drop_lat: dropPoint.lat,
        drop_lng: dropPoint.lng,
        flight_number: flightNumber.trim() || null,
        origin_state: params.get("originState"),
        dest_state: params.get("destState"),
        special_requests: specialRequests.trim(),
        adults, children, luggage_bags: luggage,
        vehicle_category: vehicle,
        variant_name: variant,
        traveler_name: travelerName.trim(),
        traveler_phone: travelerPhone.trim(),
        traveler_email: travelerEmail.trim(),
        payment_method: paymentMethod,
        client_request_id: clientRequestId
      });

      const bookingRef = bookingRes.ref || bookingRes.bookingRef;
      const bookingId = bookingRes.bookingId || bookingRes.id;

      if (paymentMethod === "CASHFREE") {
        const orderRes = await api.createCashfreeOrder({
          bookingId,
          bookingRef,
          returnUrl: `${window.location.origin}/booking-confirmed/${encodeURIComponent(bookingRef)}?order_id={order_id}`,
        });

        const CashfreeSDK = await loadCashfreeSdk();
        const mode = orderRes.environment === "PROD" || orderRes.environment === "PRODUCTION" ? "production" : "sandbox";
        const cashfree = CashfreeSDK({ mode });

        const checkoutResult = await cashfree.checkout({
          paymentSessionId: orderRes.paymentSessionId,
          redirectTarget: "_modal",
        });

        if (checkoutResult?.error) {
          throw new Error(checkoutResult.error.message || "Cashfree payment was cancelled or not completed.");
        }

        // Verify with backend
        await api.verifyCashfreePayment({
          orderId: orderRes.orderId,
          bookingId,
          bookingRef,
        });

        navigate(`/booking-confirmed/${bookingRef}`);
      } else {
        await api.completeDemoPayment({ bookingId, bookingRef });
        navigate(`/booking-confirmed/${bookingRef}?demo=1`);
      }
    } catch (err) {
      console.error("Booking Checkout Error:", err);
      if (err.code === "SUPPLIER_NOT_APPROVED") {
        setError("This experience is temporarily unavailable — the operator is pending our verification. Please check back soon or browse other options.");
      } else {
        setError(err.message || "We could not complete this booking. Please try again.");
      }
      setProcessing(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center text-slate-100">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/10 text-amber-400"><UserRound className="h-7 w-7" /></div>
        <h1 className="mt-5 font-serif text-3xl font-bold">Sign in to reserve your experience</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">Your traveler details, meeting instructions, ticket and trip updates will stay together in My Trips.</p>
        <Link to={`/login?from=${encodeURIComponent(`/checkout/${id}?${params.toString()}`)}`} className="mt-6 inline-flex rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-slate-950">Continue securely</Link>
      </div>
    );
  }
  if (loadingError) return <div className="mx-auto max-w-xl px-5 py-20 text-center text-rose-800 font-bold">{loadingError}</div>;
  if (!activity) return <div className="mx-auto max-w-6xl px-5 py-20 text-center text-sm text-stone-500">Preparing your checkout…</div>;

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Link to={`/activity/${id}`} className="inline-flex items-center gap-2 text-xs font-bold text-stone-600 hover:text-amber-700"><ArrowLeft className="h-4 w-4" /> Back to experience</Link>

        <header className="mt-5 overflow-hidden rounded-[2rem] border border-stone-200 bg-white p-6 shadow-md sm:p-8">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div><span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-[.18em] text-amber-900"><Sparkles className="h-3.5 w-3.5 text-amber-600" /> Secure booking</span><h1 className="mt-3 font-serif text-3xl font-bold text-stone-900 sm:text-4xl">Review and book.</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-600">Your date, travelers and selected option are reserved while you add the details needed by the local operator.</p></div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">{progress.map(({ label, ready, icon: Icon }, index) => <div key={label} className={`rounded-2xl border p-3 ${index === 2 ? "border-amber-400 bg-amber-50" : ready ? "border-emerald-300 bg-emerald-50" : "border-stone-200 bg-stone-50"}`}><div className="flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-black ${ready ? "bg-emerald-600 text-white" : index === 2 ? "bg-amber-500 text-stone-950" : "bg-stone-200 text-stone-600"}`}>{ready ? <Check className="h-3.5 w-3.5" /> : index + 1}</span><Icon className="h-4 w-4 text-stone-500" /></div><span className="mt-2 block text-[10px] font-bold text-stone-700">{label}</span></div>)}</div>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <form onSubmit={handleSubmitBooking} className="space-y-6">
            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-100 text-amber-800"><UserRound className="h-5 w-5" /></span><div><h2 className="font-serif text-xl font-bold text-stone-900">Who’s traveling?</h2><p className="text-xs text-stone-500">Voucher and important trip updates go here.</p></div></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-stone-700">Full name<input required value={travelerName} onChange={(e) => setTravelerName(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] px-4 py-3 text-sm font-normal text-stone-900 outline-none focus:border-amber-500 focus:bg-white" /></label><label className="text-xs font-bold text-stone-700">WhatsApp / mobile<input required value={travelerPhone} onChange={(e) => setTravelerPhone(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] px-4 py-3 text-sm font-normal text-stone-900 outline-none focus:border-amber-500 focus:bg-white" /></label><label className="text-xs font-bold text-stone-700 sm:col-span-2">Email for e-ticket<input type="email" required value={travelerEmail} onChange={(e) => setTravelerEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] px-4 py-3 text-sm font-normal text-stone-900 outline-none focus:border-amber-500 focus:bg-white" /></label></div>
            </section>

            <section id="pickup-details" className="scroll-mt-28 rounded-3xl border border-amber-300 bg-gradient-to-br from-amber-50/40 to-white p-5 shadow-sm sm:p-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-500 text-stone-950">
                  <MapPin className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-serif text-xl font-bold text-stone-900">
                      {isTransfer ? "Pickup & Destination Drop-off" : "Meeting and pickup"}
                    </h2>
                    <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[9px] font-black text-amber-900">
                      REQUIRED
                    </span>
                  </div>
                  <p className="text-xs text-stone-500">
                    {isTransfer
                      ? "Enter your exact hotel or home address and arrival/departure flight details."
                      : "Choose how you plan to join this experience."}
                  </p>
                </div>
              </div>

              {/* Experience joining methods */}
              {!isTransfer && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {!isPackage && (
                    <button
                      type="button"
                      onClick={() => setJoiningMethod("MEET")}
                      className={`rounded-xl border p-4 text-left transition ${
                        joiningMethod === "MEET" ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-white hover:border-stone-300"
                      }`}
                    >
                      <strong className="block text-sm text-stone-900">Meet at departure point</strong>
                      <span className="mt-1 block text-xs leading-relaxed text-stone-600">{meetingPoint}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setJoiningMethod("PICKUP")}
                    className={`rounded-xl border p-4 text-left transition ${
                      joiningMethod === "PICKUP" ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <strong className="block text-sm text-stone-900">{isPackage ? "Airport / hotel pickup" : "Request hotel pickup"}</strong>
                    <span className="mt-1 block text-xs text-stone-600">Add the address for your operator.</span>
                  </button>
                  {isPackage && (
                    <button
                      type="button"
                      onClick={() => setJoiningMethod("LATER")}
                      className={`rounded-xl border p-4 text-left transition ${
                        joiningMethod === "LATER" ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-white hover:border-stone-300"
                      }`}
                    >
                      <strong className="block text-sm text-stone-900">Provide arrival details later</strong>
                      <span className="mt-1 block text-xs text-stone-600">Continue if flights or accommodation are not booked yet.</span>
                    </button>
                  )}
                </div>
              )}

              {/* Transfer Details Form */}
              {isTransfer && (
                <div className="space-y-4">
                  {/* Arrival Transfer Route */}
                  {isArrivalTransfer ? (
                    <>
                      {/* Pickup Hub (Airport / Station) */}
                      <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                            <span className="text-base">✈️</span> Pickup Terminal / Arrival Hub
                          </label>
                          <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                            MEET & GREET
                          </span>
                        </div>
                        <input
                          value={pickupPoint.address}
                          onChange={(e) => setPickupPoint((prev) => ({ ...prev, address: e.target.value }))}
                          placeholder="Airport or railway station terminal..."
                          className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-3 text-xs text-stone-900 font-semibold focus:border-amber-500 focus:bg-white outline-none"
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-bold text-stone-700">
                            Flight / Train Number <span className="text-amber-700 font-normal">(for live delay tracking)</span>
                            <input
                              value={flightNumber}
                              onChange={(e) => setFlightNumber(e.target.value)}
                              placeholder="e.g. 6E-2134 (IndiGo) or AI-864"
                              className="mt-1 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-2.5 text-xs text-stone-900 focus:border-amber-500 focus:bg-white outline-none"
                            />
                          </label>
                          <label className="text-xs font-bold text-stone-700">
                            Landing / Ready Time
                            <input
                              type="time"
                              required
                              value={pickupTime}
                              onChange={(e) => setPickupTime(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-2.5 text-xs text-stone-900 focus:border-amber-500 focus:bg-white outline-none"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Drop-off Destination (User Choice Hotel / Home) */}
                      <div id="dropoff-details" className="rounded-2xl border border-emerald-300 bg-emerald-50/40 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                            <span className="text-base">🏨</span> Your Hotel, Resort, Airbnb or Drop-off Address
                          </label>
                          <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300">
                            DOORSTEP DROP-OFF
                          </span>
                        </div>
                        <PickupPointPicker
                          value={dropPoint}
                          nearbyLocation={pickupPoint}
                          searchContext={destinationSearchContext}
                          onChange={setDropPoint}
                          placeholder="Enter your hotel name, resort, Airbnb or full address..."
                          label=""
                          kind="dropoff"
                          markerLabel="B"
                        />
                        <div className="rounded-xl bg-white border border-emerald-200 p-2.5 text-[11px] text-emerald-900 leading-relaxed">
                          ✨ <strong>Any Hotel or Address Covered:</strong> Your chauffeur will meet you with your nameboard at the terminal and drive you directly to this location.
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Departure Transfer Route */
                    <>
                      {/* Pickup at Hotel */}
                      <div className="rounded-2xl border border-emerald-300 bg-emerald-50/40 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                            <span className="text-base">🏨</span> Your Hotel, Resort or Pickup Address
                          </label>
                          <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300">
                            DOORSTEP PICKUP
                          </span>
                        </div>
                        <PickupPointPicker
                          value={pickupPoint}
                          nearbyLocation={dropPoint}
                          searchContext={destinationSearchContext}
                          onChange={setPickupPoint}
                          placeholder="Enter your hotel name, room/lobby or pickup address..."
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-bold text-stone-700">
                            Departure Flight / Train Number
                            <input
                              value={flightNumber}
                              onChange={(e) => setFlightNumber(e.target.value)}
                              placeholder="e.g. 6E-5021 (IndiGo)"
                              className="mt-1 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-2.5 text-xs text-stone-900 focus:border-amber-500 focus:bg-white outline-none"
                            />
                          </label>
                          <label className="text-xs font-bold text-stone-700">
                            Pickup Time from Hotel
                            <input
                              type="time"
                              required
                              value={pickupTime}
                              onChange={(e) => setPickupTime(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-2.5 text-xs text-stone-900 focus:border-amber-500 focus:bg-white outline-none"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Drop-off Terminal */}
                      <div id="dropoff-details" className="rounded-2xl border border-stone-200 bg-white p-4 space-y-2">
                        <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                          <span className="text-base">✈️</span> Airport / Station Drop-off Terminal
                        </label>
                        <input
                          value={dropPoint.address}
                          onChange={(e) => setDropPoint((prev) => ({ ...prev, address: e.target.value }))}
                          placeholder="Airport or station terminal..."
                          className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-3 text-xs text-stone-900 font-semibold focus:border-amber-500 focus:bg-white outline-none"
                        />
                      </div>
                    </>
                  )}

                  {/* Notes / Special Instructions */}
                  <label className="block text-xs font-bold text-stone-700">
                    Chauffeur notes / specific instructions <span className="font-normal text-stone-500">(optional)</span>
                    <input
                      value={pickupInstructions}
                      onChange={(e) => setPickupInstructions(e.target.value)}
                      placeholder="e.g. Name on placard, child seat needed, extra large luggage..."
                      className="mt-1 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-3 text-xs text-stone-900 outline-none focus:border-amber-500 focus:bg-white"
                    />
                  </label>
                </div>
              )}

              {/* Day Tour Hotel Pickup Form */}
              {!isTransfer && joiningMethod === "PICKUP" && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PICKUP_TYPES.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setPickupType(option.id)}
                        className={`rounded-xl border p-3 text-left transition ${
                          pickupType === option.id
                            ? "border-amber-500 bg-amber-50 text-stone-950 font-bold"
                            : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                        }`}
                      >
                        <span className="text-lg">{option.icon}</span>
                        <span className="mt-1 block text-[10px] font-bold">{option.label}</span>
                      </button>
                    ))}
                  </div>
                  <PickupPointPicker
                    value={pickupPoint}
                    nearbyLocation={dropPoint}
                    searchContext={destinationSearchContext}
                    onChange={setPickupPoint}
                    placeholder={pickupOption.placeholder}
                  />
                  <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                    <label className="text-xs font-bold text-stone-700">
                      {isPackage ? "Expected arrival" : "Pickup time"}
                      <input
                        type="time"
                        required
                        value={pickupTime}
                        onChange={(e) => setPickupTime(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] px-4 py-3 text-sm font-normal text-stone-900 outline-none focus:border-amber-500 focus:bg-white"
                      />
                    </label>
                    <label className="text-xs font-bold text-stone-700">
                      Pickup notes <span className="font-normal text-stone-500">(optional)</span>
                      <input
                        value={pickupInstructions}
                        onChange={(e) => setPickupInstructions(e.target.value)}
                        placeholder="Lobby, room number or landmark"
                        className="mt-2 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] px-4 py-3 text-sm font-normal text-stone-900 outline-none placeholder:text-stone-400 focus:border-amber-500 focus:bg-white"
                      />
                    </label>
                  </div>
                </div>
              )}

              {joiningMethod === "MEET" && (
                <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
                  <strong className="text-sm text-emerald-900">Meet at {meetingPoint}</strong>
                  <p className="mt-1 text-xs text-stone-600">
                    Arrive by {pickupTime}. The final meeting instructions and operator contact will appear on your digital voucher.
                  </p>
                </div>
              )}
              {joiningMethod === "LATER" && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
                  You can book now and share your hotel or arrival flight details with the operator anytime before the tour begins.
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><LockKeyhole className="h-5 w-5" /></span><div><h2 className="font-serif text-xl font-bold text-stone-900">Choose payment method</h2><p className="text-xs text-stone-500">Select Cashfree for live sandbox testing or Demo for instant bypass.</p></div></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {PAYMENT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = paymentMethod === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setPaymentMethod(option.id)}
                      className={`relative rounded-2xl border p-4 text-left transition-all ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20 shadow-md"
                          : "border-stone-200 bg-white hover:border-stone-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className={`grid h-10 w-10 place-items-center rounded-xl ${selected ? "bg-emerald-200/60 text-emerald-900" : "bg-stone-100 text-stone-600"}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${selected ? "bg-emerald-200 text-emerald-900" : "bg-stone-100 text-stone-600"}`}>
                          {option.badge}
                        </span>
                      </div>
                      <strong className="mt-3 block text-sm font-bold text-stone-900">{option.name}</strong>
                      <span className="mt-1 block text-xs leading-relaxed text-stone-600">{option.description}</span>
                      {selected && (
                        <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-white">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <label className="mt-4 block text-xs font-bold text-stone-700">Anything else we should know? <span className="font-normal text-stone-500">(optional)</span><textarea rows={2} value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} placeholder="Accessibility needs, child seat, dietary note or a special occasion" className="mt-2 w-full resize-none rounded-xl border border-stone-300 bg-[#FAF9F6] px-4 py-3 text-sm font-normal text-stone-900 outline-none placeholder:text-stone-400 focus:border-amber-500 focus:bg-white" /></label>
            </section>

            {(error || quoteError) && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800"><Info className="mt-0.5 h-4 w-4 shrink-0" />{error || quoteError}</div>}
            <button
              type="submit"
              disabled={processing || quoteLoading || !quote || !travelerReady || !pickupReady || !dropReady}
              className="w-full rounded-2xl bg-amber-500 hover:bg-amber-400 px-6 py-4 text-sm font-black text-stone-950 shadow-md shadow-amber-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing
                ? "Processing your booking…"
                : quoteLoading
                ? "Checking price and availability…"
                : paymentMethod === "CASHFREE"
                ? `Pay ₹${totalAmount.toLocaleString("en-IN")} via Cashfree →`
                : "Confirm demo booking · ₹0 charged →"}
            </button>
            <p className="text-center text-[11px] text-stone-500">By confirming, you agree to the experience’s cancellation terms and Idea Holiday booking terms.</p>
          </form>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:h-fit">
            <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-md"><img src={activity.heroImage || activity.hero_image || activity.images?.[0]} alt="" className="h-48 w-full object-cover" /><div className="p-5"><span className="text-[9px] font-black uppercase tracking-wider text-amber-700">{isPackage ? "Multi-day package" : isShared ? "Shared · per seat" : "Private experience"}</span><h2 className="mt-2 font-serif text-lg font-bold leading-snug text-stone-900">{activity.title}</h2><div className="mt-5 space-y-3 border-t border-stone-200 pt-4 text-xs"><div className="flex items-center gap-3"><CalendarDays className="h-4 w-4 text-amber-600" /><div><span className="block text-stone-500">{isPackage ? "Start date" : "Date"}</span><strong className="text-stone-900">{new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</strong></div></div><div className="flex items-center gap-3"><Users className="h-4 w-4 text-amber-700" /><div><span className="block text-stone-500">Travelers</span><strong className="text-stone-900">{adults} adult{adults !== 1 ? "s" : ""}{children ? ` · ${children} child${children !== 1 ? "ren" : ""}` : ""}</strong></div></div><div className="flex items-center gap-3"><Clock3 className="h-4 w-4 text-amber-700" /><div><span className="block text-stone-500">{isTransfer || joiningMethod === "PICKUP" ? "Pickup" : joiningMethod === "MEET" ? "Meeting point" : "Arrival details"}</span><strong className={pickupReady ? "text-emerald-700" : "text-amber-800 font-bold"}>{pickupReady ? `${pickupTime} · ${pickupLocation}` : "Add joining details"}</strong></div></div></div><div className="mt-5 space-y-2 border-t border-dashed border-stone-200 pt-4 text-xs text-stone-600"><div className="flex justify-between"><span>Selected option</span><span className="max-w-[180px] text-right text-stone-900 font-semibold">{variant}</span></div><div className="flex justify-between"><span>Server-verified fare</span><span className="text-stone-900 font-semibold">₹{rawBaseFare.toLocaleString("en-IN")}</span></div>{fastagTolls > 0 && <div className="flex justify-between"><span>Tolls / route taxes</span><span className="text-stone-900 font-semibold">₹{fastagTolls.toLocaleString("en-IN")}</span></div>}<div className="flex justify-between"><span>GST</span><span className="text-stone-900 font-semibold">₹{gstTax.toLocaleString("en-IN")}</span></div><div className="flex items-end justify-between border-t border-stone-200 pt-3"><strong className="text-sm text-stone-900">Total</strong><strong className="font-serif text-3xl text-emerald-700">{quoteLoading ? "…" : `₹${totalAmount.toLocaleString("en-IN")}`}</strong></div></div></div></div>
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4"><div className="flex items-center gap-2 text-sm font-bold text-emerald-900"><ShieldCheck className="h-5 w-5 text-emerald-700" />Book with breathing room</div><p className="mt-2 text-xs leading-relaxed text-stone-600">Secure checkout, clear cancellation terms and human support if plans change.</p></div>
          </aside>
        </div>
      </div>
    </div>
  );
}
