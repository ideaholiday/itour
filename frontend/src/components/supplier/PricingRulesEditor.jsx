import React, { useState } from "react";
import { Zap, Plus, IndianRupee, Percent } from "lucide-react";
import Button from "../ui/Button";

export function PricingRulesEditor({ rules = [], onAddRule }) {
  const [ruleType, setRuleType] = useState("SEASONAL");
  const [title, setTitle] = useState("");
  const [adjustmentType, setAdjustmentType] = useState("PERCENT");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleAdd = () => {
    if (!title.trim() || !adjustmentValue) return;
    onAddRule({
      ruleType,
      title: title.trim(),
      adjustmentType,
      adjustmentValue: Number(adjustmentValue),
      startDate: startDate || null,
      endDate: endDate || null,
    });
    setTitle("");
    setAdjustmentValue("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-600" />
          <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-display">
            Dynamic & Seasonal Pricing Rules
          </h4>
        </div>
      </div>

      <div className="space-y-2">
        {rules.map((r, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex items-center justify-between shadow-xs"
          >
            <div>
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">{r.rule_type || r.ruleType}</span>
              <h5 className="text-xs font-bold text-stone-900 dark:text-stone-100">{r.title}</h5>
              {(r.start_date || r.startDate) && (
                <span className="text-[11px] text-stone-500">
                  {r.start_date || r.startDate} to {r.end_date || r.endDate}
                </span>
              )}
            </div>
            <span className="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 rounded-xl">
              {r.adjustment_type === "PERCENT" ? `+${r.adjustment_value}%` : `+₹${r.adjustment_value}`}
            </span>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/50 space-y-2">
        <span className="text-xs font-bold text-stone-700 dark:text-stone-300 block">Create Rule</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="Rule Title (e.g. Diwali Surge)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900"
          />
          <select
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value)}
            className="text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900"
          >
            <option value="SEASONAL">Seasonal / Holiday</option>
            <option value="EARLY_BIRD">Early Bird Discount</option>
            <option value="LAST_MINUTE">Last Minute Surge/Discount</option>
            <option value="GROUP">Group Size Discount</option>
          </select>
          <div className="flex gap-1">
            <input
              type="number"
              placeholder="Value"
              value={adjustmentValue}
              onChange={(e) => setAdjustmentValue(e.target.value)}
              className="w-full text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900 font-mono"
            />
            <select
              value={adjustmentType}
              onChange={(e) => setAdjustmentType(e.target.value)}
              className="text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900"
            >
              <option value="PERCENT">%</option>
              <option value="FIXED">₹</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-stone-500 block mb-0.5">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900"
            />
          </div>
          <div>
            <label className="text-[10px] text-stone-500 block mb-0.5">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900"
            />
          </div>
        </div>

        <Button size="sm" variant="outline" icon={Plus} onClick={handleAdd}>
          Save Rule
        </Button>
      </div>
    </div>
  );
}

export default PricingRulesEditor;
