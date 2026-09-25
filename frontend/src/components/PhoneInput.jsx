import React, { useState } from "react";
import { useCurrency } from "../lib/currency.jsx";
import { OTHER_COUNTRY, PHONE_COUNTRIES, countryForCurrency, joinPhone, phoneCountry, splitPhone, toE164 } from "../lib/phone.js";

/**
 * Country code picker plus number box. `value` is the whole number
 * (`+66 081 234 5678`); pasting a number that starts with `+` switches the picker.
 */
export default function PhoneInput({ id, "aria-label": ariaLabel, value, onChange, defaultCountry = null, required = false, disabled = false, className = "", inputClassName = "" }) {
  const { currency } = useCurrency();
  const [picked, setPicked] = useState(null);
  const [touched, setTouched] = useState(false);
  const parts = splitPhone(value);
  const iso = parts.iso || picked || defaultCountry || countryForCurrency(currency);
  const country = phoneCountry(iso);
  const invalid = touched && String(value || "").trim() && !toE164(value);

  const changeCountry = (next) => {
    setPicked(next);
    if (next === OTHER_COUNTRY) onChange("+");
    else if (parts.number && parts.iso !== OTHER_COUNTRY) onChange(joinPhone(next, parts.number));
    else onChange("");
  };

  const changeNumber = (typed) => {
    if (/^\s*(\+|00)/.test(typed)) onChange(typed);
    else if (iso === OTHER_COUNTRY) onChange(typed ? `+${typed}` : "");
    else onChange(joinPhone(iso, typed));
  };

  return (
    <div className={className}>
      <div className="flex gap-2">
        {/* Inline width: the screens' shared input classes carry w-full. */}
        <select aria-label="Country code" value={iso} disabled={disabled} onChange={(e) => changeCountry(e.target.value)}
          style={{ width: "auto", flex: "none" }} className={`pr-2 ${inputClassName}`}>
          {PHONE_COUNTRIES.map((option) => <option key={option.iso} value={option.iso}>{option.flag} +{option.dialCode}</option>)}
          <option value={OTHER_COUNTRY}>🌐 Other</option>
        </select>
        <input id={id} aria-label={ariaLabel} type="tel" autoComplete="tel" inputMode="tel" required={required} disabled={disabled}
          value={parts.number} onChange={(e) => changeNumber(e.target.value)} onBlur={() => setTouched(true)}
          placeholder={country ? country.example : "+44 7700 900123"} aria-invalid={Boolean(invalid)}
          className={`min-w-0 flex-1 ${inputClassName}`} />
      </div>
      {invalid && (
        <p className="mt-1 text-xs font-medium text-red-600">
          {country ? `Enter a valid ${country.name} mobile number, for example ${country.example}.` : "Include the country code, for example +44 7700 900123."}
        </p>
      )}
    </div>
  );
}
