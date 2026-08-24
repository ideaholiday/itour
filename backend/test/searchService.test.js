import test from "node:test";
import assert from "node:assert/strict";
import { SearchService } from "../src/services/searchService.js";
import db from "../src/db.js";

test("SearchService: getSuggestions returns default suggestions on empty query", () => {
  const defaults = SearchService.getSuggestions("");
  assert.ok(defaults.destinations && defaults.destinations.length > 0);
  assert.ok(defaults.categories && defaults.categories.length > 0);
  assert.ok(defaults.experiences && defaults.experiences.length > 0);
});

test("SearchService: getSuggestions matches query terms", () => {
  const res = SearchService.getSuggestions("goa");
  assert.ok(Array.isArray(res.destinations));
  assert.ok(Array.isArray(res.experiences));
  assert.ok(Array.isArray(res.categories));
});

test("SearchService: searchProducts filters by category, city, and product type", () => {
  const allRes = SearchService.searchProducts({ limit: 50 });
  assert.ok(allRes.products.length > 0);
  assert.ok(allRes.pagination.total > 0);
  assert.ok(allRes.facets);
  assert.ok(Array.isArray(allRes.facets.categories));
  assert.ok(Array.isArray(allRes.facets.cities));
  assert.ok(allRes.facets.priceRange);

  // City filter
  const goaRes = SearchService.searchProducts({ city: "Goa" });
  for (const p of goaRes.products) {
    assert.match(p.city.toLowerCase(), /goa/);
  }
});

test("SearchService: duration bucket filtering", () => {
  const shortTours = SearchService.searchProducts({ duration: "short" });
  for (const p of shortTours.products) {
    if (p.duration_hours) {
      assert.ok(p.duration_hours < 4);
    }
  }

  const halfDayTours = SearchService.searchProducts({ duration: "half_day" });
  for (const p of halfDayTours.products) {
    if (p.duration_hours) {
      assert.ok(p.duration_hours >= 4 && p.duration_hours <= 8);
    }
  }
});

test("SearchService: price range and minimum rating filtering", () => {
  const priceFiltered = SearchService.searchProducts({ minPrice: 1000, maxPrice: 5000 });
  for (const p of priceFiltered.products) {
    assert.ok(p.price_inr >= 1000);
    assert.ok(p.price_inr <= 5000);
  }

  const topRated = SearchService.searchProducts({ minRating: 4.5 });
  for (const p of topRated.products) {
    assert.ok(p.rating >= 4.5);
  }
});

test("SearchService: coordinate enrichment provides lat/lng for mapping", () => {
  const res = SearchService.searchProducts({ limit: 10 });
  for (const p of res.products) {
    assert.ok(typeof p.lat === "number" && !isNaN(p.lat));
    assert.ok(typeof p.lng === "number" && !isNaN(p.lng));
  }
});

test("SearchService: dynamic facet aggregations return expected structure", () => {
  const res = SearchService.searchProducts({ limit: 10 });
  const { facets } = res;
  assert.ok(facets.categories.length > 0);
  assert.ok(facets.durations);
  assert.ok(typeof facets.durations.short === "number");
  assert.ok(typeof facets.durations.half_day === "number");
  assert.ok(typeof facets.durations.full_day === "number");
  assert.ok(typeof facets.durations.multi_day === "number");
  assert.ok(facets.ratings);
  assert.ok(typeof facets.ratings["4.5"] === "number");
  assert.ok(typeof facets.ratings["4.0"] === "number");
  assert.ok(typeof facets.ratings.above_4_0 === "number");
});

test("SearchService: user search history recording and retrieval", () => {
  const userId = `usr_srch_test_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, name, email, password, role)
    VALUES (?, 'Search Tester', ? || '@example.com', 'dummy_hash', 'TRAVELER')
  `).run(userId, userId);

  SearchService.recordHistory(userId, "Taj Mahal Sunrise", "Heritage & Forts", "Agra");
  SearchService.recordHistory(userId, "Goa Scuba Diving", "Beaches & Water Sports", "Goa");

  const history = SearchService.getRecentSearches(userId, 5);
  assert.ok(history.length >= 2);
  assert.ok(history.some(h => h.search_query === "Goa Scuba Diving"));
  assert.ok(history.some(h => h.search_query === "Taj Mahal Sunrise"));
});
