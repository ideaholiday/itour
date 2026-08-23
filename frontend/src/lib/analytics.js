/**
 * Google Tag Manager & Google Analytics 4 Telemetry Layer for Idea Holiday
 * Container ID: GTM-KV6P5HRR
 */

export const analytics = {
  // Push raw event to window.dataLayer
  pushEvent(eventName, eventData = {}) {
    if (typeof window === "undefined") return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      ...eventData,
      timestamp: new Date().toISOString(),
    });
  },

  // Track virtual pageview on React router navigation
  trackPageView(pathname, title = document.title) {
    this.pushEvent("page_view", {
      page_path: pathname,
      page_title: title,
      page_location: window.location.href,
    });
  },

  // E-Commerce: View Item List (Search & Category Pages)
  trackViewItemList(items = [], listName = "Search Results") {
    this.pushEvent("view_item_list", {
      ecommerce: {
        item_list_name: listName,
        items: items.slice(0, 10).map((item, index) => ({
          item_id: item.id,
          item_name: item.title,
          item_category: item.category || "Tour",
          item_category2: item.destination_name || item.city || "India",
          price: item.price_inr || item.base_fare || 0,
          currency: "INR",
          index: index + 1,
        })),
      },
    });
  },

  // E-Commerce: View Item (Product Detail Page)
  trackViewItem(product) {
    if (!product) return;
    this.pushEvent("view_item", {
      ecommerce: {
        currency: "INR",
        value: product.price_inr || product.base_fare || 0,
        items: [
          {
            item_id: product.id,
            item_name: product.title,
            item_category: product.category || "Tour",
            item_category2: product.destination_name || product.city || "India",
            price: product.price_inr || product.base_fare || 0,
            currency: "INR",
            quantity: 1,
          },
        ],
      },
    });
  },

  // E-Commerce: Begin Checkout
  trackBeginCheckout(product, totalAmount, guests = 1) {
    if (!product) return;
    this.pushEvent("begin_checkout", {
      ecommerce: {
        currency: "INR",
        value: totalAmount || product.price_inr || 0,
        items: [
          {
            item_id: product.id,
            item_name: product.title,
            item_category: product.category || "Tour",
            item_category2: product.destination_name || product.city || "India",
            price: product.price_inr || totalAmount || 0,
            quantity: guests,
          },
        ],
      },
    });
  },

  // E-Commerce: Purchase (Payment Complete)
  trackPurchase(bookingRef, product, totalAmount, paymentMethod = "CASHFREE") {
    this.pushEvent("purchase", {
      ecommerce: {
        transaction_id: bookingRef,
        value: totalAmount || (product ? product.price_inr : 0),
        currency: "INR",
        payment_type: paymentMethod,
        items: product
          ? [
              {
                item_id: product.id,
                item_name: product.title,
                item_category: product.category || "Tour",
                item_category2: product.destination_name || product.city || "India",
                price: totalAmount || product.price_inr || 0,
                quantity: 1,
              },
            ]
          : [],
      },
    });
  },

  // Custom User Engagement (Search, Filter, Supplier Click)
  trackSearch(query, destination = "") {
    this.pushEvent("search", {
      search_term: query,
      destination_filter: destination,
    });
  },

  // Cancellation
  trackCancellation(bookingRef, reason = "") {
    this.pushEvent("cancel_booking", {
      transaction_id: bookingRef,
      cancellation_reason: reason,
    });
  },

  // Refund Request
  trackRefundRequest(bookingRef, amount, reason = "") {
    this.pushEvent("refund_requested", {
      transaction_id: bookingRef,
      refund_amount: amount,
      currency: "INR",
      reason,
    });
  },

  // Supplier Profile View
  trackSupplierView(supplierId, supplierName = "") {
    this.pushEvent("view_supplier", {
      supplier_id: supplierId,
      supplier_name: supplierName,
    });
  },

  // Filter Applied
  trackFilterApplied(filterType, filterValue) {
    this.pushEvent("filter_applied", {
      filter_type: filterType,
      filter_value: filterValue,
    });
  },
};
