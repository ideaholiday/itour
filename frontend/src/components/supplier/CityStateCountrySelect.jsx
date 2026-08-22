import React, { useEffect, useState } from "react";
import { LoaderCircle, LockKeyhole, MapPin } from "lucide-react";
import { api } from "../../lib/api.js";

const fieldClass = "mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:text-stone-400";

export default function CityStateCountrySelect({ city, state, onChange, errors = {}, cityLabel = "Primary operating city" }) {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    api.getCities()
      .then((rows) => {
        if (!active) return;
        setCities(Array.isArray(rows) ? rows : []);
        setLoadError("");
      })
      .catch(() => { if (active) setLoadError("City catalogue is temporarily unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!city || !cities.length) return;
    const selected = cities.find((item) => item.name === city || item.id === city);
    if (selected && (selected.name !== city || selected.state !== state)) {
      onChange({ city: selected.name, state: selected.state, country: "India" });
    }
  }, [cities, city, state, onChange]);

  const chooseCity = (event) => {
    const selected = cities.find((item) => item.id === event.target.value);
    onChange(selected
      ? { city: selected.name, state: selected.state, country: "India" }
      : { city: "", state: "", country: "India" });
  };

  const selectedId = cities.find((item) => item.name === city || item.id === city)?.id || "";

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="text-xs font-bold text-stone-700">
        <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-amber-600" />{cityLabel}</span>
        <span className="relative block">
          <select value={selectedId} onChange={chooseCity} disabled={loading || Boolean(loadError)} className={`${fieldClass} appearance-none pr-10`}>
            <option value="">{loading ? "Loading approved cities…" : "Select a city"}</option>
            {cities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {loading && <LoaderCircle className="absolute right-3 top-6 h-4 w-4 animate-spin text-amber-600" />}
        </span>
        {(errors.city || loadError) && <span className="mt-1 block text-rose-600">{errors.city || loadError}</span>}
      </label>
      <label className="text-xs font-bold text-stone-700">State — filled automatically<input value={state || ""} readOnly placeholder="Select a city first" className={fieldClass} />{errors.state && <span className="mt-1 block text-rose-600">{errors.state}</span>}</label>
      <label className="text-xs font-bold text-stone-700"><span className="flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5 text-emerald-600" />Country</span><input value="India" readOnly className={fieldClass} /></label>
    </div>
  );
}
