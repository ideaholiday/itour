import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Car, Check, Download, Hotel, Mail, MapPin, MessageCircle, Package, Phone, Plus, Ticket, X } from "lucide-react";

const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const KIND_ICONS = { HOTEL: Hotel, TRANSPORT: Car, ACTIVITY: Ticket, LISTING: Package, CUSTOM: Plus };

/**
 * The customer's web itinerary (ADR 051): the quotation behind a signed link,
 * in the operator's chosen theme, with the PDF one tap away. Read-only; the
 * data carries package prices only, never line prices or costs.
 */
export default function QuotationItinerary() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/quotations/share/${encodeURIComponent(token)}/view`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "This quotation couldn't be opened.");
        setData(body.itinerary);
        document.title = `${body.itinerary.title} · ${body.itinerary.ref}`;
      })
      .catch((err) => setError(err.message));
  }, [token]);

  if (error) return <main className="grid min-h-screen place-items-center bg-stone-50 p-6 text-center"><div><h1 className="text-xl font-bold text-stone-900">Quotation not available</h1><p className="mt-2 text-sm text-stone-600">{error}</p></div></main>;
  if (!data) return <main className="grid min-h-screen place-items-center bg-stone-50"><p className="text-sm font-semibold text-stone-400">Opening your itinerary…</p></main>;

  const s = data.style;
  const headingStyle = { fontFamily: s.webHeading, color: s.ink };
  const phoneDigits = String(data.brand?.phone || "").replace(/\D/g, "");
  const whatsapp = phoneDigits ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hello, about quotation ${data.ref}: ${data.title}`)}` : null;
  const Heading = ({ children }) => (
    <h2 className="text-2xl font-bold" style={headingStyle}>{children}<span className="mt-2 block h-1 w-10 rounded" style={{ background: s.accent }} /></h2>
  );
  const StayCard = ({ stay }) => (
    <div className="rounded-2xl border-l-4 p-4" style={{ background: s.soft, borderColor: s.accent }}>
      <p className="font-bold" style={{ color: s.ink }}>{stay.name}</p>
      <p className="text-sm" style={{ color: s.muted }}>{stay.stars ? <span style={{ color: s.accent }} aria-label={`${stay.stars} star`}>{"★".repeat(stay.stars)} </span> : null}{stay.city}</p>
      <p className="mt-1 text-sm" style={{ color: s.ink }}>{stay.room} · {stay.meals}</p>
      <p className="text-sm" style={{ color: s.muted }}>{stay.checkIn} to {stay.checkOut} · {stay.nights} night{stay.nights === 1 ? "" : "s"}</p>
    </div>
  );
  const PricePanel = ({ totals }) => (
    <div className="rounded-3xl p-6 text-white" style={{ background: s.primary }}>
      <dl className="space-y-1 text-sm" style={{ color: s.onPrimary }}>
        <div className="flex justify-between"><dt>{data.priceLabel}</dt><dd>{inr(totals.subtotalInr)}</dd></div>
        {totals.gstInr > 0 && <div className="flex justify-between"><dt>GST {totals.gstPct}%</dt><dd>{inr(totals.gstInr)}</dd></div>}
      </dl>
      <div className="mt-3 flex items-baseline justify-between border-t pt-3" style={{ borderColor: s.onPrimary }}>
        <span className="text-xl" style={{ fontFamily: s.webHeading }}>Total</span>
        <span className="text-3xl font-black">{inr(totals.totalInr)}</span>
      </div>
      {data.people > 1 && <p className="mt-1 text-right text-sm" style={{ color: s.onPrimary }}>About {inr(totals.perPersonInr)} per person</p>}
    </div>
  );

  return (
    <main className="min-h-screen bg-white pb-24 sm:pb-10" style={{ color: s.ink }}>
      <header className="relative flex min-h-[26rem] flex-col justify-between overflow-hidden text-white sm:min-h-[30rem]" style={{ background: s.primary }}>
        {data.heroImage && <img src={data.heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/75" />
        <div className="relative mx-auto flex w-full max-w-4xl items-start justify-between gap-4 px-4 pt-6 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em]">{data.isAgent ? "Trade quotation" : data.brand?.name}</p>
          <p className="text-right text-xs uppercase tracking-[0.2em] opacity-90">Quotation<span className="block text-base font-bold tracking-normal">{data.ref}</span></p>
        </div>
        <div className="relative mx-auto w-full max-w-4xl px-4 pb-8 sm:px-8">
          {data.status === "ACCEPTED" && <span className="mb-3 inline-block rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold">Confirmed</span>}
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl" style={{ fontFamily: s.webHeading }}>{data.title}</h1>
          {data.route.length > 0 && <p className="mt-3 text-sm sm:text-base" style={{ color: s.onPrimary }}>{data.route.map((leg) => `${leg.city} · ${leg.nights}N`).join("  →  ")}</p>}
        </div>
        <div className="relative h-1.5" style={{ background: s.accent }} />
      </header>

      <div className="mx-auto max-w-4xl space-y-12 px-4 py-8 sm:px-8">
        <section className="space-y-4">
          {data.preparedFor && <p className="text-sm" style={{ color: s.muted }}>Prepared for {data.preparedFor}</p>}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Travel dates", data.dates], ["Duration", data.duration], ["Travellers", data.travellers], data.validUntil ? ["Valid until", data.validUntil] : ["Issued", data.issued]].map(([label, value]) => (
              <div key={label} className="rounded-2xl p-4" style={{ background: s.soft }}>
                <dt className="text-[11px] font-bold uppercase tracking-wider" style={{ color: s.muted }}>{label}</dt>
                <dd className="mt-1 font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {data.route.length > 0 && (
          <section className="space-y-5">
            <Heading>{data.route.length > 1 ? "Your route" : "Your destination"}</Heading>
            <ol className="grid gap-3 sm:grid-flow-col sm:auto-cols-fr">
              {data.route.map((leg, index) => (
                <li key={`${leg.city}-${index}`} className="overflow-hidden rounded-2xl border" style={{ borderColor: s.line }}>
                  <div className="relative h-28" style={{ background: s.primary }}>
                    {leg.image && <img src={leg.image} alt={leg.city} loading="lazy" className="h-full w-full object-cover" />}
                    <span className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-full text-xs font-black text-white" style={{ background: s.primary }}>{index + 1}</span>
                  </div>
                  <p className="px-3 pt-2 font-bold">{leg.city}</p>
                  <p className="px-3 pb-3 text-sm" style={{ color: s.muted }}>{leg.nights} night{leg.nights === 1 ? "" : "s"}</p>
                </li>
              ))}
            </ol>
            {(data.arrivalPoint || data.departurePoint) && (
              <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm" style={{ color: s.muted }}>
                {data.arrivalPoint && <span><MapPin className="mr-1 inline h-4 w-4" />Arrive at {data.arrivalPoint}</span>}
                {data.departurePoint && <span><MapPin className="mr-1 inline h-4 w-4" />Leave from {data.departurePoint}</span>}
              </p>
            )}
          </section>
        )}

        {data.stays.length > 0 && (
          <section className="space-y-5">
            <Heading>Where you'll stay</Heading>
            <div className="grid gap-3 sm:grid-cols-2">{data.stays.map((stay, index) => <StayCard key={index} stay={stay} />)}</div>
            {data.cars.length > 0 && <p className="text-sm">Travel by private {data.cars.join(" / ")}.</p>}
          </section>
        )}

        <section className="space-y-6">
          <Heading>Day by day</Heading>
          {!data.days.length && <p style={{ color: s.muted }}>The day-by-day plan will follow.</p>}
          <ol>
            {data.days.map((day, index) => (
              <li key={day.dayNumber} className="relative flex gap-4 pb-8 last:pb-0">
                {index < data.days.length - 1 && <span className="absolute bottom-0 left-6 top-12 w-0.5" style={{ background: s.line }} aria-hidden="true" />}
                <span className="relative z-[1] grid h-12 w-12 shrink-0 place-items-center rounded-full text-white" style={{ background: s.primary }}>
                  <span className="text-center leading-none"><span className="block text-[9px] font-bold tracking-wider" style={{ color: s.onPrimary }}>DAY</span><span className="text-lg font-bold">{day.dayNumber}</span></span>
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: s.accent }}>{day.date}{day.city ? ` · ${day.city}` : ""}</p>
                  <h3 className="mt-1 text-xl font-bold" style={headingStyle}>{day.title || `Day ${day.dayNumber}`}</h3>
                  {day.description && <p className="mt-2 leading-relaxed">{day.description}</p>}
                  {day.items.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {day.items.map((item, itemIndex) => {
                        const Icon = KIND_ICONS[item.kind] || Plus;
                        return (
                          <li key={itemIndex} className="flex gap-2 text-sm">
                            <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: s.accent }} />
                            <span>{item.text}{item.note && <span className="block" style={{ color: s.muted }}>{item.note}</span>}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-5">
          {data.options.length ? (
            <>
              <Heading>{data.isAgent ? "Hotel options" : "Choose your hotels"}</Heading>
              <p className="text-sm" style={{ color: s.muted }}>The itinerary is the same for every option; only the hotels and the price change.</p>
              <div className="grid gap-6 lg:grid-cols-2">
                {data.options.map((option) => (
                  <div key={option.name} className="space-y-3">
                    <h3 className="text-xl font-bold" style={{ ...headingStyle, color: s.primary }}>{option.name}</h3>
                    {option.stays.map((stay, index) => <StayCard key={index} stay={stay} />)}
                    <PricePanel totals={option.totals} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <Heading>Your price</Heading>
              <PricePanel totals={data.totals} />
            </>
          )}
          <p className="text-sm" style={{ color: s.muted }}>{data.priceNote}</p>
        </section>

        {(data.inclusions.length > 0 || data.exclusions.length > 0) && (
          <section className="grid gap-8 sm:grid-cols-2">
            {[["What's included", data.inclusions, Check, s.accent], ["Not included", data.exclusions, X, s.muted]].filter(([, items]) => items.length).map(([label, items, Icon, colour]) => (
              <div key={label} className="space-y-3">
                <h2 className="text-xl font-bold" style={headingStyle}>{label}</h2>
                <ul className="space-y-2">{items.map((item) => <li key={item} className="flex gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: colour }} />{item}</li>)}</ul>
              </div>
            ))}
          </section>
        )}

        {data.notes && (
          <section className="space-y-2">
            <h2 className="text-xl font-bold" style={headingStyle}>Good to know</h2>
            <p className="whitespace-pre-line leading-relaxed">{data.notes}</p>
          </section>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-sm" style={{ borderColor: s.line, color: s.muted }}>
          <span>{data.brand ? <><strong style={{ color: s.ink }}>{data.brand.name}</strong>{data.brand.phone && <> · <a href={`tel:${data.brand.phone}`} className="underline"><Phone className="mr-1 inline h-3.5 w-3.5" />{data.brand.phone}</a></>}{data.brand.email && <> · <a href={`mailto:${data.brand.email}`} className="underline"><Mail className="mr-1 inline h-3.5 w-3.5" />{data.brand.email}</a></>}</> : "Trade quotation for the addressed agent"}</span>
          <span className="hidden gap-2 sm:flex">
            <a href={data.pdfUrl} className="flex items-center gap-1 rounded-xl px-4 py-2.5 font-bold text-white" style={{ background: s.primary }}><Download className="h-4 w-4" /> Download PDF</a>
            {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
          </span>
        </footer>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 flex gap-2 border-t bg-white/95 p-3 backdrop-blur sm:hidden" style={{ borderColor: s.line }}>
        <a href={data.pdfUrl} className="flex flex-1 items-center justify-center gap-1 rounded-xl py-3 text-sm font-bold text-white" style={{ background: s.primary }}><Download className="h-4 w-4" /> PDF</a>
        {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
        {phoneDigits && <a href={`tel:${data.brand.phone}`} className="flex items-center justify-center rounded-xl border px-4 py-3" style={{ borderColor: s.line }} aria-label="Call"><Phone className="h-4 w-4" /></a>}
      </div>
    </main>
  );
}
