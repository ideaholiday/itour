# Mobile App Decisions (ADR 052 onward): Idea Holiday

> **Summary:** Owner decisions on the Android apps for travelers, suppliers and drivers, with their reasons.
> **Read when:** changing an Android app or its Play Store release, or recording a new decision in that area. The driver app's own ADR 014 is in [`DECISIONS.md`](DECISIONS.md).

## ADR 052: Three Android Apps, Each a Thin Shell Over the Website
- **Date**: 2026-09-29
- **Context**: The Play Console organisation account is ready to publish (account ID 6122682140764081503). Owners want travelers to book everything from an app, and suppliers and drivers to have apps too.
- **Decision Made** (owner, 2026-09-29):
  - **Three apps:** the traveler app (ideaholiday.in), the supplier app (supply.ideaholiday.in, for owners and staff) and the existing driver app (`in.ideaholiday.driver`, ADR 014). Only the driver app declares the location foreground service.
  - **Thin native shells**, like ADR 014. Each Kotlin app shows the live website in a WebView, so there is no second booking UI. Price, quotes and booking state stay on the server. Native code is added only for what a website can't do well inside an app, such as handing UPI payments to the UPI app, App Links and voucher downloads.
  - **Release order:** driver, then traveler, then supplier. *Replaced by ADR 053: all three release together.*
- **Consequences**: A web deploy updates all three apps with no store release. iPhone users keep the website. Package names for the traveler and supplier apps are still UNKNOWN; they can't be changed after the first upload. Push notifications would need Firebase, a new service (rule R2), so they wait for a separate owner decision. Google can reject apps that are only a wrapped website, so each shell needs at least one native feature before review.

## ADR 053: Driver Sign-In, Push Alerts, Package Names and One Release
- **Date**: 2026-09-30
- **Context**: Drivers could reach a trip only from its private link, so an app opened from its icon showed nothing. Owners want drivers to sign in and see every trip assigned to them, and all three apps to alert their users.
- **Decision Made** (owner, 2026-09-30):
  - **Driver sign-in by email code.** The driver types their email or mobile number and gets a 6-digit code at the roster email for it. No passwords. WhatsApp and SMS codes wait for an approved authentication template.
  - **A driver sees every trip assigned to their email**, from any supplier: requests waiting for an answer, upcoming trips and past trips. Accepting from the list or from the trip link is the same server action.
  - **Firebase Cloud Messaging is approved** for push notifications in all three apps. WhatsApp and email alerts stay.
  - **Package names:** `in.ideaholiday.app` (traveler) and `in.ideaholiday.supplier` (supplier), with `in.ideaholiday.driver` unchanged.
  - **The three apps are built together and released together**, replacing ADR 052's release order.
- **Consequences**: Firebase is a new service (rule R2, approved here) and needs a Firebase project, each app's `google-services.json` and a server credential. A driver whose email changes on the roster sees trips under the new email only.
