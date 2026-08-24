import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Car,
  Clock,
  ShieldCheck,
  Phone,
  Printer,
  Share2,
  AlertTriangle,
  Compass,
  ArrowLeft,
  CheckCircle2,
  FileText
} from "lucide-react";
import api from "../lib/api";
import Button from "../components/ui/Button";
import Card, { CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import PreTripChecklist from "../components/traveler/PreTripChecklist";
import BookingModificationModal from "../components/traveler/BookingModificationModal";

export function TripSummary() {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modModalOpen, setModModalOpen] = useState(false);

  useEffect(() => {
    async function loadBooking() {
      try {
        const res = await api.get(`/bookings/${id}`);
        if (res?.booking) {
          setBooking(res.booking);
        }
      } catch (err) {
        console.error("Failed to load booking summary", err);
      } finally {
        setLoading(false);
      }
    }
    loadBooking();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-xs text-stone-500">
        Loading trip itinerary...
      </div>
    );
  }

  const trip = booking || {
    id: id || "IH-2026-882",
    activity_title: "Sunrise Taj Mahal & Agra Fort Private Heritage Tour",
    activity_date: "2026-09-02",
    pickup_time: "05:30 AM",
    pickup_point: "Hotel Tajview, Agra (Lobby)",
    destination: "Agra, Uttar Pradesh",
    status: "CONFIRMED",
    guest_count: 2,
    amount_inr: 4999,
    driver_name: "Rajesh Kumar",
    driver_phone: "+91 98765 11223",
    vehicle_info: "Toyota Innova Crysta (UP-80-AB-1234)",
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/my-bookings">
            <button className="p-2 rounded-2xl border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
              <ArrowLeft className="w-4 h-4 text-stone-700 dark:text-stone-300" />
            </button>
          </Link>
          <div>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
              Itinerary & Voucher
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 font-display">
              {trip.activity_title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={Printer}
            onClick={() => window.print()}
          >
            Print
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setModModalOpen(true)}
          >
            Modify
          </Button>
        </div>
      </div>

      {/* Main Trip Card */}
      <Card elevation="sm">
        <CardContent className="p-6 space-y-6">
          {/* Key Quick Details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
            <div>
              <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">Trip Date</span>
              <div className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                {trip.activity_date}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">Pickup Time</span>
              <div className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                {trip.pickup_time || "06:00 AM"}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">Party Size</span>
              <div className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                {trip.guest_count || 2} Travelers
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">Status</span>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                Confirmed & Ready
              </div>
            </div>
          </div>

          {/* Chauffeur / Guide Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-display">
              Assigned Chauffeur & Vehicle
            </h3>
            <div className="p-4 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-stone-100 dark:bg-stone-800 text-amber-600 flex items-center justify-center">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100">
                    {trip.driver_name || "Verified Local Chauffeur"}
                  </h4>
                  <span className="text-[11px] text-stone-500 font-mono">
                    {trip.vehicle_info || "Air-Conditioned Premium Vehicle"}
                  </span>
                </div>
              </div>

              {trip.driver_phone && (
                <a
                  href={`tel:${trip.driver_phone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Call {trip.driver_phone}</span>
                </a>
              )}
            </div>
          </div>

          {/* Pickup and Itinerary */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-display">
              Meeting & Departure Location
            </h3>
            <div className="p-4 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex items-start gap-3">
              <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-stone-900 dark:text-stone-100 block">
                  {trip.pickup_point || "Hotel Lobby / Airport Arrival Gate"}
                </span>
                <span className="text-xs text-stone-500">
                  Please be present at the pickup location 10 minutes prior to scheduled departure.
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pre-Trip Preparation Checklist */}
      <PreTripChecklist />

      {/* Booking Modification Modal */}
      <BookingModificationModal
        isOpen={modModalOpen}
        onClose={() => setModModalOpen(false)}
        booking={trip}
      />
    </div>
  );
}

export default TripSummary;
