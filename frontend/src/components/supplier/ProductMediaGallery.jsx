import React, { useState } from "react";
import { Upload, Trash2, Star, Image, Video, Plus } from "lucide-react";
import Button from "../ui/Button";

export function ProductMediaGallery({
  media = [],
  onAddMedia,
  onRemoveMedia,
  onSetHero,
  maxImages = 15,
}) {
  const [newUrl, setNewUrl] = useState("");
  const [newAlt, setNewAlt] = useState("");

  const handleAdd = () => {
    if (!newUrl.trim()) return;
    onAddMedia({
      url: newUrl.trim(),
      altText: newAlt.trim(),
      mediaType: newUrl.includes("youtube.com") || newUrl.includes("vimeo.com") ? "VIDEO" : "IMAGE",
    });
    setNewUrl("");
    setNewAlt("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-display">Media Gallery</h4>
          <p className="text-xs text-stone-500">Add up to {maxImages} high-resolution photos and videos. First image is the hero.</p>
        </div>
        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2.5 py-1 rounded-full">
          {media.length} / {maxImages} items
        </span>
      </div>

      {/* Grid of existing media */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {media.map((item, idx) => (
          <div
            key={idx}
            className="group relative aspect-video rounded-2xl overflow-hidden border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900 shadow-sm"
          >
            {item.mediaType === "VIDEO" ? (
              <div className="w-full h-full flex items-center justify-center bg-stone-900 text-white">
                <Video className="w-8 h-8 opacity-80" />
              </div>
            ) : (
              <img
                src={item.url || item}
                alt={item.altText || `Media ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            )}

            {/* Badges and controls */}
            {idx === 0 ? (
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold shadow-sm flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5 fill-white" />
                Hero
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onSetHero && onSetHero(idx)}
                className="opacity-0 group-hover:opacity-100 absolute top-2 left-2 px-2 py-0.5 rounded-md bg-stone-900/80 text-white text-[10px] font-bold shadow-sm hover:bg-amber-600 transition-opacity"
              >
                Set as Hero
              </button>
            )}

            <button
              type="button"
              onClick={() => onRemoveMedia(idx)}
              className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 p-1.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition-opacity shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {/* Add item tile */}
        {media.length < maxImages && (
          <div className="aspect-video rounded-2xl border-2 border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/50 flex flex-col items-center justify-center p-3 text-center">
            <input
              type="text"
              placeholder="Paste image URL..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="w-full text-xs rounded-xl border border-stone-200 dark:border-stone-700 px-2 py-1 bg-white dark:bg-stone-900 mb-1"
            />
            <input
              type="text"
              placeholder="Alt text (SEO)..."
              value={newAlt}
              onChange={(e) => setNewAlt(e.target.value)}
              className="w-full text-[11px] rounded-xl border border-stone-200 dark:border-stone-700 px-2 py-1 bg-white dark:bg-stone-900 mb-2"
            />
            <Button size="sm" variant="outline" icon={Plus} onClick={handleAdd} className="w-full">
              Add Photo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductMediaGallery;
