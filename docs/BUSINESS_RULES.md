# Business Rules: Idea Holiday Real-Time Reservation Platform

> **Summary:** Pricing, commission, holds, refunds, booking state machine, KYB, supplier profiles and the Verified badge.
> **Read when:** touching money, booking status, cancellation or supplier eligibility. Large: `grep -n '^##' docs/BUSINESS_RULES.md` and read one section.

## 1. Native Inventory & Real-Time Seat Allocation Rules

### 1.1 Dynamic Seat Vacancy Formula
For any given product option, date, and departure time slot, available capacity is computed dynamically:
$$\text{Vacancies} = \text{Configured Max Capacity} - \text{Confirmed Seats} - \text{Active Holds}$$
- **Atomic Serialization**: Database transactions serialize capacity checks and mutations on the product/slot row, preventing race conditions when multiple users attempt checkout simultaneously.
- **Seat Occupancy**: Every passenger unit (both Adult and Child) occupies exactly one physical seat against the departure capacity.

### 1.2 10-Minute Cart Lock Rules (`native_reservations`)
1. **Hold Duration**: When a traveler enters checkout, the backend locks the requested seats for exactly **10 minutes** (`utc_expires_at = now() + 10 min`).
2. **Idempotency & Re-entry**: A traveler refreshing or re-entering the checkout flow within the 10-minute window reuses their existing hold and original expiration timer (`request_key` scoped to owner).
3. **Automatic Expiration**: The moment `utc_expires_at < now()`, the hold stops occupying capacity immediately in vacancy calculations, even before the periodic cleanup cron executes.
4. **Failure Release**: An explicit payment cancellation or signed gateway failure webhook immediately releases held inventory back to the bookable pool.
5. **Payment Transition**: Verified payment atomically transitions the hold from `ON_HOLD` to `CONFIRMED` without performing a double-deduction.

### 1.3 Booking Cut-Off Rules Engine
1. **Supplier Cut-Off Configuration**: Suppliers define booking cut-off thresholds in minutes (`cutoff_minutes`, e.g., `120` = 2 hours).
2. **Automatic Sales Close**: If:
   $$\text{Departure Start Time} - \text{Current Time} \le \text{Cut-Off Minutes}$$
   the departure slot is automatically closed for new bookings. The frontend displays the slot as "Booking Closed" or removes it from live availability.

### 1.4 Supplier Extranet Capacity Modification & Blackout Rules
1. **Capacity Reduction Protection**: A supplier cannot reduce a departure slot's maximum capacity below the number of seats already confirmed or actively held.
2. **Blackout Date Isolation**: Adding a blackout date prevents new searches, holds, and bookings on that date. It does **NOT** cancel pre-existing held or confirmed reservations.

---

## 2. Instant Confirmation vs. Manual Acceptance

1. **Native Reservation Options (`INSTANT`)**:
   - Listings configured with departure schedules and seat inventory in `native_inventory_rules` are **instantly confirmed** upon verified payment.
   - They do **NOT** enter the 24-hour manual supplier acceptance queue. Digital QR vouchers and supplier notifications are issued immediately.
2. **On-Demand / Request-Based Options (`REQUEST`)**:
   - Custom charter transfers or un-slotted activities enter a **24-hour supplier acceptance SLA**.
   - If the supplier does not accept within 24 hours, the booking is automatically escalated to Operations for driver fallback reallocation.

---

## 3. Pricing, Taxes & 5 Product Types Fare Modeling

### 3.1 5 Product Types Fare Rules
1. **Attraction Tickets & Experiential Tours (`ATTRACTION`, `EXPERIENCE`)**:
   - Priced per passenger ticket tier (`Adult`, `Child`, `Senior`, `Infant`) defined in `product_ticket_tiers`.
   - Free infant tiers (`is_free = 1`) count towards max group occupancy but add zero fare.
2. **Transfers (`TRANSFER`)**:
   - Point-to-point and airport transfer routes priced by vehicle category (`product_vehicle_options` or dynamic transfer engine):
     $$\text{Total Price} = \max(\text{Base Fare}, \text{Calculated KM} \times \text{Per-KM Rate}) + \text{Tolls} + \text{Interstate Permit} + \text{GST (5\%)}$$
     Where $\text{Calculated KM} = \text{Haversine Distance} \times 1.25$.
3. **Day Sightseeing Tours (`TOUR`)**:
   - Private tours priced per vehicle category (`SEDAN`, `SUV`, `TEMPO`).
   - Shared tours (SIC) priced per seat from designated `product_sic_hubs`.
4. **Multi-Day Packaged Holidays (`PACKAGE`)**:
   - Tiered hotel packages (`Cab Only`, `3-Star`, `4-Star`, `5-Star`) priced per person per night + base transport fare.

### 3.2 Platform Commission & Supplier Net Earnings
1. **Standard Platform Commission**: **18.0%** (unless overridden by supplier contract or product category).
2. **Frozen Commission**: Commission percentage and exact rupee amount are frozen on the booking record at creation.
3. **Supplier Net Payable**:
   $$\text{Supplier Earnings} = \text{Total Fare} - \text{Platform Commission} - \text{Retained Tax}$$

---

## 4. Cancellation & Refund Rules

Suppliers define custom free-cancellation deadlines in hours (e.g., 24h, 48h, 72h). Standard policy tiers apply:

| Hours Remaining Before Departure | Refund to Traveler | Platform Commission Status | Supplier Payout Status |
| :--- | :--- | :--- | :--- |
| **> Free Cancellation Deadline (e.g. 48h)**| 100% Full Refund | ₹0 Retained | ₹0 Paid |
| **Between Deadline and 24 Hours** | 50% Partial Refund | 50% Retained | 50% Paid |
| **< 24 Hours or No-Show** | 0% (Non-refundable) | 100% Retained | 100% Paid |

- **Supplier SLA Breach / Cancellation**: If a supplier cancels a confirmed booking or fails to provide service, the traveler receives an immediate 100% refund, and a penalty is recorded against the supplier.

---

## 5. Grouped Circuit Itinerary Rules

1. **Atomic All-or-Nothing Guarantee**: When a traveler reserves a multi-day circuit consisting of multiple suppliers, all child native holds must be secured together. If any stop is unavailable, the entire reservation is rolled back.
2. **Single Grouped Payment**: The traveler pays once for the parent circuit order (`circuit_orders`). Payment confirmation confirms all child bookings atomically.
3. **Reschedule Reconfirmation SLA**: An approved reschedule gives all affected suppliers 24 hours to reconfirm the new dates. If any supplier declines, the circuit holds for Operations review to prevent single-stop itinerary breaks.

---

## 6. Pickup OTP Security Handshake Rules

1. **Private Secret**: The 6-digit OTP is revealed only to the traveler in My Trips and on the digital voucher.
2. **Verification Gate**: Chauffeurs cannot start a trip without entering the customer's OTP into the portal.
3. **Brute-Force Lockout**: 5 failed OTP verification attempts lock the booking verification, requiring Operations manual reset.
4. **Payout Hold**: Supplier payouts remain in `SCHEDULED` status until the trip status moves to `completed` via verified OTP.

### 6.1 Driver Dispatch Notifications
Every dispatch message goes by email (HTML trip card with a plain-text part) and WhatsApp (approved template, see `docs/ENVIRONMENT.md` §3.1.1). Times are relative to pickup, in IST.

| When | Traveler | Driver | Supplier | Idea Holiday ops |
| :--- | :--- | :--- | :--- | :--- |
| Driver assigned (auto or manual) | — | Trip request with accept/decline link | — | — |
| Driver accepts | Driver name, phone, vehicle and plate | Trip confirmed, traveler contact | Driver confirmed | — |
| T-24h, driver confirmed earlier | Reminder with driver details | Reminder with traveler details | — | — |
| T-24h, no confirmed driver | Reminder: driver confirmation pending | — | Assign manually (task HIGH) | Assign manually |
| T-12h, no confirmed driver | — | — | Escalated (task CRITICAL) | Escalated |
| T-6h, no confirmed driver | — | — | Operations taking over | Take over assignment |
| T-2h, driver confirmed earlier and not yet on the way | — | Pickup reminder | — | — |
| Driver declines, times out, or no eligible driver | — | Cancellation (if one was assigned) | Assign manually | Assign manually |
| Half of the response window gone, no answer | — | Reminder to accept or decline | — | — |
| On the way / Arrived | Status | — | — | — |
| Trip started / Completed | Status (completion includes a "report a problem" link) | — | Status | — |
| Accepted trip not started 1h after pickup | — | — | Pickup not started | Pickup not started (task CRITICAL) |
| Started trip open 2h after expected end | — | Mark it complete | Completion overdue | — (task HIGH) |
| Started trip open 6h after expected end | — | — | Completion overdue | Confirm completion (task CRITICAL) |
| Day after the trip (hourly job, within 7 days) | Review invite with "report a problem" link | — | — | — |

1. **No duplicate reminders.** A driver who confirms inside the 24-hour (or 2-hour) window has just received the same details, so that window's reminder is skipped.
2. **Operations are messaged only when action is needed.** Routine trip progress is shown on the ops live board, not sent to every staff user.
3. **Traveler contact stays private until acceptance.** A trip request shows the pickup but not the traveler's phone.
4. **Every lost driver re-alerts.** Each decline, timeout or replacement raises a new "assign manually" alert. Each escalation stage and the overdue alert are sent once per schedule.

### 6.2 Manual Assignment Fallback
1. **Escalation ladder.** Without an accepted driver, the booking escalates at the tightest stage reached: 24 hours (supplier and operations alerted, task `HIGH`), 12 hours (task `CRITICAL`), 6 hours (operations take over). A booking first seen inside a later stage gets only that stage's alert, and a stage's alert is skipped if another alert already went out inside its window. The stages are set by `DISPATCH_ESCALATION_HOURS` (default `24,12,6`).
2. **Priority only rises.** A later decline or timeout updates the task note but never lowers a `CRITICAL` task.
3. **Who can assign.** The supplier assigns from its own fleet or an outside driver. Operations can assign from the booking supplier's fleet or an outside driver at any time; the reason is required and stored on the assignment event.
4. **Confirmed by phone.** For drivers without a smartphone, the supplier or operations may record the driver's acceptance after a call, with a note of who confirmed and when. This is allowed while the assignment is still pending, including after its response deadline, and is refused once the driver was removed or the trip schedule changed. It has the same effect as the driver accepting from the link (traveler, driver and supplier notified; task closed) and is audited as `ACCEPT_BY_PHONE` with the acting user.
5. **The trip link still governs the trip.** A phone-confirmed driver receives the trip link in the confirmation email and uses it for on-the-way, arrival, the pickup OTP and completion.

### 6.3 Automatic Driver Assignment
1. **On by default.** Every supplier without a saved preference is assigned automatically; switching it off in the dispatch queue saves the supplier's choice. `DISPATCH_AUTO_DEFAULT=false` turns the platform default off.
2. **When.** From `lead_hours` (default 48) before pickup, for paid bookings the supplier has accepted. Each driver gets `response_minutes` (default 30, never past pickup) to accept; up to `max_attempts` (default 3) drivers are tried per schedule before the booking goes to manual assignment.
3. **Who is eligible.** A fleet driver whose status allows work, whose vehicle suits the booked category, with enough seats for the booking (and the rest of a shared departure), a driver email, and no overlapping trip for the same driver, phone or vehicle within `buffer_minutes`. A shared departure keeps the driver already assigned to it; if that vehicle is full the booking goes to manual assignment rather than a second driver. The dispatch queue lists drivers who cannot be picked and what is missing.
4. **Who is picked.** The supplier's `dispatch_priority` first. Among equal priority, the highest score out of 100:
   - **Reliability, 50:** accepted requests (link or phone) against declines and timeouts over the last 90 days, smoothed so a new driver starts at 80%.
   - **Rating, 30:** the driver's smoothed review rating; unrated drivers count as 4.5.
   - **Availability, 20:** fewer open trips the same day; four or more scores zero.
   The chosen driver's score and its parts are stored on the `ASSIGNED` event.
5. **Supplier notice.** The supplier is told which driver was requested and the response deadline, so it can step in. The notice is dropped if the driver has already accepted.

### 6.3.1 Live Driver Location
1. **Sharing is required for the trip.** A driver can't go "On the way", arrive or start the trip from their link unless their phone sent a position in the last 5 minutes. Sharing continues until the trip is completed. A position entered by operations does not count. Operations and the supplier can still move a trip for a driver who can't share, and that is recorded as their action.
2. **Who sees it.** Operations, the booking's supplier and the traveler see the driver's position for the whole trip. (Traveler tracking is Phase 2.)
3. **Only real positions.** Maps show a driver where a position was reported, marked Live (under a minute), Delayed (up to 5 minutes) or Signal lost. A trip without one is pinned at its pickup and says so.
4. **Retention.** Positions, including each trip's last position, are deleted after 30 days.
5. **Web limits.** The trip page only sends while it is open on screen; it keeps the screen awake and sends at least once a minute. Locked phones or switching to another app stop updates, which shows as Delayed or Signal lost.

### 6.4 Trip Completion
1. **Completion is recorded once, through dispatch.** Driver link, supplier and operations completion all update the assignment, booking, payout (`PAYMENT_HELD` → `SCHEDULED`), timeline and notifications the same way. A supplier marking a dispatched booking completed goes through this path.
2. **Stuck trips are watched.** An accepted trip not started 1 hour after pickup opens a `PICKUP_NOT_STARTED` task (CRITICAL). A started trip still open 2 hours after its expected end (pickup plus product, transfer or package duration; 8 hours for tours without one) opens `TRIP_COMPLETION_OVERDUE` (HIGH) and alerts the driver and supplier; at 6 hours it becomes CRITICAL and operations are alerted. Starting or completing the trip closes these tasks and drops alerts not yet sent.
3. **Operations overrides need a reason.** Operations may start a trip without the pickup OTP (for example, the traveler's phone is dead and the driver checked ID), only for an accepted driver, and may complete a started trip. The reason is stored on the timeline event with the acting user.
4. **A reported problem holds the payout.** A complaint, safety or refund-dispute case opened for a completed booking moves its payout from `SCHEDULED` to `ISSUE_HOLD`, unless it is already in a settlement batch. The payout returns to `SCHEDULED` when the last such case for the booking is rejected, resolved or closed. Held payouts count as pending in supplier and admin totals and are never batched.
5. **Timeline.** Suppliers (their own bookings) and operations see each booking's driver requests, acceptances (link or phone), declines, timeouts, removals and trip status changes with time, actor and note.

---

## 7. Financial Settlement Lifecycle

Supplier payouts transition strictly through 4 states:
1. `SCHEDULED`: Trip complete; funds held pending settlement cycle.
2. `BATCHED`: Grouped into the supplier's active settlement batch.
3. `PROCESSED`: Bank transfer / UPI payout initiated with provider transaction reference.
4. `RECONCILED`: Matched against debit entries in bank statements.
- **KYB Prerequisite**: Payouts are blocked if the supplier's `kyb_status` is not `APPROVED`.

---

## 8. Multi-Domain Routing & ResTech Channel Manager Rules

### 8.1 Domain Role Isolation
1. **Supplier Extranet (`supply.ideaholiday.in`)**:
   - Dedicated for `SUPPLIER` credentials and product publishing extranet.
   - Login attempts by `USER` or unauthorized roles are blocked with a clear redirect notice.
2. **Administrative Console (`admin.ideaholiday.in`)**:
   - Restricted exclusively to authenticated users with `ADMIN` or `STAFF` roles.
3. **Traveler Marketplace (`ideaholiday.in`)**:
   - Consumer-facing marketplace for searching, reserving, and managing traveler trips.
4. **Local Development Parity**:
   - Local execution resolves `supply.localhost` and `admin.localhost` or query parameters (`?portal=supplier`, `?portal=admin`) without requiring `/etc/hosts` DNS overrides.

### 8.2 ResTech Channel Sync & Catalog Mapping Rules
1. **Connection Validation**: Channel connections (`supplier_channel_connections`) require an active endpoint, API key, and automated health verification before product sync is permitted.
2. **External Catalog Ingestion**: ResTech product ingestion maps remote experiences (Bókun, FareHarbor, Bookingkit, TourCMS, Activitar, Anchor, OCTo) into native Idea Holiday activities and option rows.
3. **External Reference Tracking**: Ingested inventory records external IDs in `reservation_external_references` with provider types (`BOKUN`, `FAREHARBOR`, `BOOKINGKIT`, `TOURCMS`, `ACTIVITAR`, `ANCHOR`, `OCTO_GENERIC`) to guarantee idempotency across sync cycles.
4. **OCTo Standard Interoperability**: The platform exposes `/api/octo/v1/*` endpoints complying with the OCTo specification, enabling external booking aggregators to query real-time availability and dispatch reservation holds and confirmations.

---

## 9. Ratings & Review Integrity Rules

### 9.1 A rating is earned, never assigned
1. **No placeholder ratings.** `products.rating`, `suppliers.rating` and `supplier_drivers.rating` are `NULL` until a verified review exists. An unrated listing is presented as **NEW** — it never shows a default star value, and it is omitted from `aggregateRating` structured data.
2. **Only verified sources count.** A rating is computed from reviews whose `source` is `VERIFIED` (left by a traveler on a completed booking) or `SEED` (demo databases only). `IMPORTED` and any future non-booking source is displayed with attribution and excluded from the average.
3. **An operator cannot review their own listing.** A review is refused (`403`) when the booking's traveler email, or the submitting account, is the supplier's own contact email — the address that links a `SUPPLIER` login to its supplier row. This applies to every route: signed-in, mailed invite, and share-link claim. An operator can hold an ordinary traveler account and make a genuine booking with their own fleet; the booking is real, the review would not be.
4. **Reviews and ratings stay in step.** `average_rating` and `review_count` are recalculated on every review event. Moderating the last remaining review back out clears the rating it created.

### 9.2 Cold start is solved by smoothing, not by seeding
1. **Smoothed rating.** Ranking uses a Bayesian average that pulls each entity towards a prior mean with the weight of `RATING_PRIOR_WEIGHT` (20) reviews:

   ```
   smoothed = (20 × priorMean + Σ ratings) / (20 + n)
   ```

2. **The prior mean** is the average rating of entities of the same type that do have reviews — scoped to the product's category where one exists, falling back to 4.5 on an empty marketplace.
3. **A listing with no reviews ranks at the prior**, not last, so a new supplier is neither punished for having no history nor credited with one it does not have. The same smoothed value scores supplier candidates during automatic dispatch.
4. **The smoothed rating is a ranking input only.** It is never displayed to a traveler and never counted as reviews. Displayed values stay literal: the real average, the real count, or nothing at all.

### 9.3 How a review is collected
1. **Two entry points, one standard.** A traveler reaches the review form either through a single-use invite token (sent by email/WhatsApp after the trip) or through a supplier's durable share link or QR. Both resolve to one completed booking, and `reviews.booking_id` is `UNIQUE`, so a trip can be reviewed exactly once.
2. **Invite tokens** are stored only as an HMAC-SHA256 hash, expire after 30 days, are single-use, and are refused once the booking has a review. A resend reuses the live invite rather than minting a second working link.
3. **Share-link claims.** A share link identifies the operator, never a traveler. The traveler claims it with their booking reference plus the last four digits of the phone number on that booking; a successful claim mints the same single-use invite. Every mismatch — unknown reference, another supplier's booking, wrong digits — returns one identical message, so the endpoint is no oracle for guessing references. Claims are rate-limited per IP.
4. **No booking, no review.** There is deliberately no path to review without a completed booking behind it. A public form on a link the supplier controls is how fake reviews get made, and ratings feed supplier ranking and dispatch.
5. **Provenance is recorded.** `reviews.verification_method` is `SIGNED_IN`, `BOOKING_TOKEN` or `BOOKING_REF`, and `reviews.invite_id` links the review to the invite it arrived through. Moderation (§9.1) applies to every route equally.
6. **Supplier links are the supplier's own.** A supplier can create, label, scope to one listing, deactivate and reactivate their links, and see the funnel (opened → matched a booking → reviewed). They can never see or act on another supplier's links.

### 9.4 Demo data
1. Demo reviews (`source = 'SEED'`) exist so a demo marketplace is not empty. They are generated only by `backend/src/lib/demoReviews.js`, which refuses to run unless `ALLOW_DEMO_REVIEWS=true` and hard-fails when `NODE_ENV=production`.
2. Seeded reviews are never a substitute for the cold-start rules above, and no production code path creates them.

## 10. Creator & Affiliate Program Rules

The program pays influencers and affiliates a commission on bookings they bring
in. It follows the shape the large marketplaces use — Viator, GetYourGuide and
Klook all run last-click attribution inside a fixed window, tiered commission,
and a clearing hold before money can be withdrawn — because each of those rules
exists to stop a specific way the money goes wrong.

### 10.1 Attribution: who gets paid for a booking
1. **Two ways to be credited, trusted differently.** A **coupon code** typed at
   checkout is self-evident and needs nothing else. A **referral link** is the
   claim "this visitor clicked my link earlier", which the browser cannot be
   allowed to assert on its own.
2. **A link referral must be backed by a server-side click.** Opening a `?ref=`
   link writes an `affiliate_attributions` row against an anonymous visitor
   token. At booking, the server looks the visitor up; an `affiliate_code` sent
   in the request body with no matching attribution earns nothing.
3. **Last click wins, inside a 30-day window** (`affiliates.attribution_window_days`).
   The creator who most recently sent the traveler is the one credited.
4. **An attribution is spent once.** It is marked consumed by the booking that
   used it, so a single click cannot earn on a stream of later bookings.
5. **Campaign sub-IDs.** `?sub=` on a link (a creator's own label, such as
   `reels-march`) is carried through the click onto the referral, so a creator
   can see which post actually sold rather than only that "something" did.
6. **No self-referral.** A booking whose traveler is the creator themselves is
   refused. It is self-dealing, not a referral.
7. **Suspended creators earn nothing.** Attribution requires `status = 'ACTIVE'`.

### 10.2 Commission and tiers
1. **The rate comes from the creator's tier**, resolved at the moment of accrual
   and frozen onto the referral row. `affiliate_tiers` ships as Starter (10%),
   Rising (12%, at 10 completed bookings and ₹2,00,000 GMV) and Elite (15%, at
   40 and ₹10,00,000).
2. **A promotion is never backdated.** Commission already accrued keeps the rate
   it was booked at. Tier is recomputed when a booking completes or reverses.
3. **One referral per booking.** `affiliate_referrals.booking_id` is `UNIQUE`.

### 10.3 When commission becomes money
1. `PENDING` — the booking is attributed but the trip has not happened.
2. `ELIGIBLE` — the trip completed. The commission is now earned, and carries a
   `payable_at` of completion plus `payout_hold_days` (default 14).
3. **Withdrawable only after `payable_at`.** The hold is the window a refund or
   chargeback realistically arrives in; paying before it means chasing money
   back from a creator who has already spent it.
4. `CANCELLED` — the booking was cancelled or refunded. A commission that had
   already cleared is reversed back out of the balance.
5. `PAID` — settled by a payout.
6. **Balances are derived, not stored.** What a creator may withdraw is computed
   from their referral and payout rows (`computeBalances`), so the figure is
   always a statement about real bookings. Every movement is also written to the
   append-only `affiliate_ledger`.

### 10.4 Payout accounts
1. **A payout destination is an object, not a column.** A creator may hold
   several bank accounts and UPI handles in `affiliate_payout_accounts`, exactly
   one of which is primary.
2. **A bank account is confirmed by a penny drop** before it can receive
   anything. The name the bank holds is kept as a match score rather than a
   yes/no, so a near-miss is visible to a reviewer.
3. **Verification failure is never silent.** If the verification provider is
   unreachable the account is left `PENDING` for a manual check — it is never
   marked good by default.
4. **A changed destination cools off for 24 hours** before it can be paid into.
   The creator's *first* account is exempt: there is nothing to redirect yet,
   and the delay would only punish someone waiting on their first rupee. This is
   the control that makes an account-takeover payout fail.
5. **Accounts are archived, never deleted**, because past payouts point at them.
   An account with a payout in flight cannot be removed at all.
6. **A manual KYC approval attests to the PAN only.** It cannot mark a bank
   account verified — only the bank can.

### 10.5 Payouts and tax
1. **Minimum withdrawal is ₹1,000**, and never more than the withdrawable
   balance.
2. **TDS is withheld at source** on every payout, because commission to a
   resident is a brokerage payment under section 194H: **5% with a verified
   PAN**, **20% without** (section 206AA). A payout therefore carries three
   figures — gross, TDS, net — and the net is what reaches the bank.
3. **The destination must be verified and out of its cooling period**, or the
   request is refused.
4. **Settlement requires the bank's UTR.** Settling marks the funding
   commissions `PAID`, oldest first, so a creator's statement lines up with the
   trips behind it.
5. **A rejected or failed payout returns the money to the creator's balance.**
   It never disappears quietly.
6. **Full account numbers are disclosed deliberately.** The admin payout queue
   shows only a masked destination; the complete details come from a separate,
   audit-logged endpoint used by the person actually making the transfer.

## 11. Travel & Earn: Traveler Referral Rules

Travelers invite friends. The friend gets a discount on their first trip, and
the referrer earns wallet credit on every trip that friend takes. The program is
built so it cannot cost cash: everything it gives away is a fixed share of the
commission on the booking that earned it, and credit can only be spent on more
bookings. Implemented in `referralService.js`; the constants live in
`REFERRAL_POLICY`.

### 11.1 What a booking gives away
1. **Friend discount: 10% of the booking's commission, on the friend's first
   paid trip only.** Priced from the quote the traveler saw
   (`quote.commissionAmount`) so checkout and charge agree, and never more than
   the booking's actual commission.
2. **Referrer credit: 10% of the booking's commission, on every paid trip** the
   friend takes while the relationship is earning (24 months from signup).
3. **No flat amounts, anywhere.** Both figures are whole rupees rounded down. A
   booking therefore gives away at most 20% of its commission on the first trip
   and 10% after, whatever it costs. Tiers (Explorer, Voyager, Globe Trotter) are
   recognition only and never change the rate.
4. **Discounts come out of commission, never the supplier's payout.**
   `amount_inr + wallet_credit_applied_inr + referral_discount_inr` equals
   `commission_amount + supplier_payout_amount` on every booking.
5. **One referrer per booking.** A booking brought in by a creator's coupon or
   link (§10) pays the creator and carries no traveler referral, so the two
   programs never both spend the same margin. Without a promo code, the
   visitor's creator link decides; a traveler `REF-` code in the promo field
   does not count as a creator coupon.

### 11.2 Who can be referred
1. **One referrer per traveler, permanently** (`referral_relationships.referred_user_id`
   is `UNIQUE`). A later code never rebinds it.
2. **A typed code wins; otherwise the visitor's latest link click is used.**
   Opening a `?ref=REF-…` link writes a `referral_attributions` row against the
   visitor token, valid 30 days, so the referral survives until signup even if
   the URL is lost. It is consumed by the signup that uses it.
3. **The friend must be new.** No paid booking under their account, email or
   phone. Checked again at booking for a relationship created from a checkout
   code.
4. **Self-referral is refused on five identifiers:** same account, same phone
   (last 10 digits), same mailbox (lower-cased, `+tag` removed, Gmail dots
   removed), same browser (`users.signup_visitor_id`), and — at booking — the
   referrer's phone typed as the traveler's. A same-account or not-new result
   is logged and nothing is created. A phone, mailbox or browser match stores the
   pairing as `BLOCKED` so the account cannot keep trying other codes;
   operations can reopen it (for example, family sharing a phone).
5. **Payment instrument matching is not implemented.** Card BIN/last-4 and UPI
   handles are not stored with payments today, so that signal has nothing to
   compare.

### 11.3 When a reward becomes credit
1. `ACCRUED` — written when the booking is created. Nothing is spendable.
2. **The trip completes.** `payable_at` is set to completion + 7 days.
3. `CLEARED` — after `payable_at`, the credit is posted to the wallet by the
   lifecycle job (every 5 minutes), with an expiry 12 months out.
4. `HELD_FOR_REVIEW` — instead of clearing, if the referrer would pass ₹5,000 of
   credit in 30 days, or the relationship was flagged because the referrer had
   more than 5 referred signups in 24 hours. An operator approves (clears on the
   next run) or rejects.
5. `VOID` — the booking was cancelled, refunded or abandoned before the reward
   cleared. No money moved.
6. `REVERSED` — the booking was refunded after the reward cleared. The credit is
   taken back in full, as far as the balance allows; the rest goes to
   `users.wallet_clawback_pending_inr` and is recovered from the referrer's next
   credits. **A wallet balance never goes negative.**
7. **Any refund reverses the whole reward**, including a partial one.
8. The lifecycle job re-checks every live reward against its booking, so a
   cancellation from a path that does not call the hook (OCTo, circuit orders,
   payment review) is still caught within one run.

### 11.4 The wallet
1. **The ledger is the balance.** Money moves only through `postWalletEntry`,
   which updates `users.wallet_balance_inr` and appends a `wallet_transactions`
   row together. The lifecycle job logs an error if any user's cached balance
   and ledger sum disagree.
2. **Each money movement happens once per booking** (`UNIQUE (booking_id, entry_type)`).
3. **Spending:** up to 50% of what is left after other discounts, at most ₹2,000
   per booking, never more than the balance. If the deduction fails, the booking
   is not created — it never keeps a discount it did not pay for.
4. **Credit cannot be withdrawn as cash.** This keeps it a discount rather than a
   payout, outside the TDS and payout-account controls of §10. Do not make it
   withdrawable without revisiting both.
5. **Spent credit comes back** when a booking is abandoned before payment (all
   of it) or cancelled with a refund (the same share as the cash refund).
6. **Credit expires 12 months after it clears**, soonest-expiring spent first,
   with one reminder 30 days before. Credit issued before v3 has no expiry, as
   its original terms promised.
7. **Every v1 referral was carried over** by `backfillLegacyReferrals`: rewarded
   ones as `CLEARED` (no new credit), pending ones as `ACCRUED` at the v3 rate,
   plus one `ADJUSTMENT` wherever v1 had let a balance and its ledger drift.

---

## 12. Supplier Profiles

Every registered supplier has a public page at `/suppliers/<slug>` that
travelers can find on the marketplace and on Google. Code:
`supplierProfileService.js`, `supplierEnquiryService.js`, `routes/seo.js`.

### 12.1 What a profile shows, and what it never shows
1. **Never public:** email, phone, contact name, GSTIN, PAN, bank details, the
   supplier id. `publicSupplierView` is an allow-list and is tested for this.
2. **No products on a profile.** A paid Spotlight (not built yet) is what will
   put a product there. Marketplace search is unaffected: KYB-approved suppliers'
   products stay bookable there.
3. **Profile text refuses contact details** — phone numbers, emails, links,
   WhatsApp. Social links are collected only as schema.org `sameAs` and are not
   rendered.
4. Reviews: published reviews are shown. Only booking-verified ones count toward
   the rating (§9.1); share-link reviews are labelled as not counted. Product
   titles are left out of profile reviews (rule 2).

### 12.2 Visibility and Google
1. A profile is **visible** unless the supplier hid it (`HIDDEN`), an admin
   suspended it (`SUSPENDED`, reason required), or KYB is `SUSPENDED`.
2. A visible profile is **indexable once KYB is `APPROVED`**. Before that it is
   public with `noindex`, and it is left out of `sitemap-suppliers.xml`. Paying
   is not required to appear on Google.
3. City pages (`/suppliers/in/<city>`) are indexable when the city has an
   indexable profile.
4. A slug change keeps the old slug as a 301 redirect, and no other supplier can
   take it. Reserved slugs (`in`, `admin`, `search`, …) are refused.
5. Review-star structured data is emitted only with **3 or more counted reviews**.

### 12.3 The Verified badge
1. Shown only when KYB is `APPROVED` **and** an `ACTIVE` `supplier_verifications`
   row has `valid_until` in the future. Everyone else shows **Not verified**.
2. It certifies a yearly business check that goes beyond KYB. Required checks:
   business identity (GSTIN or PAN), bank account in the business name, business
   address, a call with the owner. Tourism registration and vehicle permits are
   recorded when they apply.
3. A grant lasts **365 days** and supersedes any active one. It lapses on its
   own; KYB suspension removes it immediately; an admin can revoke it with a reason.
4. **The badge is never sold.** When paid Verified plans exist, payment buys the
   check; the badge still appears only if the checks pass (rejected checks are
   refunded). Today admins grant it manually after checking.

### 12.4 Enquiries
1. Only signed-in travelers can enquire; a supplier cannot enquire with itself,
   including through a traveler account on the supplier's email.
2. One open thread per traveler per supplier: a new enquiry continues it.
3. Messages with contact details are **refused with an explanation**, not held.
   Suppliers see the traveler's first name only.
4. Limits: 10 new enquiries and 60 messages per hour per client.
