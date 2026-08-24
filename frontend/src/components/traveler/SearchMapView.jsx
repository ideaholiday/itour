import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { Star, MapPin, X, ArrowRight, ShieldCheck } from "lucide-react";
import { useCurrency } from "../../lib/currency.jsx";

const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };

function createPriceIcon(product, isSelected, isHovered, formatPriceFn) {
  const price = formatPriceFn
    ? formatPriceFn(product.price_inr || product.priceInr)
    : `₹${Number(product.price_inr || product.priceInr || 0).toLocaleString("en-IN")}`;
  const activeClass = isSelected
    ? "bg-stone-950 text-white ring-4 ring-amber-400 scale-110 z-50 font-black shadow-2xl"
    : isHovered
    ? "bg-amber-500 text-stone-950 scale-105 font-bold shadow-lg ring-2 ring-white"
    : "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 border border-stone-300 dark:border-stone-700 shadow-md hover:scale-105";

  const html = `
    <div class="transition-all duration-200 transform cursor-pointer">
      <span class="px-2.5 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1 whitespace-nowrap ${activeClass}">
        ${price}
      </span>
    </div>
  `;

  return L.divIcon({
    className: "custom-price-pin",
    html,
    iconSize: [60, 26],
    iconAnchor: [30, 13],
  });
}

export default function SearchMapView({
  products = [],
  hoveredProductId = null,
  selectedProductId = null,
  onSelectProduct,
  className = "",
}) {
  const { formatPrice, currency } = useCurrency();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersGroupRef = useRef(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Sync selected product from props
  useEffect(() => {
    if (selectedProductId) {
      const found = products.find((p) => p.id === selectedProductId);
      if (found) setSelectedProduct(found);
    }
  }, [selectedProductId, products]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [INDIA_CENTER.lat, INDIA_CENTER.lng],
        zoom: 5,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      // Carto Voyager tile layer (clean, modern map styling)
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 18,
          subdomains: "abcd",
        }
      ).addTo(map);

      const markersGroup = L.featureGroup().addTo(map);
      markersGroupRef.current = markersGroup;
      mapRef.current = map;
    }

    return () => {
      // Map cleanup
    };
  }, []);

  // Update Markers when products, hover or selection changes
  useEffect(() => {
    const map = mapRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();
    const bounds = [];

    products.forEach((product) => {
      if (typeof product.lat !== "number" || typeof product.lng !== "number") return;

      const isSelected = product.id === (selectedProduct?.id || selectedProductId);
      const isHovered = product.id === hoveredProductId;
      const icon = createPriceIcon(product, isSelected, isHovered, formatPrice);

      const marker = L.marker([product.lat, product.lng], { icon });

      marker.on("click", () => {
        setSelectedProduct(product);
        if (onSelectProduct) onSelectProduct(product);
      });

      markersGroup.addLayer(marker);
      bounds.push([product.lat, product.lng]);
    });

    if (bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      } catch {
        // Fallback
      }
    }
  }, [products, hoveredProductId, selectedProductId, selectedProduct, currency, formatPrice]);

  return (
    <div className={`relative w-full h-full min-h-[400px] overflow-hidden rounded-3xl border border-stone-200 dark:border-stone-800 shadow-sm ${className}`}>
      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Selected Product Card Preview */}
      {selectedProduct && (
        <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-20 bg-white dark:bg-stone-900 rounded-3xl p-3.5 border border-stone-200 dark:border-stone-800 shadow-2xl animate-in slide-in-from-bottom-3 duration-200">
          <button
            type="button"
            onClick={() => setSelectedProduct(null)}
            className="absolute top-2.5 right-2.5 p-1 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex gap-3">
            {selectedProduct.hero_image || selectedProduct.heroImage ? (
              <img
                src={selectedProduct.hero_image || selectedProduct.heroImage}
                alt={selectedProduct.title}
                className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-stone-100 dark:border-stone-800"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-amber-100 dark:bg-amber-950/50 grid place-items-center shrink-0">
                <MapPin className="w-6 h-6 text-amber-600" />
              </div>
            )}

            <div className="flex-1 min-w-0 pr-4 space-y-1">
              <span className="text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider block truncate">
                {selectedProduct.city} · {selectedProduct.category}
              </span>
              <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 line-clamp-2">
                {selectedProduct.title}
              </h4>
              <div className="flex items-center gap-2 text-[11px] text-stone-500">
                <div className="flex items-center gap-0.5 text-amber-600 font-bold">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                  <span>{Number(selectedProduct.rating || 4.8).toFixed(1)}</span>
                </div>
                <span>·</span>
                <span className="font-mono font-black text-stone-900 dark:text-stone-100">
                  {formatPrice(selectedProduct.price_inr || selectedProduct.priceInr)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
            <span className="text-[10px] text-stone-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified Tour
            </span>
            <Link
              to={`/activity/${selectedProduct.id}`}
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-amber-400 hover:underline"
            >
              <span>View Details</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
