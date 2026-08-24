import React, { useState, useEffect } from "react";
import { Heart } from "lucide-react";
import { useAuth } from "../../lib/auth";
import api from "../../lib/api";

export function WishlistButton({ productId, className = "", initialSaved = false, onToggle }) {
  const { user } = useAuth();
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsSaved(initialSaved);
  }, [initialSaved]);

  const handleToggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      // Trigger login prompt or redirect
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    setLoading(true);
    try {
      if (isSaved) {
        await api.delete(`/wishlists/${productId}`);
        setIsSaved(false);
        if (onToggle) onToggle(false);
      } else {
        await api.post(`/wishlists/${productId}`);
        setIsSaved(true);
        if (onToggle) onToggle(true);
      }
    } catch (err) {
      console.error("Wishlist toggle error", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      aria-label={isSaved ? "Remove from wishlist" : "Add to wishlist"}
      className={`p-2 rounded-full backdrop-blur-md transition-all duration-200 ${
        isSaved
          ? "bg-rose-500 text-white shadow-md hover:bg-rose-600 scale-105"
          : "bg-white/80 dark:bg-stone-900/80 text-stone-700 dark:text-stone-300 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-white"
      } ${className}`}
    >
      <Heart className={`w-4 h-4 ${isSaved ? "fill-white stroke-white" : ""}`} />
    </button>
  );
}

export default WishlistButton;
