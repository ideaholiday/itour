import React, { useState } from "react";
import { CheckSquare, Square, ShieldCheck, Sun, Umbrella, Camera, FileText } from "lucide-react";

export function PreTripChecklist({ items = [], onToggle }) {
  const defaultItems = [
    { id: "id_proof", label: "Valid Government Photo ID (Aadhaar / Passport)", icon: FileText, done: false },
    { id: "shoes", label: "Comfortable Walking Shoes & Footwear", icon: Sun, done: false },
    { id: "camera", label: "Fully charged smartphone / camera for photography", icon: Camera, done: false },
    { id: "clothing", label: "Weather-appropriate clothing & modest attire for temples", icon: Umbrella, done: false },
    { id: "voucher", label: "Offline copy of your Idea Holiday booking voucher", icon: ShieldCheck, done: true },
  ];

  const [checklist, setChecklist] = useState(items.length ? items : defaultItems);

  const handleToggle = (id) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
    if (onToggle) onToggle(id);
  };

  const completedCount = checklist.filter((i) => i.done).length;

  return (
    <div className="p-5 sm:p-6 rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-display">
            Pre-Trip Preparation Checklist
          </h4>
          <p className="text-xs text-stone-500">Everything you need before meeting your driver / guide.</p>
        </div>
        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2.5 py-1 rounded-full font-mono">
          {completedCount} / {checklist.length} Ready
        </span>
      </div>

      <div className="space-y-2 pt-1">
        {checklist.map((item) => {
          const Icon = item.icon || FileText;
          return (
            <div
              key={item.id}
              onClick={() => handleToggle(item.id)}
              className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                item.done
                  ? "border-emerald-200 dark:border-emerald-950/60 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300"
                  : "border-stone-100 dark:border-stone-800 hover:border-stone-300 bg-stone-50/50 dark:bg-stone-800/40 text-stone-700 dark:text-stone-300"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 shrink-0 ${item.done ? "text-emerald-600" : "text-stone-400"}`} />
                <span className={`text-xs font-medium ${item.done ? "line-through opacity-80" : ""}`}>
                  {item.label}
                </span>
              </div>
              {item.done ? (
                <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-stone-300 dark:text-stone-600 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PreTripChecklist;
