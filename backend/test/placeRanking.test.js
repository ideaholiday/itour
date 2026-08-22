import test from "node:test";
import assert from "node:assert/strict";
import { rankSuggestions } from "../src/lib/placeRanking.js";

test("same-city hotel is promoted for an airport booking context", () => {
  const suggestions = [
    { id: "delhi", label: "Taj Palace", description: "New Delhi", lat: 28.595, lng: 77.17 },
    { id: "lucknow", label: "Taj Mahal Lucknow", description: "Gomti Nagar, Lucknow", lat: 26.851, lng: 80.997 },
    { id: "mumbai", label: "The Taj Mahal Palace", description: "Colaba, Mumbai", lat: 18.922, lng: 72.833 },
  ];

  const ranked = rankSuggestions(suggestions, {
    query: "Taj Hotel",
    context: "Chaudhary Charan Singh International Airport, Lucknow",
    lat: 26.7606,
    lng: 80.8893,
  });

  assert.equal(ranked[0].id, "lucknow");
});

test("provider order is unchanged without a location context", () => {
  const suggestions = [
    { id: "one", label: "First", description: "Delhi", lat: null, lng: null },
    { id: "two", label: "Second", description: "Lucknow", lat: null, lng: null },
  ];

  assert.deepEqual(rankSuggestions(suggestions, { query: "hotel" }), suggestions);
});

test("nearby result is promoted when suggestions include coordinates", () => {
  const suggestions = [
    { id: "far", label: "Taj Hotel", description: "Mumbai", lat: 18.922, lng: 72.833 },
    { id: "near", label: "Taj Hotel", description: "Gomti Nagar", lat: 26.851, lng: 80.997 },
  ];

  const ranked = rankSuggestions(suggestions, { query: "Taj Hotel", lat: 26.7606, lng: 80.8893 });
  assert.equal(ranked[0].id, "near");
});

test("booked package destination promotes its hotel before same-brand hotels in other cities", () => {
  const suggestions = [
    { id: "bengaluru", label: "BloomSuites Electronic City Out Gate", description: "Electronic City, Bengaluru, Karnataka", lat: null, lng: null },
    { id: "ahmedabad", label: "BloomSuites Ahmedabad", description: "Thaltej, Ahmedabad, Gujarat", lat: null, lng: null },
    { id: "goa", label: "BloomSuites Calangute", description: "Arpora, Bardez, Calangute, Goa", lat: null, lng: null },
    { id: "jalandhar", label: "Bloom Bites", description: "Jalandhar, Punjab", lat: null, lng: null },
  ];

  const ranked = rankSuggestions(suggestions, {
    query: "bloom suites",
    context: "Goa Airport (Mopa / Dabolim), Goa",
  });

  assert.equal(ranked[0].id, "goa");
  assert.equal(ranked[0].label, "BloomSuites Calangute");
});
