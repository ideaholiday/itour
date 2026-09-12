# Phase 1 release verification

Final verification date: 11 September 2026. Phase 1 is implemented and deployed with email and WhatsApp verified. SMS activation is explicitly deferred by the user; external ResTech adapters remain Phase 2.

Production release: `idea-holiday-marketplace-wa-fixed-0910`, serving **100% of Cloud Run traffic** and the registered WhatsApp callback. Cloud Build `a206f3ba-ffc8-4f84-a00f-4f934e0dc908` succeeded. Public checks at `https://ideaholiday.in` verified the homepage and JavaScript assets, healthy PostgreSQL API, `demoEnabled: false`, and HTTP 401 for an unauthenticated native hold. The deployed supplier dashboard contains the inventory editor, the activity page contains live availability, and checkout contains the seat-hold UI. Cloud Run reports Ready; the public PostgreSQL health check passed again on 11 September.

The prior production revision `idea-holiday-marketplace-native-p1-0907c` developed database-worker timeouts during the final audit. Direct PostgreSQL inspection found no blocked queries. Traffic was moved to the healthy fixed revision on 10 September and public checks passed afterward. The old image digest is no longer available in Artifact Registry; do not assume it can be redeployed as a rollback image. The precise cause of that older worker's timeout was not established.

| Requirement | Evidence | Status |
| --- | --- | --- |
| Supplier schedules, departure seats, adult/child prices, cutoffs, cancellation windows and blackouts | Supplier inventory editor; native service regressions; supplier-to-traveler browser journey | Implemented and tested |
| Live departure availability and ten-minute checkout hold | Browser journey verifies seat occupancy and refresh preserving expiry; HTTP competing-hold test | Implemented and tested |
| No overselling under concurrent checkout | Isolated PostgreSQL migration/rollback test and six independent connections competing for the last three seats: one hold succeeds | Passed |
| Paid instant confirmation and QR voucher | Native HTTP tests verify payment confirmation, supplier accepted state without manual deadline, confirmed reservation and QR voucher | Passed in isolated test environment |
| Failed payments release inventory; late captures do not confirm sold seats | Signed webhook tests verify release, payment-review state and one operations task on replay | Passed |
| Durable confirmation delivery | Transactional outbox and retry tests; successful/read messages remain idempotent; real email and WhatsApp receipt plus live callback persistence verified separately | Implemented and verified within the stated test scopes |
| OCTO-aligned database and future provider boundary | Native tables, reservation lifecycle, unit projection, provider interface and supplier-scoped external references | Implemented; external connectors are Phase 2 |
| Production database foundation | Read-only inspection confirms all native tables, external references and frozen-pricing column in PostgreSQL `marketplace` schema | Verified |
| Production checkout cannot use free demo confirmation | Public `/api/checkout/config` returns `demoEnabled: false`; production-runtime regression tests | Verified in production |
| SMS service activation | Twilio adapter exists; user explicitly deferred SMS provider setup on 7 September 2026 | Deferred by user |
| Actual email receipt | Brevo event report for the authorized test returned `delivered` and `opened` | Verified |
| Actual WhatsApp receipt | On 10 September the user confirmed that the approved greeting arrived after the selected live app received an account-specific callback. The PostgreSQL status fix is deployed and passed live synthetic persistence checks | Handset receipt confirmed by user; callback persistence verified |

Validation completed on this worktree:

- Backend: **255 tests passed**; coverage 88.85% lines and 90.08% functions.
- Browser suite: **8 journeys passed** on 10 September, including supplier inventory to traveler hold and confirmation.
- HTTP integration suite: **13 tests passed**, including the two native reservation/payment webhook tests.
- PostgreSQL migrations, nested rollback and six-connection last-seat concurrency: passed again on 10 September against an isolated local server, which was stopped afterward.
- Frontend build and bundle budgets passed: 203.4 KiB largest chunk and 63.7 KiB initial entry.
- `git diff --check` passed for the files changed in the final notification fix and verification documentation.

The deployment and database inspection do not prove delivery to a handset or inbox. The live service has email/WhatsApp configuration and both booking-confirmed and operations-alert template settings; all four SMS/Twilio settings remain absent. Live notification tests use only the recipients supplied by the user. No production test payments or bookings were created. See [implementation and setup](native-reservations-phase1.md) for configuration and API details.

Authorized live test reference: `IH-PHASE1-TEST`. Email delivery record: `ntf_a8OQGXJ-g_Pcue`; WhatsApp delivery record: `ntf_QuB7QxjtdmHLIp`. These were sent through the application's notification services using the live configuration. Email receipt was checked through [Brevo's transactional event report](https://developers.brevo.com/reference/get-email-event-report). After the user reported non-delivery, one approved-template retry was sent through the application: delivery record `ntf_yvwPoXJOahRhlf`. Its rendered text is "Idea Holiday / Hello / Idea Holiday Pvt Ltd". No additional email was sent.

## Callback investigation — 9 September 2026

- The live access token belongs to published Meta app `1488217219329539`, **Idea Holiday Pvt Ltd**. Its existing WhatsApp callback belongs to the `whatsapp-api` service in Google Cloud project `ideascan-329bd`.
- The separate app `1704380164303350`, **IdeaHoliday**, was observed unpublished and subscribed to the WhatsApp account. These are distinct apps; an app secret must match the callback's signing app.
- Meta reports messaging available for the phone, WhatsApp business account, business, and token app. The sender is connected, with green quality. These checks do not establish why the test messages failed.
- Secret Manager now contains the matching app secret and webhook verification token. Preview revision `idea-holiday-marketplace-wa-callback-0908` uses the published app's secret. Its registration challenge returned HTTP 200 with the correct challenge; an unsigned callback returned 401; a signed empty callback returned 200.
- Production remains on `idea-holiday-marketplace-native-p1-0907c`. The existing IdeaScan callback has not been replaced. A query of IdeaScan's Cloud Run logs found no records matching the two test message IDs.
- On 10 September, the user selected live app `1488217219329539`, **Idea Holiday Pvt Ltd**. Meta accepted and returned a WABA-specific callback override for account `794585599913804` pointing to `https://whatsapp-preview---idea-holiday-marketplace-2v4to27d7a-uc.a.run.app/api/webhooks/whatsapp`. The app-level default callback remains unchanged. The selected app and the separate IdeaHoliday app are both currently subscribed.
- The callback endpoint was rechecked: registration challenge 200, unsigned POST 401, signed empty POST 200. Keep the `whatsapp-preview` tag while this override is active.
- The prepared callback revision and production have different image digests. An attempt to create a configuration-only revision from the exact production digest failed because that image is no longer in Artifact Registry. Production traffic was not changed; the existing callback revision is used only through its tagged endpoint.
- One approved `idea_holiday` greeting was retried after callback registration: delivery `ntf_bOBWwB3ZtP4xbM`, event key `IH-PHASE1-TEST-WA-0910-CALLBACK`. The user confirmed receipt. No booking or payment was created.
- Meta delivered three callbacks, but the handler could not persist their statuses: PostgreSQL rejected `COALESCE(sent_at, CURRENT_TIMESTAMP)` because `sent_at` is text. The fix explicitly casts the fallback timestamp to text and returns HTTP 503 on processing failures so Meta can retry. Regression verification passed against PostgreSQL temporary tables with missing and existing timestamps; no production rows were changed by that regression check.
- Fix validation: 255 backend tests and 13 HTTP integration tests passed; coverage was 88.85% lines / 90.08% functions; frontend build and bundle checks passed. Handler checks confirmed unsigned requests return 401, successful processing returns 200, and database failures return 503. Isolated callback image build `a206f3ba-ffc8-4f84-a00f-4f934e0dc908` succeeded.
- Callback revision `idea-holiday-marketplace-wa-fixed-0910` is Ready and now serves the existing `whatsapp-preview` callback tag. Customer-facing traffic remains 100% on `idea-holiday-marketplace-native-p1-0907c`; the Cloud Run service reports Ready. A temporary, explicitly synthetic notification passed signed `DELIVERED` and `READ` callbacks through the registered URL and persisted both statuses plus its timestamp in PostgreSQL. The diagnostic row was removed. These synthetic checks verify persistence, not additional handset delivery; the handset evidence is the user's receipt confirmation above. No additional outbound message was needed.
