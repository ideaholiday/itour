import React, { useState } from "react";
import { HelpCircle, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import Button from "../ui/Button";

export function ProductFAQBuilder({ faqs = [], onAddFaq, onRemoveFaq }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState("GENERAL");

  const handleAdd = () => {
    if (!question.trim() || !answer.trim()) return;
    onAddFaq({ question: question.trim(), answer: answer.trim(), category });
    setQuestion("");
    setAnswer("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-amber-600" />
          <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-display">
            FAQs & Pre-Trip Information
          </h4>
        </div>
      </div>

      <div className="space-y-2">
        {faqs.map((faq, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex items-start justify-between gap-3 shadow-xs"
          >
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">{faq.category || "GENERAL"}</span>
              <h5 className="text-xs font-bold text-stone-900 dark:text-stone-100">{faq.question}</h5>
              <p className="text-xs text-stone-600 dark:text-stone-400">{faq.answer}</p>
            </div>
            <button
              type="button"
              onClick={() => onRemoveFaq(idx)}
              className="text-stone-400 hover:text-red-600 p-1 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/50 space-y-2">
        <span className="text-xs font-bold text-stone-700 dark:text-stone-300 block">Add New FAQ</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="Question (e.g. Is lunch included?)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="sm:col-span-2 text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900"
          >
            <option value="GENERAL">General</option>
            <option value="PACKING">Packing & Clothes</option>
            <option value="MEALS">Food & Drinks</option>
            <option value="SAFETY">Safety & Health</option>
          </select>
        </div>
        <textarea
          rows={2}
          placeholder="Answer details..."
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className="w-full text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900"
        />
        <Button size="sm" variant="outline" icon={Plus} onClick={handleAdd}>
          Add FAQ Item
        </Button>
      </div>
    </div>
  );
}

export default ProductFAQBuilder;
