/** Loads the Cashfree checkout SDK once and resolves with `window.Cashfree`. */
export function loadCashfreeSdk() {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Cashfree) {
      resolve(window.Cashfree);
      return;
    }
    const existing = document.getElementById("cashfree-js-sdk");
    if (existing) {
      if (typeof window !== "undefined" && window.Cashfree) {
        resolve(window.Cashfree);
        return;
      }
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (typeof window !== "undefined" && window.Cashfree) {
          clearInterval(interval);
          resolve(window.Cashfree);
        } else if (attempts > 40) {
          clearInterval(interval);
          existing.remove();
          loadCashfreeSdk().then(resolve).catch(reject);
        }
      }, 50);
      return;
    }
    const script = document.createElement("script");
    script.id = "cashfree-js-sdk";
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.onload = () => {
      if (typeof window !== "undefined" && window.Cashfree) {
        resolve(window.Cashfree);
      } else {
        reject(new Error("Cashfree SDK loaded but not initialized"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load Cashfree payment gateway SDK"));
    document.body.appendChild(script);
  });
}
