/**
 * Demo review generator — dev and demo databases only.
 *
 * A brand new marketplace demo shows empty review sections, which is why
 * "just give every listing 20 reviews" keeps coming up. Doing that in
 * production would be publishing fake reviews, so it is confined here:
 * every row is written with `source = 'SEED'`, and this module refuses to
 * run unless the database is explicitly marked as a demo one.
 *
 * Production cold start is handled instead by the smoothed rating in
 * reviewService (RATING_PRIOR_WEIGHT): a listing with no reviews ranks at the
 * category mean and simply shows no rating until a traveler leaves one.
 */
import { nanoid } from "nanoid";
import { recalculateQualityScores } from "../services/reviewService.js";

export const DEMO_REVIEWS_PER_PRODUCT = 20;

const COMMENTS = [
  ["Smooth pickup and a clean car", "Driver reached ten minutes early and the car was spotless. Smooth ride throughout."],
  ["Good value for the price", "Everything matched the listing. No surprises on the fare and the route was well planned."],
  ["Knowledgeable guide", "Our guide explained the history at every stop and never rushed us. Worth the money."],
  ["Comfortable for a family", "Travelled with two kids and a lot of luggage; the vehicle had plenty of room."],
  ["Well organised day", "Pickup, stops and the drop back to the hotel all ran to the times we were given."],
  ["Slightly late start", "Pickup was about twenty minutes late, but the driver made up the time and was polite about it."],
  ["Would book again", "Second time using this operator. Same standard as the first trip."],
  ["Clear communication", "Got a call the evening before with the driver details, which made the morning easy."],
];

const NAMES = [
  "Ananya Iyer", "Rahul Mehta", "Priya Nair", "Vikram Desai", "Sneha Kapoor", "Arjun Rao",
  "Meera Joshi", "Karan Malhotra", "Divya Pillai", "Rohan Gupta", "Aditi Sharma", "Sameer Khan",
  "Nisha Verma", "Tanvi Bose", "Harsh Patel", "Kavya Menon", "Imran Sheikh", "Pooja Reddy",
  "Siddharth Jain", "Ritu Chawla",
];

// Deterministic, so a reseed reproduces the same demo database.
function pseudoRandom(seed) {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) value = (value * 31 + seed.charCodeAt(index)) >>> 0;
  return () => {
    value = (value * 1103515245 + 12345) >>> 0;
    return value / 4294967296;
  };
}

function demoDate(offsetDays) {
  const date = new Date(Date.now() - offsetDays * 86400000);
  return date.toISOString().slice(0, 10);
}

/**
 * Writes completed demo bookings and the reviews on them for every published
 * product, then recalculates quality scores from the result.
 *
 * @param {object} db
 * @param {{ perProduct?: number, userId: string }} options
 * @returns {{ products: number, reviews: number }}
 */
export function seedDemoReviews(db, { perProduct = DEMO_REVIEWS_PER_PRODUCT, userId }) {
  if (process.env.NODE_ENV === "production") throw new Error("Demo reviews must never be seeded into production");
  if (process.env.ALLOW_DEMO_REVIEWS !== "true") throw new Error("Refusing to seed demo reviews because ALLOW_DEMO_REVIEWS is not enabled");

  const insertBooking = db.prepare(`
    INSERT INTO bookings (id, ref, user_id, product_id, supplier_id, product_type, activity_date,
      pickup_location, drop_location, adults, children, traveler_name, traveler_phone, traveler_email,
      amount_inr, payment_method, payment_status, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPI', 'PAID', 'completed')
  `);
  const insertReview = db.prepare(`
    INSERT INTO reviews (id, booking_id, user_id, product_id, supplier_id, experience_rating, supplier_rating,
      title, comment, tags, would_recommend, status, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 1, 'PUBLISHED', 'SEED', ?)
  `);

  const products = db.prepare("SELECT id, supplier_id, product_type, city, price_inr FROM products WHERE status = 'PUBLISHED'").all();
  let reviews = 0;

  const write = db.transaction(() => {
    for (const product of products) {
      const random = pseudoRandom(product.id);
      for (let index = 0; index < perProduct; index += 1) {
        // 4s and 5s with the occasional 3, which is roughly what a real
        // marketplace distribution looks like without being suspiciously perfect.
        const experience = random() < 0.12 ? 3 : (random() < 0.45 ? 4 : 5);
        const supplierRating = Math.max(3, Math.min(5, experience + (random() < 0.2 ? -1 : 0)));
        const [title, comment] = COMMENTS[Math.floor(random() * COMMENTS.length)];
        const name = NAMES[Math.floor(random() * NAMES.length)];
        const bookingId = `bk_seed_${product.id}_${index}`.slice(0, 60);
        const activityDate = demoDate(7 + index * 3);

        insertBooking.run(bookingId, `IH-SEED${nanoid(6).toUpperCase()}`, userId, product.id, product.supplier_id,
          product.product_type || "DAY_TOUR", activityDate,
          `${product.city || "City"} hotel pickup`, `${product.city || "City"} drop`, 2, 0, name,
          "+91980000" + String(1000 + index).slice(-4), `demo.traveler${index}@example.com`, product.price_inr || 999);

        insertReview.run(`rev_seed_${nanoid(10)}`, bookingId, userId, product.id, product.supplier_id,
          experience, supplierRating, title, comment, `${activityDate} 12:00:00`);
        reviews += 1;
      }
    }
  });
  write();

  for (const product of products) {
    recalculateQualityScores(db, { productId: product.id, supplierId: product.supplier_id });
  }

  return { products: products.length, reviews };
}
