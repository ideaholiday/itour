import React, { useState, useEffect, useRef } from "react";
import { authHeaders } from "../lib/api.js";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import {
  Compass,
  Calendar,
  DollarSign,
  Zap,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Save,
  RotateCcw,
  Sparkles,
  AlertCircle,
  ShieldCheck,
  Building,
  Check
} from "lucide-react";

import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  tourProductSchema,
  DEFAULT_TOUR_FORM_STATE,
} from "../lib/tourBuilderSchema";

import Step1BasicInfo from "../components/tour-builder/Step1BasicInfo";
import Step2Itinerary from "../components/tour-builder/Step2Itinerary";
import Step3PricingInclusions from "../components/tour-builder/Step3PricingInclusions";
import Step4InventoryBooking from "../components/tour-builder/Step4InventoryBooking";
import TourPreviewSidebar from "../components/tour-builder/TourPreviewSidebar";
import { useAuth } from "../lib/auth.jsx";

const STORAGE_KEY = "wanderindia_tour_builder_draft";

export default function TourProductBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const supplierId = user?.user_metadata?.supplier_id || user?.supplier_id || "sup_lucknow_cabs";
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState(() => ({
    ...DEFAULT_TOUR_FORM_STATE,
    step1: {
      ...DEFAULT_TOUR_FORM_STATE.step1,
      category: searchParams.get("type") === "day" ? "DAY_TOUR" : "MULTI_DAY",
    },
  }));
  const [errors, setErrors] = useState({});
  const [saveStatus, setSaveStatus] = useState("Idle"); // "Saved", "Saving...", "Idle"
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [publishError, setPublishError] = useState("");

  const saveTimeoutRef = useRef(null);

  // Check for saved draft on mount
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(STORAGE_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed?.formData) {
          setFormData(parsed.formData);
          setLastSavedTime(parsed.timestamp);
          setShowDraftBanner(true);
        }
      }
    } catch (e) {
      console.warn("Failed to parse saved draft from localStorage", e);
    }
  }, []);

  // Auto-Save Draft to LocalStorage whenever formData changes
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    setSaveStatus("Saving...");
    saveTimeoutRef.current = setTimeout(() => {
      try {
        const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            formData,
            timestamp: now,
          })
        );
        setSaveStatus("Saved");
        setLastSavedTime(now);
      } catch (e) {
        setSaveStatus("Error");
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [formData]);

  // Update specific step form data
  const handleStepDataChange = (stepKey, newData) => {
    setFormData((prev) => ({
      ...prev,
      [stepKey]: {
        ...prev[stepKey],
        ...newData,
      },
    }));
    // Clear errors for modified fields
    setErrors((prev) => ({ ...prev, [stepKey]: {} }));
  };

  const handleApplyPreset = (preset) => {
    const isMulti = preset.category === "MULTI_DAY";
    setFormData({
      step1: {
        category: isMulti ? "MULTI_DAY" : "DAY_TOUR",
        title: preset.title,
        city: preset.city,
        state: preset.state,
        durationHours: preset.durationHours || 8,
        durationDays: preset.durationDays || 3,
        durationNights: preset.durationNights || 2,
        shortDescription: preset.shortDescription,
      },
      step2: {
        itinerary: isMulti
          ? (preset.itinerary || []).map((item, idx) => ({
              day: idx + 1,
              title: item.name || `Day ${idx + 1}`,
              description: item.name || "",
              placesCovered: [preset.city],
              meals: { breakfast: true, lunch: false, dinner: false },
            }))
          : [],
        timeSlots: ["09:00 AM", "10:00 AM"],
        pickupDropPoints: [
          { type: "PICKUP", locationName: `${preset.city} Hotels & Addresses` },
          { type: "DROP", locationName: `${preset.city} Hotels & Addresses` },
        ],
        dayStops: !isMulti
          ? (preset.itinerary || []).map((item, idx) => ({
              order: idx + 1,
              name: item.name,
              duration: item.duration || "1.5 Hours",
              description: item.description || "",
            }))
          : [],
      },
      step3: {
        pricingVariants: preset.pricingVariants || [
          { variantName: "Standard Tour", basePrice: preset.priceInr || 2400, pricingModel: "PER_PERSON" },
        ],
        inclusions: preset.inclusions || ["AC Vehicle", "Chauffeur", "Tolls & Taxes"],
        exclusions: preset.exclusions || ["Personal expenses", "Monument entry tickets"],
        heroImage: preset.heroImage || "",
        galleryImages: preset.images || [],
      },
      step4: {
        advanceBookingCutoffHours: 6,
        maxGroupSize: 15,
        instantConfirmation: true,
        cancellationPolicy: "MODERATE_48H",
      },
    });
    setErrors({});
  };

  // Validate single step using Zod
  const validateStep = (stepNumber) => {
    let result;
    if (stepNumber === 1) {
      result = step1Schema.safeParse(formData.step1);
    } else if (stepNumber === 2) {
      result = step2Schema.safeParse(formData.step2);
    } else if (stepNumber === 3) {
      result = step3Schema.safeParse(formData.step3);
    } else if (stepNumber === 4) {
      result = step4Schema.safeParse(formData.step4);
    }

    if (result && !result.success) {
      const formattedErrors = {};
      result.error.issues.forEach((issue) => {
        const pathKey = issue.path.join(".");
        formattedErrors[pathKey] = issue.message;
      });
      setErrors((prev) => ({ ...prev, [`step${stepNumber}`]: formattedErrors }));
      return false;
    }

    setErrors((prev) => ({ ...prev, [`step${stepNumber}`]: {} }));
    return true;
  };

  // Step Navigation Handlers
  const handleNext = () => {
    const isValid = validateStep(currentStep);
    if (isValid && currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleStepClick = (targetStep) => {
    if (targetStep < currentStep) {
      setCurrentStep(targetStep);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // Validate up to targetStep
      let allValid = true;
      for (let s = currentStep; s < targetStep; s++) {
        if (!validateStep(s)) {
          allValid = false;
          break;
        }
      }
      if (allValid) {
        setCurrentStep(targetStep);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };

  // Reset Draft
  const handleResetDraft = () => {
    if (window.confirm("Are you sure you want to reset all fields to default draft?")) {
      localStorage.removeItem(STORAGE_KEY);
      setFormData(DEFAULT_TOUR_FORM_STATE);
      setShowDraftBanner(false);
      setErrors({});
      setCurrentStep(1);
    }
  };

  // Final Publish Handler
  const handlePublish = async () => {
    // Validate all 4 steps
    const step1Valid = validateStep(1);
    const step2Valid = validateStep(2);
    const step3Valid = validateStep(3);
    const step4Valid = validateStep(4);

    if (!step1Valid || !step2Valid || !step3Valid || !step4Valid) {
      // Jump to first step with errors
      if (!step1Valid) setCurrentStep(1);
      else if (!step2Valid) setCurrentStep(2);
      else if (!step3Valid) setCurrentStep(3);
      else if (!step4Valid) setCurrentStep(4);
      return;
    }

    setIsPublishing(true);
    setPublishError("");

    try {
      const pType = formData.step1.category === "DAY_TOUR" ? "DAY_TOUR" : "MULTI_DAY_PACKAGE";
      const isShared = formData.step3.groupType === "SHARED";
      const startPrice =
        isShared
          ? formData.step3.seatPrice || 899
          : formData.step3.vehiclePrices.sedan || formData.step3.vehiclePrices.suv || 2499;

      const payload = {
        productType: pType,
        groupType: formData.step3.groupType || "PRIVATE",
        title: formData.step1.title,
        city: formData.step1.city,
        state: formData.step1.state,
        country: "India",
        category: pType === "DAY_TOUR" ? "Day Sightseeing" : "Multi-Day Packages",
        shortDesc: formData.step1.shortDescription,
        fullDesc: formData.step1.shortDescription,
        durationHours: pType === "DAY_TOUR" ? formData.step1.durationHours : (formData.step1.durationDays || 3) * 24,
        priceInr: Math.round(startPrice * (formData.step4.seasonalMultiplier || 1.0)),
        inclusions: formData.step3.inclusions,
        exclusions: formData.step3.exclusions,
        itinerary: pType === "DAY_TOUR" ? JSON.stringify(formData.step2.dayStops) : JSON.stringify(formData.step2.itinerary),
        pricingVariants:
          pType === "DAY_TOUR"
            ? isShared
              ? [
                  {
                    variantName: "Shared Group Tour (Per Seat / Passenger)",
                    basePrice: Number(formData.step3.seatPrice) || Number(startPrice) || 899,
                    pricingModel: "PER_PERSON"
                  }
                ]
              : [
                  { variantName: "Sedan Cab (1-4 Pax)", basePrice: formData.step3.vehiclePrices.sedan || 2499, pricingModel: "FIXED" },
                  { variantName: "SUV Cab (1-6 Pax)", basePrice: formData.step3.vehiclePrices.suv || 3499, pricingModel: "FIXED" },
                  { variantName: "Tempo Traveller (1-12 Pax)", basePrice: formData.step3.vehiclePrices.tempo || 6499, pricingModel: "FIXED" },
                ]
            : (formData.step3.hotelVariants || []).map((h) => ({
                variantName: h.name,
                basePrice: startPrice + (h.priceModifier || 0),
                pricingModel: isShared ? "PER_PERSON" : (h.pricingModel || "PER_PERSON"),
              })),
        packageMeta:
          pType === "MULTI_DAY_PACKAGE"
            ? {
                totalDays: formData.step1.durationDays || 3,
                totalNights: formData.step1.durationNights || 2,
                dayWiseDetails: formData.step2.itinerary,
                startCity: formData.step1.city,
                endCity: formData.step1.city,
              }
            : null,
      };

      const response = await fetch(`/api/suppliers/${supplierId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || "The listing could not be published.");
      }

      setPublishSuccess(true);
      localStorage.removeItem(STORAGE_KEY);
      setTimeout(() => {
        navigate("/supplier/dashboard");
      }, 1600);
    } catch (e) {
      console.error("Publish failed", e);
      setPublishError(e.message || "The listing could not be published. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  // Stepper Header Config
  const stepsConfig = [
    { number: 1, title: "Basic Info & Type", icon: Compass },
    { number: 2, title: "Itinerary & Places", icon: Calendar },
    { number: 3, title: "Pricing & Inclusions", icon: DollarSign },
    { number: 4, title: "Inventory & Booking", icon: Zap },
  ];

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4 text-amber-600" /> Supplier Product Listing Studio
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-stone-900">
              Create Sightseeing & Multi-Day Tour
            </h1>
            <p className="text-sm text-stone-600 mt-1">
              List single-day city excursions or multi-day holiday packages with dynamic pricing & instant booking.
            </p>
          </div>

          {/* Auto-Save Status & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-stone-50 border border-stone-200 px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2">
              <Save className={`w-3.5 h-3.5 ${saveStatus === "Saving..." ? "animate-spin text-amber-600" : "text-emerald-700"}`} />
              <span className="text-stone-700">
                {saveStatus === "Saving..." ? "Auto-Saving..." : `Draft Saved ${lastSavedTime ? `at ${lastSavedTime}` : ""}`}
              </span>
            </div>

            <button
              type="button"
              onClick={handleResetDraft}
              className="bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium px-3 py-2 rounded-xl transition flex items-center gap-1.5 border border-stone-200"
              title="Clear Draft"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>

            <Link
              to="/supplier"
              className="text-xs text-stone-500 hover:text-stone-900 px-3 py-2 transition"
            >
              Cancel & Exit
            </Link>
          </div>
        </div>

        {/* Draft Restored Banner Toast */}
        {showDraftBanner && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 px-4 flex items-center justify-between text-xs text-amber-900 shadow-sm animate-fadeIn">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>
                Restored auto-saved draft from <strong>{lastSavedTime}</strong>. You can resume editing seamlessly.
              </span>
            </div>
            <button
              onClick={() => setShowDraftBanner(false)}
              className="text-stone-400 hover:text-stone-700 font-bold ml-4"
            >
              ×
            </button>
          </div>
        )}

        {publishError && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div><strong className="block text-rose-950">Publishing failed</strong><span>{publishError}</span></div>
          </div>
        )}

        {/* Success Banner overlay when publishing */}
        {publishSuccess && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-8 text-center space-y-3 shadow-md animate-fadeIn">
            <div className="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto text-2xl font-bold shadow-sm">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
            <h2 className="text-2xl font-bold text-stone-900">Tour Product Published Successfully!</h2>
            <p className="text-sm text-stone-600 max-w-lg mx-auto">
              Your tour listing <strong>"{formData.step1.title}"</strong> is now live on Idea Holiday Marketplace. Redirecting to supplier dashboard...
            </p>
          </div>
        )}

        {!publishSuccess && (
          <>
            {/* Progress Indicator Stepper */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 md:p-6 shadow-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative">
                {stepsConfig.map((step) => {
                  const StepIcon = step.icon;
                  const isActive = currentStep === step.number;
                  const isCompleted = currentStep > step.number;
                  const hasError = Object.keys(errors[`step${step.number}`] || {}).length > 0;

                  return (
                    <button
                      key={step.number}
                      type="button"
                      onClick={() => handleStepClick(step.number)}
                      className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${
                        isActive
                          ? "bg-amber-50 border-amber-500 text-stone-950 ring-1 ring-amber-500 shadow-sm"
                          : isCompleted
                          ? "bg-white border-stone-300 text-stone-800 hover:border-amber-400"
                          : "bg-stone-50 border-stone-200 text-stone-400"
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-lg font-bold text-xs flex items-center justify-center transition-all ${
                          isCompleted
                            ? "bg-emerald-600 text-white"
                            : isActive
                            ? "bg-amber-500 text-stone-950 shadow"
                            : "bg-stone-200 text-stone-600"
                        }`}
                      >
                        {isCompleted ? <Check className="w-5 h-5 stroke-[3]" /> : step.number}
                      </div>

                      <div className="hidden sm:block overflow-hidden">
                        <div className="text-xs font-bold truncate flex items-center gap-1 text-stone-900">
                          {step.title}
                          {hasError && <AlertCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />}
                        </div>
                        <div className="text-[10px] text-stone-500">
                          {isCompleted ? "Completed" : isActive ? "Active Now" : "Step " + step.number}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Layout Grid: Wizard Form (Col 8) + Sticky Live Preview Sidebar (Col 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Wizard Form Area */}
              <div className="lg:col-span-8 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
                {currentStep === 1 && (
                  <Step1BasicInfo
                    formData={formData.step1}
                    onChange={(data) => handleStepDataChange("step1", data)}
                    onApplyPreset={handleApplyPreset}
                    errors={errors.step1}
                  />
                )}

                {currentStep === 2 && (
                  <Step2Itinerary
                    formData={formData.step2}
                    category={formData.step1.category}
                    onChange={(data) => handleStepDataChange("step2", data)}
                    errors={errors.step2}
                  />
                )}

                {currentStep === 3 && (
                  <Step3PricingInclusions
                    formData={formData.step3}
                    category={formData.step1.category}
                    onChange={(data) => handleStepDataChange("step3", data)}
                    errors={errors.step3}
                  />
                )}

                {currentStep === 4 && (
                  <Step4InventoryBooking
                    formData={formData.step4}
                    onChange={(data) => handleStepDataChange("step4", data)}
                    errors={errors.step4}
                  />
                )}

                {/* Footer Navigation Actions */}
                <div className="pt-6 border-t border-stone-200 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={currentStep === 1}
                    className={`px-5 py-2.5 rounded-xl font-semibold text-xs transition flex items-center gap-2 ${
                      currentStep === 1
                        ? "bg-stone-100 text-stone-400 cursor-not-allowed border border-stone-200"
                        : "bg-white hover:bg-stone-100 text-stone-800 border border-stone-300"
                    }`}
                  >
                    <ArrowLeft className="w-4 h-4" /> Back Step
                  </button>

                  {currentStep < 4 ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs px-6 py-2.5 rounded-xl transition flex items-center gap-2 shadow-sm"
                    >
                      Continue to Step {currentStep + 1} <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={isPublishing}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm px-8 py-3 rounded-xl transition flex items-center gap-2 shadow-md"
                    >
                      {isPublishing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Publishing Tour...
                        </>
                      ) : (
                        <>
                          <Check className="w-5 h-5 stroke-[3]" /> Publish Tour Product
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Sticky Live Preview Sidebar */}
              <div className="lg:col-span-4">
                <TourPreviewSidebar formData={formData} activeStep={currentStep} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
