import React, { useState } from "react";
import { Plus, Trash2, Tag, IndianRupee } from "lucide-react";
import Button from "../ui/Button";

export function ProductAddonsManager({ addons = [], onAddAddon, onRemoveAddon }) {
  const [addonName, setAddonName] = useState("");
  const [description, setDescription] = useState("");
  const [priceInr, setPriceInr] = useState("");
  const [pricingType, setPricingType] = useState("PER_PERSON");

  const handleAdd = () => {
    if (!addonName.trim() || !priceInr) return;
    onAddAddon({
      addonName: addonName.trim(),
      description: description.trim(),
      priceInr: Number(priceInr),
      pricingType,
    });
    setAddonName("");
    setDescription("");
    setPriceInr("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-amber-600" />
          <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-display">
            Optional Add-Ons & Extras
          </h4>
        </div>
      </div>

      <div className="space-y-2">
        {addons.map((addon, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex items-center justify-between shadow-xs"
          >
            <div>
              <h5 className="text-xs font-bold text-stone-900 dark:text-stone-100">{addon.addon_name || addon.addonName}</h5>
              {addon.description && <p className="text-[11px] text-stone-500">{addon.description}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-extrabold font-mono text-stone-900 dark:text-stone-100">
                +₹{addon.price_inr || addon.priceInr}{" "}
                <span className="text-[10px] text-stone-400 font-normal">
                  / {addon.pricing_type === "PER_PERSON" ? "person" : "booking"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onRemoveAddon(idx)}
                className="text-stone-400 hover:text-red-600 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/50 space-y-2">
        <span className="text-xs font-bold text-stone-700 dark:text-stone-300 block">Add New Extra</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="Add-on Name (e.g. Photography Pack)"
            value={addonName}
            onChange={(e) => setAddonName(e.target.value)}
            className="text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900"
          />
          <div className="flex gap-1">
            <input
              type="number"
              placeholder="Price (₹)"
              value={priceInr}
              onChange={(e) => setPriceInr(e.target.value)}
              className="w-full text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900 font-mono"
            />
            <select
              value={pricingType}
              onChange={(e) => setPricingType(e.target.value)}
              className="text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900"
            >
              <option value="PER_PERSON">Per Person</option>
              <option value="FLAT">Flat Rate</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Short description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900"
          />
        </div>
        <Button size="sm" variant="outline" icon={Plus} onClick={handleAdd}>
          Add Extra
        </Button>
      </div>
    </div>
  );
}

export default ProductAddonsManager;
