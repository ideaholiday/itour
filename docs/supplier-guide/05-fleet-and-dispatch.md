# 5. Fleet and dispatch

> **Summary:** Adding drivers and vehicles, automatic and manual driver assignment, "confirmed by phone", the pickup OTP, live driver location, the alert timeline before pickup, and trip completion.
> **Read when:** a supplier sets up drivers, a trip has no driver, a driver can't start a trip, or a payout is stuck because a trip isn't completed.

[Back to the guide](README.md)

## 5.1 The fleet roster

Open with the **Fleet** tab, **Fleet & Drivers** quick action, or **Manage fleet** on the Overview.

### Add a driver
| Field | Required | Why it matters |
| :--- | :--- | :--- |
| Driver full name | Yes | Shown to the traveler after the driver accepts |
| Driver WhatsApp phone | Yes | Trip requests and reminders go here |
| Vehicle registration plate | Yes | Shown to the traveler |
| Vehicle category / model | Yes | Must suit the booked category (Sedan, SUV, Tempo Traveller, Bus...) |
| **Driver email** | For automatic assignment | **Without an email, the driver can't be picked automatically** |
| **Vehicle seats** | For automatic assignment | Must fit the booking's travelers |
| Commercial badge / DL number | No | Record keeping |

The same phone number or plate can't be added twice. To add an email or seats to an existing driver later, use **Update dispatch contact and seats**.

### Driver status
| Status | Meaning |
| :--- | :--- |
| **Available** | Can get trips |
| **Unavailable** | Off duty |
| **Vehicle maintenance** | Vehicle is out of service |
| **Inactive** | No longer driving for the supplier |

A driver in the middle of a trip can't be made unavailable until that trip is completed.

> **Tell the supplier:** "Add every driver with their **email and seat count**. Drivers without them can't get trips automatically, and you'll have to assign every trip by hand."

## 5.2 The dispatch queue

At the top of the **Bookings** page. It lists bookings waiting for a driver and trips that need attention, with deadlines ("Overdue by…"), a **Critical** tag, **Timeline**, **Open live map** and **Open booking**.

## 5.3 Automatic assignment

**On by default** for every supplier. The dispatch queue has **Enable / Disable automatic assignment**. Turning it off is saved as the supplier's choice.

How it works (default settings):
1. From **48 hours** before pickup, for paid bookings the supplier has accepted.
2. The system picks an eligible driver and sends them a trip request with an accept / decline link.
3. The driver has **30 minutes** to accept (never past pickup time). Halfway through, they get a reminder.
4. Up to **3 drivers** are tried. After that, the booking goes to manual assignment.

**Who is eligible:** status allows work · vehicle suits the booked category · enough seats · has a driver email · no other trip for the same driver, phone or vehicle within 30 minutes. For a shared departure, the driver already on it is kept. If that vehicle is full, the booking goes to manual assignment.

**Who is picked first:** the supplier's priority order, then the best score out of 100:
- **Reliability (50):** how often the driver accepted rather than declined or timed out, over 90 days. New drivers start at 80%.
- **Rating (30):** the driver's review rating. Unrated drivers count as 4.5.
- **Availability (20):** fewer trips the same day scores higher. 4 or more trips scores 0.

The supplier is told which driver was requested and the deadline, so they can step in.

> **Team note:** if the queue says "Automatic assignment needs at least one driver in your fleet", the supplier has no drivers. It also lists drivers who can't be picked and what's missing (for example "No driver email").

## 5.4 Manual assignment

In the booking's **Driver & fleet dispatch** section:
- **Select fleet driver:** each driver is marked "Available for this trip" or "Not available", with the reason.
- **Outside driver (not in your fleet):** enter name, phone, email, seats, and a vehicle model that suits the booked category.
- Press **Confirm Driver Assignment**. The driver gets the trip link and must accept.

### Confirmed by phone
For drivers without a smartphone: after calling the driver, tick **"I spoke to the driver and they accepted"** and add a note, e.g. "Called Ravi at 18:05, he accepted".
- It counts the same as the driver accepting from the link: the traveler, driver and supplier are notified.
- The note is required and saved in the audit log.
- It works while the assignment is still pending, even after its deadline. It's refused if the driver was removed or the trip time changed.

> **Tell the supplier:** "Only use 'confirmed by phone' after you have really spoken to the driver. It is recorded with your name."

## 5.5 What happens before pickup if no driver is confirmed

| Time before pickup | What happens |
| :--- | :--- |
| **24 hours** | Traveler told "driver confirmation pending". Supplier and operations told to assign by hand (HIGH). |
| **12 hours** | Escalated (CRITICAL) |
| **6 hours** | **Idea Holiday operations take over** the assignment |

Operations can assign a driver from the supplier's fleet, or an outside driver, at any time, with a reason.

When a driver **is** confirmed: traveler and driver get reminders 24 hours before, and the driver gets another 2 hours before if they are not yet on the way.

## 5.6 On the day: the trip

1. **On the way / Arrived:** the driver taps these on the trip link. The traveler is told.
2. **Pickup OTP:** the traveler shows their **6-digit code** (only in their My Trips and voucher). The driver or supplier enters it to **start the trip**.
   - A trip can't start without it.
   - **5 wrong tries lock it.** Operations must reset it.
   - If the traveler's phone is dead, operations can start the trip without the OTP after checking ID, with a reason.
3. **Complete:** the driver (or supplier) marks the trip completed. The booking moves to `completed` and the payout to scheduled.

> **Tell the supplier:** "Never start a trip without the traveler's OTP. It proves the pickup happened and protects your payout if there's a dispute."

## 5.7 Live driver location

- The driver's phone must **share location**. From the trip link, the driver can't tap On the way, Arrived or Start trip unless the phone sent a position in the last 5 minutes.
- **In a browser**, location is only sent while the trip page is open on screen. Locking the phone or switching apps stops it.
- **The Idea Holiday Driver Android app** keeps sharing in the background, even with the phone locked or Maps open, until the trip is completed.
- The supplier, operations and traveler see the driver's position during the trip. Map labels: **Live** (under 1 minute), **Delayed** (up to 5 minutes), **Signal lost**.
- The traveler gets a private tracking link (valid 7 days) with the driver, vehicle, position and arrival time. Never before the driver accepts, and not after completion.
- Within 150 m of pickup, the driver page asks the driver to tap **Arrived**.
- Location history is deleted after 30 days.

**Missed-pickup alerts** (from 30 minutes before pickup): the supplier and operations are alerted if the driver hasn't started moving, lost signal, is more than 10 minutes late, or hasn't moved for 10 minutes while more than 1 km away.

> **Tell the supplier:** "Ask drivers to install the Idea Holiday Driver app. The browser page stops sharing when the phone locks, which triggers 'Signal lost' alerts."

## 5.8 Stuck trips

| Situation | Alert |
| :--- | :--- |
| Accepted trip **not started 1 hour after pickup** | "Pickup not started" (CRITICAL) to supplier and operations |
| Started trip still open **2 hours** after expected end | Driver and supplier asked to complete it (HIGH) |
| Still open **6 hours** after expected end | Operations alerted (CRITICAL) |

Expected end = pickup + trip duration, or 8 hours for tours without a duration.

> **Team note:** a trip that is never marked completed never gets paid. When a supplier asks "where is my payout?", first check the trip reached `completed`.

---
For the tech team: `components/supplier/ManageFleetModal.jsx`, `DispatchQueue.jsx`, `SupplierBookingManager.jsx`, `pages/DriverTrip.jsx`, `services/driverDispatchService.js`, `dispatchWorkflowService.js`, `driverLocationService.js`. Rules: [`BUSINESS_RULES.md`](../BUSINESS_RULES.md) §6.
