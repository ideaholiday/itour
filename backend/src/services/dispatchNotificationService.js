import { sendRecipientChannels } from './notificationService.js';
import { whatsAppTemplate } from './whatsappService.js';
import { driverTripUrl } from './dispatchWorkflowService.js';
import { guestDocumentLinks } from './guestDocumentService.js';
import { trackingUrl } from './tripTrackingService.js';
import { issueBookingInvite } from './reviewInviteService.js';
import logger from '../config/logger.js';

// Dispatch WhatsApp templates. Each body is the exact text submitted to Meta as a
// UTILITY template under `name`; `params` lists the {{n}} values in order and
// `example` is the sample Meta reviews. The wording follows the account's approved
// templates (fixed opening, "Label: value."), since shorter styles were rejected, and
// no variable carries the message's purpose: Meta rejects free-text "Update: {{n}}"
// lines as INCORRECT_CATEGORY. The headline lives in the email instead.
// `reused` templates were already approved on the account; dispatch sends them with
// their approved variables because new driver-detail templates kept being rejected.
// Dispatch uses its own names so existing approved templates keep their variable counts.
export const DISPATCH_WHATSAPP_TEMPLATES = Object.freeze({
  DRIVER_REQUEST: {
    env: 'WHATSAPP_TEMPLATE_DISPATCH_DRIVER_REQUEST',
    name: 'idea_holiday_dispatch_driver_request',
    audience: 'Driver',
    purpose: 'New trip request; driver must accept or decline',
    params: ['Booking ref', 'Tour', 'Pickup date and time', 'Pickup location', 'Passengers', 'Vehicle and plate', 'Respond by', 'Private trip link'],
    example: ['IH-7K2M9Q', 'Lucknow City Tour with Zoo', 'Thu 10 Sep 2026, 09:00 IST', 'Hotel Clarks Awadh, Hazratganj', '3', 'Swift Dzire Sedan, UP-32-AB-1234', '9 Sep, 14:30 IST', 'https://ideaholiday.in/driver/trip'],
    body: 'Idea Holiday has sent you a trip request for booking {{1}}. Service: {{2}}. Scheduled pickup: {{3}}. Pickup location: {{4}}. Passengers: {{5}}. Assigned vehicle: {{6}}. Please accept or decline before {{7}} using your private trip page: {{8}}. Traveler contact details are shared after you accept.',
  },
  DRIVER_TRIP: {
    env: 'WHATSAPP_TEMPLATE_DISPATCH_DRIVER_TRIP',
    name: 'idea_holiday_driver_trip',
    reused: true,
    audience: 'Driver',
    purpose: 'Trip confirmed, 24-hour reminder and 2-hour pickup reminder (the trip link is in the driver request and email)',
    params: ['Booking ref', 'Traveler name', 'Traveler phone', 'Pickup date and time', 'Pickup location', 'Drop location', 'Vehicle registration'],
    example: ['IH-7K2M9Q', 'Anita Sharma', '+919811111111', 'Thu 10 Sep 2026, 09:00 IST', 'Hotel Clarks Awadh, Hazratganj', 'Lucknow Zoo', 'UP-32-AB-1234'],
    body: 'You have been assigned an Idea Holiday trip. Booking reference: {{1}}. Traveler name: {{2}}. Traveler phone: {{3}}. Scheduled pickup: {{4}}. Pickup location: {{5}}. Drop location: {{6}}. Assigned vehicle registration: {{7}}. Confirm the traveler identity and follow the dispatch instructions in your portal.',
  },
  DRIVER_CANCELLED: {
    env: 'WHATSAPP_TEMPLATE_DISPATCH_DRIVER_CANCELLED',
    name: 'idea_holiday_dispatch_driver_cancelled',
    audience: 'Driver',
    purpose: 'Driver removed from a trip',
    params: ['Booking ref', 'Pickup date and time', 'Reason'],
    example: ['IH-7K2M9Q', 'Thu 10 Sep 2026, 09:00 IST', 'Booking cancelled'],
    body: 'Your assignment for Idea Holiday booking {{1}} scheduled for {{2}} has been cancelled. Reason: {{3}}. Please do not operate this trip or use the previous trip link, and contact your supplier with any questions.',
  },
  TRAVELER_DRIVER: {
    env: 'WHATSAPP_TEMPLATE_DISPATCH_TRAVELER_DRIVER',
    name: 'idea_holiday_driver_details',
    reused: true,
    audience: 'Traveler',
    purpose: 'Driver confirmed and 24-hour reminder with driver details',
    params: ['Booking ref', 'Driver name', 'Driver phone', 'Vehicle model', 'Vehicle registration', 'Pickup date and time', 'Pickup location', 'Voucher link'],
    example: ['IH-7K2M9Q', 'Ravi Kumar', '+919876543210', 'Swift Dzire Sedan', 'UP-32-AB-1234', 'Thu 10 Sep 2026, 09:00 IST', 'Hotel Clarks Awadh, Hazratganj', 'https://ideaholiday.in/bookings'],
    body: 'Idea Holiday has updated the transport service details for your existing booking {{1}}. Your assigned driver is {{2}} and can be contacted at {{3}}. The confirmed vehicle is a {{4}} with registration {{5}}. The scheduled pickup time is {{6}} from {{7}}. View the booking voucher at {{8}}. This message only confirms details already associated with your booking.',
  },
  TRAVELER_PENDING: {
    env: 'WHATSAPP_TEMPLATE_DISPATCH_TRAVELER_PENDING',
    name: 'idea_holiday_dispatch_traveler_pending',
    audience: 'Traveler',
    purpose: '24-hour reminder while the driver is not yet confirmed',
    params: ['Booking ref', 'Tour', 'Pickup date and time', 'Pickup location'],
    example: ['IH-7K2M9Q', 'Lucknow City Tour with Zoo', 'Thu 10 Sep 2026, 09:00 IST', 'Hotel Clarks Awadh, Hazratganj'],
    body: 'This is a reminder for your existing Idea Holiday booking {{1}}. Service: {{2}}. Scheduled pickup: {{3}} from {{4}}. Driver confirmation is still in progress and our operations team is following up. Driver and vehicle details will be sent as soon as they are confirmed.',
  },
  TRIP_STATUS: {
    env: 'WHATSAPP_TEMPLATE_DISPATCH_TRIP_STATUS',
    name: 'idea_holiday_dispatch_trip_status',
    audience: 'Traveler, Supplier',
    purpose: 'Driver on the way, arrived, trip started, completed; driver confirmed (supplier)',
    params: ['Booking ref', 'Tour', 'Status', 'Detail'],
    example: ['IH-7K2M9Q', 'Lucknow City Tour with Zoo', 'Your driver has arrived', 'Check number plate UP-32-AB-1234 before you share your pickup OTP'],
    body: 'There is a service update for your Idea Holiday booking {{1}}. Service: {{2}}. Current status: {{3}}. Additional information: {{4}}. Contact support@ideaholiday.in if you need help with this booking.',
  },
  OPS_ALERT: {
    env: 'WHATSAPP_TEMPLATE_DISPATCH_OPS_ALERT',
    name: 'idea_holiday_dispatch_ops_alert',
    audience: 'Supplier, Operations',
    purpose: 'Driver must be assigned manually',
    params: ['Booking ref', 'Tour', 'Pickup date and time', 'Pickup location', 'Reason', 'Dashboard link'],
    example: ['IH-7K2M9Q', 'Lucknow City Tour with Zoo', 'Thu 10 Sep 2026, 09:00 IST', 'Hotel Clarks Awadh, Hazratganj', 'Driver declined; replacement required', 'https://ideaholiday.in/supplier/bookings'],
    body: 'Idea Holiday booking {{1}} needs a driver assignment. Service: {{2}}. Scheduled pickup: {{3}}. Pickup location: {{4}}. Reason: {{5}}. Assign a driver using this link: {{6}}. The traveler is updated automatically after a driver accepts.',
  },
});

const missingTemplates = new Set();
function dispatchTemplate(key, values) {
  const spec = DISPATCH_WHATSAPP_TEMPLATES[key];
  if (values.length !== spec.params.length) throw new Error(`${key} template needs ${spec.params.length} values, got ${values.length}`);
  const name = process.env[spec.env];
  if (!String(name || '').trim()) {
    // Free text still reaches people who messaged us in the last 24 hours, but Meta
    // drops it for everyone else, so an unset template is a delivery risk.
    if (!missingTemplates.has(spec.env)) {
      missingTemplates.add(spec.env);
      logger.warn('Dispatch WhatsApp template is not configured; sending free text, which Meta only delivers inside a 24-hour customer window', { env: spec.env });
    }
    return undefined;
  }
  return whatsAppTemplate(name, values);
}

const appUrl = () => String(process.env.PUBLIC_APP_URL || 'https://ideaholiday.in').replace(/\/$/, '');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatPickup(booking) {
  const [y, m, d] = String(booking.activity_date || '').split('-').map(Number);
  if (![y, m, d].every(Number.isFinite)) return `${booking.activity_date || 'Date TBC'} ${booking.pickup_time || ''}`.trim();
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}, ${booking.pickup_time || 'time TBC'} IST`;
}

function formatIst(iso) {
  const ist = new Date(Date.parse(iso) + 330 * 60000);
  if (Number.isNaN(ist.getTime())) return 'the response deadline';
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}, ${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')} IST`;
}

// "today" / "tomorrow" relative to India time, otherwise the date.
export function pickupDayWord(booking, now = new Date()) {
  const today = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 330 * 60000 + 86400000).toISOString().slice(0, 10);
  if (booking.activity_date === today) return 'today';
  if (booking.activity_date === tomorrow) return 'tomorrow';
  return `on ${booking.activity_date}`;
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function composeDispatchEmail({ greeting, intro, rows = [], action, notes = [] }) {
  const visibleRows = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
  const text = [
    greeting, '', intro, '',
    ...visibleRows.map(([label, value]) => `${label}: ${value}`),
    ...(action ? ['', `${action.label}: ${action.url}`] : []),
    ...(notes.length ? ['', ...notes] : []),
    '', 'Idea Holiday · support@ideaholiday.in',
  ].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1c1917">
  <p style="font-size:13px;font-weight:bold;color:#b45309;margin:0 0 12px">Idea Holiday</p>
  <p style="margin:0 0 8px">${escapeHtml(greeting)}</p>
  <p style="margin:0 0 16px">${escapeHtml(intro)}</p>
  <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e7e5e4;border-radius:8px">
    ${visibleRows.map(([label, value]) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #f5f5f4;color:#78716c;width:38%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #f5f5f4;font-weight:bold">${escapeHtml(value)}</td></tr>`).join('\n    ')}
  </table>
  ${action ? `<p style="margin:20px 0"><a href="${escapeHtml(action.url)}" style="background:#1c1917;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(action.label)}</a></p>` : ''}
  ${notes.map(note => `<p style="margin:0 0 8px;font-size:13px;color:#57534e">${escapeHtml(note)}</p>`).join('\n  ')}
  <p style="margin:24px 0 0;font-size:12px;color:#a8a29e">Idea Holiday · support@ideaholiday.in</p>
</div>`;
  return { text, html };
}

function safeDriverTripUrl(assignment) {
  try { return assignment?.revision ? driverTripUrl(assignment) : null; }
  catch { return null; }
}

// Who hears about what. Operations are alerted only when action is needed;
// routine trip progress is visible on the ops board instead of messaging every staff user.
export function buildDispatchMessages(db, job, { now = new Date() } = {}) {
  const booking = db.prepare(`SELECT b.*, p.title AS product_title, s.email AS supplier_email, s.phone AS supplier_phone,
    s.contact_name AS supplier_name FROM bookings b LEFT JOIN products p ON p.id = b.product_id LEFT JOIN suppliers s ON s.id = b.supplier_id WHERE b.id = ?`).get(job.booking_id);
  if (!booking) return [];
  const assignment = db.prepare('SELECT * FROM driver_assignments WHERE booking_id = ?').get(job.booking_id);
  const payload = JSON.parse(job.payload || '{}');
  const event = job.event_type;
  const tour = booking.product_title || booking.product_type || 'your trip';
  const pickupAt = formatPickup(booking);
  const location = booking.pickup_location || 'pickup point on your voucher';
  const passengers = Number(booking.adults || 0) + Number(booking.children || 0);
  const accepted = assignment?.acknowledgement === 'ACCEPTED' && assignment.assignment_status !== 'CANCELLED';
  const vehicle = assignment ? `${assignment.vehicle_model}, ${assignment.vehicle_number}` : null;
  const tripUrl = safeDriverTripUrl(assignment);
  const tripLink = tripUrl || 'ask your supplier for the trip page';
  const voucherUrl = () => {
    try { return guestDocumentLinks(booking).voucherUrl; }
    catch { return `${appUrl()}/bookings`; }
  };
  const tripRows = [['Booking', booking.ref], ['Tour', tour], ['Pickup', pickupAt], ['Pickup location', location], ['Drop-off', booking.drop_location], ['Passengers', passengers]];
  const driverRows = accepted ? [['Driver', assignment.driver_name], ['Driver phone', assignment.driver_phone], ['Vehicle', vehicle]] : [];

  const traveler = { id: booking.user_id, role: 'TRAVELER', name: booking.traveler_name, email: booking.traveler_email, phone: booking.traveler_phone };
  const driver = { role: 'DRIVER', name: assignment?.driver_name, email: assignment?.driver_email, phone: assignment?.driver_phone };
  const supplier = { id: booking.supplier_id, role: 'SUPPLIER', name: booking.supplier_name, email: booking.supplier_email, phone: booking.supplier_phone };
  const hello = name => `Hello ${name || 'there'},`;
  const messages = [];
  const add = (recipient, subject, email, template) => messages.push({ recipient, subject, ...composeDispatchEmail(email), template });

  const travelerDriverMessage = (headline, subject) => add(traveler, subject, {
    greeting: hello(traveler.name),
    intro: `${headline} for ${tour}.`,
    rows: [...tripRows, ...driverRows],
    action: { label: 'View booking and pickup OTP', url: `${appUrl()}/bookings` },
    notes: ['Check the vehicle number plate before you share your pickup OTP with the driver.'],
  }, dispatchTemplate('TRAVELER_DRIVER', [booking.ref, assignment.driver_name, assignment.driver_phone, assignment.vehicle_model, assignment.vehicle_number, pickupAt, location, voucherUrl()]));

  const driverTripMessage = (headline, subject) => add(driver, subject, {
    greeting: hello(driver.name),
    intro: `${headline}.`,
    rows: [...tripRows, ['Traveler', booking.traveler_name], ['Traveler phone', booking.traveler_phone], ['Vehicle', vehicle]],
    action: tripUrl ? { label: 'Open trip page', url: tripUrl } : null,
    notes: ['Ask for the pickup OTP only when you meet the traveler. Contact your supplier if anything changes.'],
  }, dispatchTemplate('DRIVER_TRIP', [booking.ref, booking.traveler_name || 'Traveler', booking.traveler_phone || 'See trip page', pickupAt, location, booking.drop_location || 'As per booking', assignment.vehicle_number]));

  const statusMessage = (recipient, status, detail, action) => add(recipient, `Trip ${booking.ref}: ${status.toLowerCase()}`, {
    greeting: hello(recipient.name), intro: `${status}. ${detail}`, rows: [...tripRows, ...driverRows], action,
  }, dispatchTemplate('TRIP_STATUS', [booking.ref, tour, status, detail.replace(/\.+$/, '')]));

  if (event === 'DRIVER_REQUEST') {
    add(driver, `New trip request ${booking.ref}: ${tour}, ${pickupAt}`, {
      greeting: hello(driver.name),
      intro: `You have a new Idea Holiday trip request. Please accept or decline before ${formatIst(assignment.response_deadline)}.`,
      rows: [...tripRows, ['Vehicle', vehicle]],
      action: tripUrl ? { label: 'Accept or decline', url: tripUrl } : null,
      notes: ['Traveler contact details appear after you accept. Do not share this link.'],
    }, dispatchTemplate('DRIVER_REQUEST', [booking.ref, tour, pickupAt, location, passengers, vehicle, formatIst(assignment.response_deadline), tripLink]));
  } else if (event === 'DRIVER_REQUEST_REMINDER') {
    const deadline = formatIst(assignment.response_deadline);
    add(driver, `Reminder: accept or decline trip ${booking.ref} before ${deadline}`, {
      greeting: hello(driver.name),
      intro: `You have not answered this Idea Holiday trip request yet. Please accept or decline before ${deadline}, or it will be offered to another driver.`,
      rows: [...tripRows, ['Vehicle', vehicle]],
      action: tripUrl ? { label: 'Accept or decline', url: tripUrl } : null,
    }, dispatchTemplate('DRIVER_REQUEST', [booking.ref, tour, pickupAt, location, passengers, vehicle, deadline, tripLink]));
  } else if (['TRIP_OVERDUE', 'TRIP_OVERDUE_OPS', 'PICKUP_NOT_STARTED'].includes(event)) {
    const reason = payload.reason || 'Trip needs attention';
    const opsLink = { label: 'Open operations tasks', url: `${appUrl()}/ops/tasks` };
    if (event === 'TRIP_OVERDUE') {
      statusMessage(driver, 'Trip still open', `Please mark the service complete on your trip page${tripUrl ? `: ${tripUrl}` : ''}, or call your supplier if the trip is still running.`, tripUrl ? { label: 'Open trip page', url: tripUrl } : null);
      statusMessage(supplier, 'Trip completion overdue', `${reason}. Ask ${assignment.driver_name} to complete the trip; your payout is scheduled only after completion.`, { label: 'Open bookings', url: `${appUrl()}/supplier/bookings` });
    } else {
      statusMessage(supplier, event === 'PICKUP_NOT_STARTED' ? 'Pickup not started' : 'Trip completion overdue', `${reason}. Contact ${assignment.driver_name} (${assignment.driver_phone}) now.`, { label: 'Open bookings', url: `${appUrl()}/supplier/bookings` });
      for (const staff of db.prepare("SELECT id, name, email, phone, role FROM users WHERE UPPER(role) IN ('ADMIN','STAFF')").all()) {
        statusMessage({ ...staff, role: String(staff.role).toUpperCase() }, event === 'PICKUP_NOT_STARTED' ? 'Pickup not started' : 'Trip completion overdue', `${reason}. Driver ${assignment.driver_name} (${assignment.driver_phone}); supplier ${booking.supplier_name || ''} (${booking.supplier_phone || 'no phone'}).`, opsLink);
      }
    }
  } else if (event === 'DRIVER_LOCATION_RISK') {
    // From 30 minutes before pickup: not on the way, signal lost, running late or not moving.
    const reason = payload.reason || 'Driver may miss the pickup';
    statusMessage(supplier, 'Driver may miss the pickup', `${reason}. Call ${assignment.driver_name} (${assignment.driver_phone}) now.`, { label: 'Open bookings', url: `${appUrl()}/supplier/bookings` });
    for (const staff of db.prepare("SELECT id, name, email, phone, role FROM users WHERE UPPER(role) IN ('ADMIN','STAFF')").all()) {
      statusMessage({ ...staff, role: String(staff.role).toUpperCase() }, 'Driver may miss the pickup', `${reason}. Driver ${assignment.driver_name} (${assignment.driver_phone}); supplier ${booking.supplier_name || ''} ${booking.supplier_phone || ''}`.trim(), { label: 'Open live trip board', url: `${appUrl()}/ops/live` });
    }
    if (/location/i.test(reason) && tripUrl) {
      statusMessage(driver, 'Live location stopped', `Open your trip page and keep it on screen so the traveler can see you: ${tripUrl}`, { label: 'Open trip page', url: tripUrl });
    }
  } else if (event === 'DRIVER_AUTO_ASSIGNED') {
    // The supplier learns which of its drivers was requested, so it can step in before the deadline.
    statusMessage(supplier, 'Driver auto-assigned', `${assignment.driver_name} (${vehicle}) was sent the trip request and must accept by ${formatIst(assignment.response_deadline)}.`, { label: 'Open bookings', url: `${appUrl()}/supplier/bookings` });
  } else if (event === 'DRIVER_CONFIRMED') {
    travelerDriverMessage('Your driver is confirmed', `Driver confirmed for ${tour} (${booking.ref})`);
    driverTripMessage('Trip confirmed', `Trip confirmed ${booking.ref}: ${pickupAt}`);
    statusMessage(supplier, 'Driver confirmed', `${assignment.driver_name} accepted in ${vehicle}.`, { label: 'Open bookings', url: `${appUrl()}/supplier/bookings` });
  } else if (event === 'PRE_TRIP_REMINDER') {
    const day = pickupDayWord(booking, now);
    const subject = `Trip Reminder: Your ${tour} is ${day} (${booking.ref})`;
    if (accepted) {
      travelerDriverMessage(`Your trip is ${day}`, subject);
      driverTripMessage(`Reminder: your trip is ${day}`, `Trip reminder ${booking.ref}: ${pickupAt}`);
    } else {
      add(traveler, subject, {
        greeting: hello(traveler.name),
        intro: `Your ${tour} trip is ${day}. Your driver confirmation is still pending; our team is following up and will send the driver and vehicle details as soon as they are confirmed.`,
        rows: tripRows,
        action: { label: 'View booking', url: `${appUrl()}/bookings` },
      }, dispatchTemplate('TRAVELER_PENDING', [booking.ref, tour, pickupAt, location]));
    }
  } else if (event === 'DRIVER_PICKUP_REMINDER') {
    driverTripMessage('Pickup in about 2 hours. Tap On the way when you leave', `Pickup in 2 hours: ${booking.ref}`);
  } else if (event === 'DRIVER_REMOVED') {
    const removed = { role: 'DRIVER', name: payload.driver_name, email: payload.driver_email, phone: payload.driver_phone };
    const reason = payload.reason || 'Assignment changed';
    add(removed, `Trip ${booking.ref} cancelled for you`, {
      greeting: hello(removed.name),
      intro: `Your assignment for this trip is cancelled. Reason: ${reason}. Do not operate this trip or use the previous trip link.`,
      rows: [['Booking', booking.ref], ['Tour', tour], ['Pickup', pickupAt]],
    }, dispatchTemplate('DRIVER_CANCELLED', [booking.ref, pickupAt, reason]));
  } else if (event === 'ASSIGNMENT_REQUIRED') {
    const reason = payload.reason || 'Driver assignment required';
    const alert = (recipient, url) => add(recipient, `Action required: assign a driver for ${booking.ref}`, {
      greeting: hello(recipient.name), intro: `A driver must be assigned manually. Reason: ${reason}.`, rows: tripRows,
      action: { label: 'Assign a driver', url }, notes: ['The traveler is updated automatically once a driver accepts.'],
    }, dispatchTemplate('OPS_ALERT', [booking.ref, tour, pickupAt, location, reason, url]));
    alert(supplier, `${appUrl()}/supplier/bookings`);
    for (const staff of db.prepare("SELECT id, name, email, phone, role FROM users WHERE UPPER(role) IN ('ADMIN','STAFF')").all()) alert({ ...staff, role: String(staff.role).toUpperCase() }, `${appUrl()}/ops/tasks`);
  } else if (event.startsWith('DISPATCH_')) {
    const bookingsLink = { label: 'View booking', url: `${appUrl()}/bookings` };
    const supplierLink = { label: 'Open bookings', url: `${appUrl()}/supplier/bookings` };
    const driverName = assignment?.driver_name || 'Your driver';
    // The traveler follows the driver live for the whole trip (ADR 012).
    const trackLink = { label: 'Track your driver live', url: trackingUrl(booking, now.getTime()) };
    if (event === 'DISPATCH_EN_ROUTE') statusMessage(traveler, 'Your driver is on the way', `${driverName} is heading to ${location} in ${vehicle}. Track live: ${trackLink.url}`, trackLink);
    if (event === 'DISPATCH_ARRIVED') statusMessage(traveler, 'Your driver has arrived', `Check number plate ${assignment?.vehicle_number} before you share your pickup OTP.`, bookingsLink);
    if (event === 'DISPATCH_TRIP_STARTED') {
      statusMessage(traveler, 'Your trip has started', `Pickup is verified. Have a wonderful trip. Follow your trip live: ${trackLink.url}`, trackLink);
      statusMessage(supplier, 'Service started', `${driverName} verified the traveler pickup OTP.`, supplierLink);
    }
    if (event === 'DISPATCH_COMPLETED') {
      // Rating link first, report link second. A one-tap invite when one can be issued; a retried job
      // (live invite already out) or a booking that already has a review falls back to My Reviews.
      const ref = encodeURIComponent(booking.ref);
      let reviewUrl = `${appUrl()}/my-reviews?bookingRef=${ref}`;
      try { reviewUrl = issueBookingInvite(db, { bookingId: booking.id, channel: 'EMAIL' }).url || reviewUrl; }
      catch (error) { logger.warn('Review invite not issued at trip completion', { bookingId: booking.id, error: error.message }); }
      const reportUrl = `${appUrl()}/bookings?report=${ref}`;
      statusMessage(traveler, 'Your trip is complete', `Thank you for travelling with Idea Holiday. Rate your trip: ${reviewUrl} Had a problem? Report it before the operator is paid: ${reportUrl}`, { label: 'Rate your trip', url: reviewUrl });
      statusMessage(supplier, 'Service completed', `${driverName} marked the service as completed.`, supplierLink);
    }
  }
  return messages;
}

export async function deliverDispatchNotification(db, job, { send = sendRecipientChannels, now = new Date() } = {}) {
  const booking = db.prepare('SELECT id, ref FROM bookings WHERE id = ?').get(job.booking_id);
  const results = [];
  const seen = new Set();
  for (const { recipient, subject, text, html, template } of buildDispatchMessages(db, job, { now })) {
    const key = `${recipient.role}:${recipient.email}:${recipient.phone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(...await send({ database: db, eventType: job.event_type, eventKeyPrefix: `${job.id}:${recipient.role}`, recipient,
      subject, emailText: text, emailHtml: html, whatsappText: text, whatsappTemplate: template,
      metadata: { bookingId: booking.id, bookingRef: booking.ref, revision: job.revision } }));
  }
  return { results };
}
