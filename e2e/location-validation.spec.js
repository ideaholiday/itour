import { expect, test } from "@playwright/test";

const mopaProduct = "transfer-goa-mopa-north-goa";

test("Mopa transfer API rejects Delhi with a service-area suggestion", async ({ request }) => {
  const response = await request.post("/api/transfers/quote", {
    data: {
      productId: mopaProduct,
      pickupLat: 15.7533,
      pickupLng: 73.8658,
      dropLat: 28.5562,
      dropLng: 77.1,
      pickupAddress: "Mopa Airport (GOX)",
      dropAddress: "Delhi Airport",
      passengers: 2,
      luggage: 2,
      selectedVehicle: "SEDAN",
      flight_number: "AI 103",
      flight_arrival_time: "09:30",
    },
  });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.code).toBe("INVALID_DROP_POINT");
  expect(body.detail.suggestion).toMatch(/North Goa/i);
});

test("Mopa transfer accepts Calangute and requires flight information", async ({ request }) => {
  const route = {
    productId: mopaProduct,
    pickupLat: 15.7533,
    pickupLng: 73.8658,
    dropLat: 15.545,
    dropLng: 73.7523,
    pickupAddress: "Mopa Airport (GOX)",
    dropAddress: "Calangute hotel",
    passengers: 2,
    luggage: 2,
    selectedVehicle: "SEDAN",
  };
  const missingFlight = await request.post("/api/transfers/quote", { data: route });
  expect(missingFlight.status()).toBe(400);
  expect((await missingFlight.json()).code).toBe("INVALID_BOOKING_PARAMS");

  const accepted = await request.post("/api/transfers/quote", {
    data: { ...route, flight_number: "6E-421", flight_arrival_time: "23:15" },
  });
  expect(accepted.status()).toBe(200);
  const body = await accepted.json();
  expect(body.success).toBe(true);
  expect(body.selectedQuote.costBreakdown.totalAmount).toBeGreaterThan(0);
});
