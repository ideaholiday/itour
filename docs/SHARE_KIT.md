# Supplier Share Kit

> **Summary:** QR codes, printable standees and stickers, a review QR on vouchers, and an embeddable reviews widget that bring people to a supplier's public profile or review link, with visit counts per channel.
> **Read when:** changing `/go/s`, `/api/share`, the voucher review QR, the widget, or the supplier's Share kit panel. Code: `supplierShareKitService.js`, `routes/shareKit.js`.

## 1. Where every piece points

1. **One tracked link:** `/go/s/<profile slug>?t=profile|review&c=<channel>`.
   It records a row in `supplier_share_scans` (supplier, target, channel, review
   link) and redirects: `profile` → the public profile; `review` → the supplier's
   newest active review share link, or the profile when there is none.
2. Channels: `QR`, `STANDEE`, `STICKER`, `VOUCHER`, `WIDGET`, `LINK`; anything
   else counts as `LINK`. **Nothing about the visitor is stored.**
3. A hidden or suspended profile (BUSINESS_RULES §12.2) is not reachable: the link
   goes to the supplier directory and nothing is counted. An old slug still works.
4. **Reviews stay verified.** The review link is the existing share-link path:
   the traveler confirms their booking reference and phone, so a QR cannot be used
   to post reviews without a booking.

## 2. The pieces

1. **Share kit panel** (supplier portal): QR previews, SVG/PNG downloads, print
   links, copyable links and embed code, and visits by channel (last 30 days and
   all time). Opening it creates a review share link labelled "Share kit" if the
   supplier has no active one.
2. **QR images:** `/api/share/s/<slug>/qr.svg|png` (PNG 1024 px). Public, because
   they encode only public links.
3. **Print sheets:** `/api/share/s/<slug>/print?format=standee|sticker&t=…` — an
   A5 standee or a 3-inch sticker as a print-ready page; the browser's Print →
   Save as PDF makes the PDF, so no PDF library is used. Shows the supplier name,
   the Verified badge only when earned, and the QR.
4. **Voucher QR:** a paid, not-cancelled booking's voucher shows "After your trip —
   scan to review", pointing at the review target with channel `VOUCHER`, next to
   the booking reference the review form asks for. Not shown for hidden profiles.
5. **Reviews widget:** `/api/share/s/<slug>/widget`, for an `<iframe>` on the
   supplier's own site. Shows the booking-verified rating, the three latest
   published reviews (escaped, share-link reviews marked not counted), the badge
   when earned, and a tracked link to the profile. It is the only share page that
   may be framed (`frame-ancestors *`, no `X-Frame-Options`); it runs no script.

## 3. Limits and privacy

- Everything under `/go` and `/api/share` is public and rate-limited to 120
  requests a minute per client.
- The pieces never include contact details, GSTIN, PAN, bank details or the
  supplier id (the same allow-list as the profile, §12.1).
