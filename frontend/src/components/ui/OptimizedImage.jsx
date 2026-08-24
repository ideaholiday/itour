import React, { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

export function OptimizedImage({
  src,
  alt = "",
  className = "",
  aspectRatio = "aspect-video",
  priority = false,
  fallbackSrc = "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=800&q=80",
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const imageSrc = error ? fallbackSrc : src || fallbackSrc;

  return (
    <div className={`relative overflow-hidden bg-stone-100 dark:bg-stone-800 ${aspectRatio} ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-200 dark:bg-stone-800 animate-pulse text-stone-400">
          <ImageIcon className="w-8 h-8 opacity-40" />
        </div>
      )}
      <img
        src={imageSrc}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setError(true);
          setLoaded(true);
        }}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

export default OptimizedImage;
