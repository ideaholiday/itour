import { z } from "zod";

// --- STEP 1 SCHEMA ---
export const step1Schema = z.object({
  title: z
    .string()
    .min(5, "Product title must be at least 5 characters")
    .max(100, "Product title cannot exceed 100 characters"),
  city: z.string().min(2, "Primary city is required"),
  state: z.string().min(2, "State is required"),
  category: z.enum(["DAY_TOUR", "MULTI_DAY"], {
    required_error: "Please select a product category",
  }),
  durationHours: z.coerce.number().optional(),
  durationNights: z.coerce.number().optional(),
  durationDays: z.coerce.number().optional(),
  shortDescription: z
    .string()
    .min(15, "Short summary must be at least 15 characters")
    .max(1500, "Short summary cannot exceed 1,500 characters"),
}).superRefine((data, ctx) => {
  if (data.category === "DAY_TOUR") {
    if (!data.durationHours || data.durationHours <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationHours"],
        message: "Please enter valid duration in hours for Day Sightseeing",
      });
    }
  } else if (data.category === "MULTI_DAY") {
    if (!data.durationDays || data.durationDays <= 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationDays"],
        message: "Multi-day tour must be at least 2 days",
      });
    }
    if (data.durationNights === undefined || data.durationNights < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationNights"],
        message: "Please specify number of nights",
      });
    }
  }
});

// --- STEP 2 SCHEMA ---
const dayItineraryItemSchema = z.object({
  day: z.number(),
  city: z.string().min(2, "Overnight / service city is required"),
  title: z.string().min(3, "Day title required"),
  description: z.string().min(10, "Detailed description required (min 10 chars)"),
  placesCovered: z.array(z.string()).min(1, "Add at least 1 key place for this day"),
  meals: z.object({
    breakfast: z.boolean(),
    lunch: z.boolean(),
    dinner: z.boolean(),
  }),
});

const daySightseeingStopSchema = z.object({
  order: z.number(),
  name: z.string().min(2, "Stop/Attraction name required"),
  duration: z.string().min(1, "Duration required (e.g. 1.5 Hours or 10:00 AM)"),
  description: z
    .string()
    .max(1000, "Stop description cannot exceed 1,000 characters")
    .optional()
    .or(z.literal("")),
});

const pickupDropSchema = z.object({
  type: z.enum(["PICKUP", "DROP", "BOTH"]),
  locationName: z.string().min(2, "Location name required"),
});

export const step2Schema = z.object({
  itinerary: z.array(dayItineraryItemSchema).optional(),
  timeSlots: z.array(z.string()).optional(),
  pickupDropPoints: z.array(pickupDropSchema).optional(),
  dayStops: z.array(daySightseeingStopSchema).optional(),
  pickupRuleMode: z.enum(["CITY_ANYWHERE", "RADIUS_FROM_CENTER", "ZONE_POLYGON"]).optional(),
  distanceKmLimit: z.coerce.number().positive().max(500).optional(),
  advanceBookingCutoffHours: z.coerce.number().min(0).max(168).optional(),
  operatingStartTime: z.string().optional(),
  operatingEndTime: z.string().optional(),
  allowedLocationTypes: z.array(z.enum(["HOTEL_ZONE", "LANDMARK", "CITY_CENTER", "PICKUP_ZONE"])).optional(),
}).superRefine((data, ctx) => {
  // If itinerary present (Multi-Day), ensure non-empty
  if (data.itinerary && data.itinerary.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["itinerary"],
      message: "At least 1 day itinerary details required",
    });
  }
  // For Day Sightseeing
  if (data.timeSlots && data.timeSlots.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timeSlots"],
      message: "Select at least 1 operating time slot",
    });
  }
  if (data.pickupDropPoints && data.pickupDropPoints.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pickupDropPoints"],
      message: "Specify at least 1 Pick-up / Drop point",
    });
  }
});

// --- STEP 3 SCHEMA ---
const hotelVariantSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  pricingModel: z.string(), // "PER_PERSON" | "PER_VEHICLE"
  priceModifier: z.coerce.number(), // extra INR
  active: z.boolean(),
});

export const step3Schema = z.object({
  groupType: z.enum(["PRIVATE", "SHARED"]),
  vehiclePrices: z.object({
    sedan: z.coerce.number().min(0, "Price cannot be negative"),
    suv: z.coerce.number().min(0, "Price cannot be negative"),
    tempo: z.coerce.number().min(0, "Price cannot be negative"),
  }),
  seatPrice: z.coerce.number().min(0, "Seat price cannot be negative"),
  hotelVariants: z.array(hotelVariantSchema),
  inclusions: z.array(z.string()).min(1, "Select at least 1 inclusion"),
  exclusions: z.array(z.string()),
}).superRefine((data, ctx) => {
  if (data.groupType === "PRIVATE") {
    if (data.vehiclePrices.sedan <= 0 && data.vehiclePrices.suv <= 0 && data.vehiclePrices.tempo <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vehiclePrices", "sedan"],
        message: "Please enter a valid price for at least one vehicle category",
      });
    }
  } else if (data.groupType === "SHARED") {
    if (data.seatPrice <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seatPrice"],
        message: "Please set a valid price per seat for shared tour",
      });
    }
  }
});

// --- STEP 4 SCHEMA ---
export const step4Schema = z.object({
  blackoutDates: z.array(z.string()),
  seasonalMultiplier: z.coerce.number().min(1, "Multiplier must be at least 1.0"),
  seasonalLabel: z.string(),
  bookingMode: z.enum(["INSTANT", "REQUEST_APPROVAL"]),
  approvalTimeLimitHours: z.coerce.number(),
  cancellationPolicy: z.enum(["FLEXIBLE_24H", "MODERATE_48H", "STRICT_7D", "NON_REFUNDABLE"]),
  termsAgreed: z.boolean().refine((val) => val === true, {
    message: "You must agree to the Idea Holiday supplier terms & SLA",
  }),
});

// Full Tour Product Schema combining all 4 steps
export const tourProductSchema = z.object({
  step1: step1Schema,
  step2: step2Schema,
  step3: step3Schema,
  step4: step4Schema,
});

// Default initial state
export const DEFAULT_TOUR_FORM_STATE = {
  step1: {
    title: "Varanasi Heritage & Ganga Aarti Spiritual Experience",
    city: "Varanasi",
    state: "Uttar Pradesh",
    category: "MULTI_DAY",
    durationHours: 8,
    durationNights: 2,
    durationDays: 3,
    shortDescription: "Experience the timeless spirituality of Kashi, sacred ghats sunset boat ride, Sarnath Buddhist heritage, and authentic Banarasi culinary walk.",
  },
  step2: {
    itinerary: [
      {
        day: 1,
        city: "Varanasi",
        title: "Arrival, Ghats Walking Tour & Evening Ganga Aarti Cruise",
        description: "Pick up from Varanasi Airport/Station. Check-in to hotel. Guided sunset walking tour of Dashashwamedh Ghat and private boat ride for Ganga Aarti.",
        placesCovered: ["Dashashwamedh Ghat", "Manikarnika Ghat", "Kashi Vishwanath Corridor"],
        meals: { breakfast: false, lunch: true, dinner: true },
      },
      {
        day: 2,
        city: "Varanasi",
        title: "Subah-e-Banaras Boat Ride & Sarnath Excursion",
        description: "Early morning sunrise boat ride across the Ganges. Breakfast at iconic Blue Lassi. Afternoon excursion to Sarnath Dhamek Stupa & Archaeological Museum.",
        placesCovered: ["Assi Ghat Sunrise", "Subah-e-Banaras", "Sarnath Stupa", "Sarnath Museum"],
        meals: { breakfast: true, lunch: true, dinner: false },
      },
      {
        day: 3,
        city: "Varanasi",
        title: "Banarasi Silk Weaver Colony Walk & Departure",
        description: "Morning visit to Madanpura silk weaving quarter. Souvenir shopping for authentic Banarasi Sarees and drop-off at Airport/Station.",
        placesCovered: ["Madanpura Silk Colony", "Godowlia Market", "Varanasi Airport"],
        meals: { breakfast: true, lunch: false, dinner: false },
      },
    ],
    timeSlots: ["09:00 AM", "02:00 PM"],
    pickupDropPoints: [
      { type: "PICKUP", locationName: "Varanasi Junction (BSB) / Airport (VNS)" },
      { type: "BOTH", locationName: "Any Central Varanasi Hotel" },
    ],
    dayStops: [
      { order: 1, name: "Hotel Pickup in Central Varanasi", duration: "09:00 AM", description: "" },
      { order: 2, name: "Kashi Vishwanath Temple Corridor Visit", duration: "2 Hours", description: "" },
      { order: 3, name: "Subah-e-Banaras Boat Ride", duration: "1.5 Hours", description: "" },
      { order: 4, name: "Sarnath Excursion & Museum", duration: "2.5 Hours", description: "" },
      { order: 5, name: "Hotel / Station Drop-off", duration: "05:00 PM", description: "" },
    ],
    pickupRuleMode: "CITY_ANYWHERE",
    distanceKmLimit: 40,
    advanceBookingCutoffHours: 4,
    operatingStartTime: "06:00",
    operatingEndTime: "22:00",
    allowedLocationTypes: ["HOTEL_ZONE", "LANDMARK"],
  },
  step3: {
    groupType: "PRIVATE",
    vehiclePrices: {
      sedan: 4999,
      suv: 6999,
      tempo: 11999,
    },
    seatPrice: 1499,
    hotelVariants: [
      {
        id: "cab_only",
        name: "Private Cab Only (No Hotel Stay)",
        description: "Chauffeur driven AC vehicle for all transfers & sightseeing",
        pricingModel: "BASE",
        priceModifier: 0,
        active: true,
      },
      {
        id: "cab_3star",
        name: "Cab + 3-Star Heritage Hotel Stay",
        description: "Includes AC Deluxe room with CP Breakfast plan",
        pricingModel: "PER_PERSON",
        priceModifier: 3500,
        active: true,
      },
      {
        id: "cab_4star",
        name: "Cab + 4-Star Luxury Riverside Stay",
        description: "Includes Premium Ghat-view room, Breakfast & Dinner",
        pricingModel: "PER_PERSON",
        priceModifier: 6800,
        active: true,
      },
    ],
    inclusions: [
      "AC Vehicle with Chauffeur",
      "Fuel & Parking Charges",
      "Inter-state Toll Taxes",
      "Private Boat Ride",
      "Bottled Water per Pax",
      "Driver Night Allowance",
    ],
    exclusions: [
      "Monument Entry Tickets",
      "Personal Expenses & Tips",
      "Camera Fees",
      "GST 5%",
    ],
  },
  step4: {
    blackoutDates: ["2026-10-24", "2026-11-12", "2026-12-31"],
    seasonalMultiplier: 1.2,
    seasonalLabel: "Peak Festive Season (+20% Dec/Diwali)",
    bookingMode: "INSTANT",
    approvalTimeLimitHours: 2,
    cancellationPolicy: "FLEXIBLE_24H",
    termsAgreed: true,
  },
};

export const COMMON_INCLUSIONS = [
  "AC Vehicle with Chauffeur",
  "Fuel & Parking Charges",
  "Inter-state Toll Taxes",
  "Hotel Accommodation",
  "Breakfast Included (CP Plan)",
  "Breakfast & Dinner (MAP Plan)",
  "Private Boat Ride",
  "English Speaking Tour Guide",
  "Monument Entry Tickets",
  "Bottled Water per Pax",
  "Driver Night Allowance",
  "Airport / Station Pickup & Drop",
  "Welcome Drinks on Arrival",
];

export const COMMON_EXCLUSIONS = [
  "Monument Entry Tickets",
  "Personal Expenses & Tips",
  "Camera & Video Fees",
  "Alcoholic Beverages",
  "Flight / Train Tickets",
  "Water Sports & Adventure Activities",
  "GST 5%",
  "Travel Insurance",
];
