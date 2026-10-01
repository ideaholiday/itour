import assert from "node:assert/strict";
import test from "node:test";
import { catalogCity, destinationParam, featuredDestinations, popularDestinations, withImageList } from "./destinations.js";

test("a city abroad links by name; an Indian city by its id", () => {
  assert.equal(destinationParam({ id: "city_th_bangkok", name: "Bangkok", country: "Thailand" }), "Bangkok");
  assert.equal(destinationParam({ id: "goa", name: "Goa", country: "India" }), "goa");
  assert.equal(destinationParam({ id: "goa", name: "Goa" }), "goa");
});

test("home features the busiest live cities, then curated ones", () => {
  const catalog = [
    { id: "agartala", name: "Agartala", hero_image: "generic.jpg" },
    { id: "city_th_bangkok", name: "Bangkok", country: "Thailand", hero_image: "bangkok.jpg", tagline: "Temples" },
    { id: "goa", name: "Goa", hero_image: "generic.jpg" },
  ];
  const curated = [{ id: "goa", name: "Goa", hero_image: "goa.jpg", tagline: "Sun" }, { id: "agra", name: "Agra", hero_image: "agra.jpg" }];
  const featured = featuredDestinations(catalog, [{ name: "Bangkok", count: 4 }, { name: "goa", count: 2 }, { name: "Lucknow", count: 1 }], curated, 4);
  assert.deepEqual(featured.map((d) => d.name), ["Bangkok", "Goa", "Lucknow", "Agra"], "no catalogue city without products");
  assert.equal(featured[0].hero_image, "bangkok.jpg");
  assert.equal(featured[1].hero_image, "goa.jpg", "the curated photo beats the generic one");
  assert.equal(featured[2].hero_image, "goa.jpg", "a city outside the catalogue still gets a photo");
  assert.deepEqual(featuredDestinations(catalog, undefined, curated).map((d) => d.name), ["Goa", "Agra"]);
});

test("popular destinations keep the curated order, count live products and add other live cities", () => {
  const curated = [
    { id: "dubai", name: "Dubai", country: "UAE" },
    { id: "goa", name: "Goa" },
    { id: "thailand", name: "Thailand", kind: "country" },
  ];
  const catalog = [{ id: "lucknow", name: "Lucknow", state: "Uttar Pradesh", country: "India" }];
  const list = popularDestinations(curated, catalog, [{ name: "Lucknow", count: 7 }, { name: "goa ", count: 3 }], [{ name: "Thailand", count: 5 }]);
  assert.deepEqual(list.map((d) => [d.name, d.count, d.abroad]), [
    ["Dubai", 0, true],
    ["Goa", 3, false],
    ["Thailand", 5, true],
    ["Lucknow", 7, false],
  ]);
  assert.equal(list[3].tagline, "Uttar Pradesh");
  assert.deepEqual(popularDestinations(curated, undefined, undefined, undefined).map((d) => d.count), [0, 0, 0]);
});

test("a search result's images string becomes a list", () => {
  assert.deepEqual(withImageList({ id: "p", images: '["a.jpg"]' }).images, ["a.jpg"]);
  assert.deepEqual(withImageList({ id: "p", images: "not json" }).images, []);
  assert.deepEqual(withImageList({ id: "p", images: ["b.jpg"] }).images, ["b.jpg"]);
});

test("a product city matches its catalogue city by name or id; a typo matches nothing", () => {
  const cities = [
    { id: "gorakhpur", name: "Gorakhpur", state: "Uttar Pradesh", country: "India", listing_open: true },
    { id: "city_cn_beijing", name: "Beijing", state: "Beijing", country: "China", listing_open: false },
  ];
  assert.equal(catalogCity(cities, " gorakhpur ").state, "Uttar Pradesh");
  assert.equal(catalogCity(cities, "GORAKHPUR").name, "Gorakhpur");
  assert.equal(catalogCity(cities, "Gorahpur"), null);
  assert.equal(catalogCity(cities, "Beijing"), null);
  assert.equal(catalogCity(cities, ""), null);
});
