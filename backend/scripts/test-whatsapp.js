import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import { sendWhatsAppMessage, sendWhatsAppVoucher, whatsAppProviderConfiguration, whatsAppTemplate } from "../src/services/whatsappService.js";

const targetPhone = process.argv[2] || "9696777391";

console.log("==================================================");
console.log("Idea Holiday WhatsApp Cloud API Test Utility");
console.log("Target Phone:", targetPhone);
console.log("Config:", JSON.stringify(whatsAppProviderConfiguration(), null, 2));
console.log("==================================================");

async function run() {
  console.log("\n[1/3] Testing Template 'idea_holiday_ops_alert'...");
  const alertTemplate = whatsAppTemplate(
    process.env.WHATSAPP_TEMPLATE_OPS_ALERT || "idea_holiday_ops_alert",
    ["IH-TEST-9696", "WhatsApp Cloud API verification test successful"]
  );
  const alertRes = await sendWhatsAppMessage({
    to: targetPhone,
    recipientName: "Jitendra Maurya",
    recipientRole: "STAFF",
    eventType: "OPS_ALERT",
    eventKey: `SCRIPT_ALERT_${Date.now()}`,
    template: alertTemplate,
  });
  console.log("Alert Result:", JSON.stringify(alertRes, null, 2));

  console.log("\n[2/3] Testing Template 'hello_world'...");
  const hwRes = await sendWhatsAppMessage({
    to: targetPhone,
    recipientName: "Jitendra Maurya",
    recipientRole: "STAFF",
    eventType: "HELLO_WORLD_TEST",
    eventKey: `SCRIPT_HW_${Date.now()}`,
    template: { name: "hello_world", languageCode: "en_US" },
  });
  console.log("Hello World Result:", JSON.stringify(hwRes, null, 2));

  console.log("\n[3/3] Testing Voucher Dispatch 'idea_holiday_driver_details'...");
  const voucherRes = await sendWhatsAppVoucher({
    bookingRef: "IH-WA-TEST",
    customerName: "Jitendra Maurya",
    customerPhone: targetPhone,
    driverName: "Ramesh Kumar Yadav",
    driverPhone: "+919839011223",
    vehicleModel: "Toyota Innova Crysta",
    vehicleNumber: "UP-32-DN-4821",
    pickupLocation: "Chaudhary Charan Singh Airport Lucknow (LKO)",
    pickupTime: "10:30 AM",
  });
  console.log("Voucher Result:", JSON.stringify(voucherRes, null, 2));

  console.log("\n==================================================");
  const allSuccess = alertRes.success && hwRes.success && voucherRes.success;
  console.log("Final Outcome:", allSuccess ? "✅ ALL TESTS PASSED" : "❌ SOME TESTS FAILED");
  console.log("==================================================");
  process.exit(allSuccess ? 0 : 1);
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
