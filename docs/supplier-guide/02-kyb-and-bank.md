# 2. KYB and bank details

> **Summary:** How a supplier gets business-verified (KYB), which documents count, how Cashfree checks can approve a supplier automatically, and how to set the payout bank account.
> **Read when:** a supplier is stuck on PENDING or REJECTED, asks what to upload, or asks why payouts haven't started.

[Back to the guide](README.md)

Everything here is in the **Compliance** tab.

## 2.1 Why KYB matters

- **Before approval:** the supplier can build listings, but travelers can't book them. The profile is public but hidden from Google.
- **After approval:** every **published** listing becomes bookable at once (subject to the subscription, [chapter 7](07-profile-sharekit-plans.md#75-subscription)). The profile can appear on Google.
- **Payouts need approval:** no money is paid out while KYB is not APPROVED.
- **KYB is not the Verified badge.** KYB is the free, basic check. "Verified" is a separate yearly check with a badge ([chapter 7](07-profile-sharekit-plans.md#74-verified-badge-and-spotlight)).

## 2.2 KYB statuses

| Status | Meaning | Can take bookings? |
| :--- | :--- | :--- |
| **PENDING** | Just signed up, or still under review | No |
| **APPROVED** | Verified business | Yes |
| **REJECTED** | Documents not accepted. Admin must give a reason. | No |
| **SUSPENDED** | Stopped by Idea Holiday | No. Existing public profile is hidden and the Verified badge is removed. |

## 2.3 Two ways to get approved

### Way A: Automatic, with Cashfree (fastest)

The supplier approves automatically, with no admin click, when **all** of these are true:
1. KYB status is **PENDING**.
2. A **GSTIN** and a **PAN** are saved in "Tax & Business Credentials".
3. Both were checked with Cashfree and came back valid.
4. **The PAN matches the GSTIN.** Characters 3 to 12 of a GSTIN are the PAN. A GSTIN registered to a different PAN fails.

How the supplier does it:
1. Compliance → **Tax & Business Credentials** → enter GSTIN (15 characters) and PAN (10 characters) → **Save Details**.
2. Press **Verify GSTIN** and **Verify PAN**, or **Verify All** to also test the bank account.
3. When both pass, the screen confirms and the supplier gets an approval message: "Your GSTIN and PAN were verified with Cashfree SecureID. Your published listings can now be booked."

> **Team note:** automatic approval only works from PENDING. A REJECTED supplier who fixes their GSTIN must be approved by an admin.

### Way B: Admin review of documents

An admin can approve once **both** of these files are uploaded:
- **Commercial Transport License / Permit**
- **PAN Card**

Without both files, the admin screen refuses to approve, unless Way A's Cashfree checks already passed.

Other document types the supplier can upload (helpful, not required for approval): GSTIN Certificate, Cancelled Cheque / Bank Passbook, Tourism Department Registration, Other Identity / Trade Document.

**Upload rules:** PDF, JPEG, PNG or WebP, max **5 MB** each. Choose the document category, optionally add the certificate number, then **Upload & Submit**. Documents can be removed and re-uploaded. KYB files are private and never shown publicly.

> **Known gap:** approval without Cashfree always requires a *transport* licence, even for an attraction or activity business that doesn't need one. If such a supplier has no GSTIN, there is currently no way to approve them. Raise it with the owner before promising a date.

## 2.4 Tax & Business Credentials

| Field | Rule |
| :--- | :--- |
| GSTIN | Optional, but needed for automatic approval. Exactly 15 characters, e.g. `22AAAAA0000A1Z5`. |
| PAN | Required for payouts. Exactly 10 characters, e.g. `AAAAA0000A`. |
| Business structure | Private Limited, Sole Proprietorship, Partnership, LLP, or Individual / Tour Leader |
| Years operating, website | Optional |

## 2.5 Payout bank account

Compliance → **Payout Bank Destination**. This is where trip earnings are paid.

| Field | Rule |
| :--- | :--- |
| Account holder name | Should be the business name |
| Bank name | Required |
| Account type | Current or Savings |
| Account number | Typed twice. Both entries must match. |
| IFSC | Exactly 11 characters, e.g. `HDFC0001234` |
| UPI ID | Optional |

After saving, press **Penny Drop Test** (or Verify All). Cashfree checks that the account exists and returns the account holder's name as the bank has it. The screen then shows the bank name and account holder.

The Compliance header shows a readiness score: **Fully Compliant**, **Partially Verified**, or **Action Required**, from three checks: PAN verified, payout bank verified, GSTIN on file.

> **Tell the supplier:**
> - "Enter your GSTIN and PAN and press **Verify All**. If they match, you're approved in seconds."
> - "Use a bank account in your **business name**. It's also required for the Verified badge later."
> - "If you change your bank account, run the Penny Drop Test again."

> **Team note:** the portal masks the account number (last 4 digits only). Never ask a supplier to send bank details, PAN or documents over WhatsApp or email. Everything goes through the Compliance tab.

## 2.6 Common problems

| Problem | Likely cause | Fix |
| :--- | :--- | :--- |
| "GSTIN is not registered to this PAN" | The PAN typed is a partner's personal PAN, not the business PAN | Enter the PAN that is inside the GSTIN |
| Verified GSTIN and PAN but still PENDING | Checks were run while the status was REJECTED, or one check failed | Look at each line in "Business verification"; ask an admin to review |
| "File size exceeds 5MB limit" | Phone photo too large | Compress, or save as PDF |
| Approved, but payouts not arriving | Bank not entered or not verified | Fill in Payout Bank Destination and run the Penny Drop Test |

---
For the tech team: `components/supplier/SupplierCompliancePanel.jsx`, `services/supplierVerificationService.js` (`REQUIRED_KYB_DOCUMENTS`, `getCashfreeIdentityStatus`), routes `/api/suppliers/:id/kyb/*` and `/payout`. Rules: ADR 009.
