import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

/**
 * Autocomplete-with-search. A picker that reads like a text input: staff type
 * to filter and pick with the mouse or the keyboard (↑ ↓ Enter Esc). Falls
 * back to the current label when the popover is closed, so it reads like a
 * select while still typing-searchable.
 *
 * options: [{ value, label, hint? }]
 * value:   current selection's value, or "" for none.
 * onChange(nextValue)
 */
export default function Combobox({ value, onChange, options = [], placeholder = "Choose…", disabled = false, className = "", ariaLabel, allowClear = true, freeText = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const selected = options.find((option) => option.value === value) || null;

  // Free-text mode: the input's own text is the value, so `value` is the text
  // and any option pick replaces it. This lets staff type a city the catalogue
  // doesn't yet know about while still autocompleting the ones it does.
  const searchTerm = freeText ? (open ? query : value || "") : (open ? query : "");
  const filtered = useMemo(() => {
    const q = (freeText ? searchTerm : query).trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => `${option.label} ${option.hint || ""}`.toLowerCase().includes(q));
  }, [options, query, searchTerm, freeText]);

  useEffect(() => { if (open) setActive(0); }, [open, query]);
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${active}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const commit = (option) => {
    if (freeText) onChange(option ? option.label : (query || value || ""));
    else onChange(option ? option.value : "");
    setOpen(false); setQuery(""); inputRef.current?.blur();
  };

  const onKey = (event) => {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) { setOpen(true); event.preventDefault(); return; }
    if (!open) return;
    if (event.key === "ArrowDown") { setActive((current) => Math.min(current + 1, filtered.length - 1)); event.preventDefault(); }
    else if (event.key === "ArrowUp") { setActive((current) => Math.max(current - 1, 0)); event.preventDefault(); }
    else if (event.key === "Enter") { if (filtered[active]) commit(filtered[active]); event.preventDefault(); }
    else if (event.key === "Escape") { setOpen(false); setQuery(""); event.preventDefault(); }
  };

  const display = freeText ? (open ? query : value || "") : (open ? query : (selected?.label || ""));
  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={ariaLabel ? `${ariaLabel}-list` : undefined}
          aria-label={ariaLabel}
          value={display}
          disabled={disabled}
          placeholder={selected ? selected.label : placeholder}
          onFocus={() => { if (freeText) setQuery(value || ""); setOpen(true); }}
          onChange={(event) => { setQuery(event.target.value); if (freeText) onChange(event.target.value); if (!open) setOpen(true); }}
          onKeyDown={onKey}
          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 pr-16 text-sm outline-none focus:border-amber-500 disabled:opacity-60"
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-stone-400">
          {allowClear && selected && !disabled && (
            <button type="button" onMouseDown={(event) => { event.preventDefault(); onChange(""); setQuery(""); }} aria-label="Clear" className="pointer-events-auto rounded p-0.5 hover:bg-stone-100 hover:text-stone-700"><X className="h-3.5 w-3.5" /></button>
          )}
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>
      {open && (
        <ul
          ref={listRef}
          id={ariaLabel ? `${ariaLabel}-list` : undefined}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-stone-200 bg-white shadow-lg"
        >
          {filtered.length === 0 && <li className="px-3 py-2 text-xs text-stone-500">No match.</li>}
          {filtered.map((option, index) => (
            <li
              key={option.value}
              data-index={index}
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => { event.preventDefault(); commit(option); }}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${index === active ? "bg-amber-50" : ""} ${option.value === value ? "font-bold text-amber-800" : "text-stone-800"}`}
            >
              <span className="min-w-0 truncate">
                <span className="truncate">{option.label}</span>
                {option.hint && <span className="ml-2 text-xs text-stone-500">{option.hint}</span>}
              </span>
              {option.value === value && <Check className="h-4 w-4 shrink-0 text-amber-700" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
