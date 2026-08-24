import React, { useState } from "react";
import { CheckSquare, Square, Eye, EyeOff, Archive, IndianRupee, Layers } from "lucide-react";
import Button from "../ui/Button";

export function ProductBulkActions({
  selectedCount = 0,
  onPublishAll,
  onPauseAll,
  onArchiveAll,
  onAdjustPrice,
}) {
  const [deltaPrice, setDeltaPrice] = useState("");
  const [showPriceInput, setShowPriceInput] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-amber-500 text-white rounded-2xl shadow-lg animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2 font-bold text-xs">
        <Layers className="w-4 h-4" />
        <span>{selectedCount} listings selected</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onPublishAll}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-semibold backdrop-blur-xs transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          Publish
        </button>

        <button
          type="button"
          onClick={onPauseAll}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-semibold backdrop-blur-xs transition-colors"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Pause
        </button>

        <button
          type="button"
          onClick={onArchiveAll}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-semibold backdrop-blur-xs transition-colors"
        >
          <Archive className="w-3.5 h-3.5" />
          Archive
        </button>

        {showPriceInput ? (
          <div className="flex items-center gap-1 bg-white text-stone-900 rounded-xl p-1">
            <input
              type="number"
              placeholder="± ₹ Amount"
              value={deltaPrice}
              onChange={(e) => setDeltaPrice(e.target.value)}
              className="w-24 text-xs px-2 py-0.5 outline-none font-mono font-bold"
            />
            <button
              onClick={() => {
                if (deltaPrice) onAdjustPrice(parseInt(deltaPrice, 10));
                setShowPriceInput(false);
                setDeltaPrice("");
              }}
              className="px-2 py-0.5 rounded-lg bg-amber-600 text-white text-[11px] font-bold"
            >
              Apply
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPriceInput(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-semibold backdrop-blur-xs transition-colors"
          >
            <IndianRupee className="w-3.5 h-3.5" />
            Adjust Price
          </button>
        )}
      </div>
    </div>
  );
}

export default ProductBulkActions;
