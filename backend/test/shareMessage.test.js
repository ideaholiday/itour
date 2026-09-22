import test from "node:test";
import assert from "node:assert/strict";
import { shareMessage, shareUrl, whatsappShareUrl } from "../../shared/shareMessage.js";

const ACTIVITY = { title: "Grande Island Scuba Dive", city: "Goa", priceInr: 2999, rating: 4.5, reviewCount: 4, url: "https://ideaholiday.in/activity/Grande-Island-Scuba-Dive/p_scuba" };
const LINK = "https://ideaholiday.in/activity/Grande-Island-Scuba-Dive/p_scuba?utm_source=whatsapp&utm_medium=share";

test("shared links are tagged as WhatsApp shares and keep their own query", () => {
  assert.equal(shareUrl(ACTIVITY.url), LINK);
  assert.equal(shareUrl("https://ideaholiday.in/blog?page=2"), "https://ideaholiday.in/blog?page=2&utm_source=whatsapp&utm_medium=share");
});

test("activity messages carry price and rating in English or Hindi, and never invent them", () => {
  assert.equal(shareMessage("activity", ACTIVITY), `Check out Grande Island Scuba Dive in Goa on Idea Holiday — from ₹2,999, ★ 4.5 (4 reviews).\n${LINK}`);
  assert.equal(shareMessage("activity", ACTIVITY, "hi"), `Idea Holiday पर Goa में Grande Island Scuba Dive देखें — ₹2,999 से, ★ 4.5 (4 समीक्षाएँ)।\n${LINK}`);
  const bare = shareMessage("activity", { ...ACTIVITY, priceInr: 0, rating: null, reviewCount: 0 });
  assert.equal(bare, `Check out Grande Island Scuba Dive in Goa on Idea Holiday.\n${LINK}`);
  assert.equal(shareMessage("activity", { ...ACTIVITY, rating: 4.5, reviewCount: 0 }).includes("★"), false, "no rating without reviews");
  assert.match(shareMessage("activity", { ...ACTIVITY, reviewCount: 1 }), /\(1 review\)/);
});

test("city and blog messages; the Hindi city message links to the Hindi page it is given", () => {
  const city = { name: "Goa", productCount: 35, fromPriceInr: 499 };
  assert.match(shareMessage("city", { ...city, url: "https://ideaholiday.in/things-to-do/goa" }), /^Things to do in Goa: 35 experiences from ₹499 on Idea Holiday\.\nhttps:\/\/ideaholiday.in\/things-to-do\/goa\?utm_source=whatsapp/);
  assert.match(shareMessage("city", { ...city, url: "https://ideaholiday.in/hi/things-to-do/goa" }, "hi"), /^Goa में करने लायक चीज़ें: Idea Holiday पर 35 अनुभव, ₹499 से।\nhttps:\/\/ideaholiday.in\/hi\/things-to-do\/goa/);
  assert.match(shareMessage("city", { name: "Agra", productCount: 0, url: "https://ideaholiday.in/things-to-do/agra" }), /^Things to do in Agra on Idea Holiday\./);
  assert.match(shareMessage("blog", { title: "Kedarnath Yatra Guide", url: "https://ideaholiday.in/blog/kedarnath" }), /^Kedarnath Yatra Guide — a travel guide from Idea Holiday\./);
  assert.match(shareMessage("blog", { title: "Kedarnath Yatra Guide", url: "https://ideaholiday.in/blog/kedarnath" }, "hi"), /Idea Holiday की ट्रैवल गाइड।/);
});

test("the WhatsApp link carries the whole message, encoded", () => {
  const url = whatsappShareUrl("Goa & more — ₹499\nhttps://ideaholiday.in/x?a=1&b=2");
  assert.ok(url.startsWith("https://wa.me/?text="));
  assert.equal(decodeURIComponent(url.slice("https://wa.me/?text=".length)), "Goa & more — ₹499\nhttps://ideaholiday.in/x?a=1&b=2");
});
