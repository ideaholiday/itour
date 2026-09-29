# BREVO CAMPAIGN SETUP GUIDE
## Diwali Tour Operator Outreach - 2,500 Contacts

---

## 📋 QUICK OVERVIEW

You have **2 professional HTML email templates** ready for Brevo:

| **Template** | **Focus** | **Best For** | **Expected CTR** |
|---|---|---|---|
| **Campaign 1** | Sign up + Platform features | All 2,500 operators | 12-18% |
| **Campaign 2** | Revenue potential + Social proof | Engaged/warm leads | 15-22% |

---

## 🚀 STEP-BY-STEP SETUP IN BREVO

### **STEP 1: Login to Brevo**
1. Go to https://www.brevo.com
2. Log in to your account
3. Click **"Campaigns"** in left sidebar

### **STEP 2: Create New Email Campaign**
1. Click **"+ Create Campaign"** (top right)
2. Select **"Email Campaign"**
3. Choose **"Design Your Own"** (not a template)

### **STEP 3: Name Your Campaign**
```
Campaign Name: "Idea Holiday - Diwali Tour Operator Special"
Subject Line: "🎉 Double Your Revenue This Diwali (Offer Inside)"
```

**Alternative Subject Lines:**
- "Turn Your Tours Into ₹50L+ Annual Revenue"
- "4,200 Agents Waiting to Book Your Tours"
- "₹15,000 Diwali Savings + Free Forever Listings"
- "Tour Operators: Last Chance to Lock in Best Rates"

### **STEP 4: Import HTML Template**

**Option A: Copy-Paste HTML (Recommended)**
1. Click **"HTML" tab** in the editor
2. Open `brevo_diwali_campaign.html` in any text editor
3. Copy ALL the code
4. Paste into Brevo's HTML editor
5. Click **"Update Preview"**
6. Review the design

**Option B: Upload HTML File**
1. Some Brevo versions allow direct file upload
2. Look for **"Upload HTML"** button in editor
3. Select `brevo_diwali_campaign.html`

### **STEP 5: Customize Contact Info**
Before sending, update these placeholders in the HTML:

Find and replace:
```
info@ideaholiday.in → Your actual email
+919696777391 → Your actual phone
https://wa.me/919696777391 → Your actual WhatsApp link
```

**Search for these in HTML:**
- Line: `<a href="mailto:info@ideaholiday.in">`
- Line: `<a href="tel:+919696777391">`
- Line: `<a href="https://wa.me/919696777391">`

### **STEP 6: Add UTM Tracking (Important for Analytics)**

Find all links in the HTML that say:
```html
https://supply.ideaholiday.in?utm_source=brevo&utm_medium=email&utm_campaign=diwali_2026
```

Replace with:
```html
https://supply.ideaholiday.in?utm_source=brevo&utm_medium=email&utm_campaign=diwali_2026&utm_content=CAMPAIGN_NAME
```

Example:
- Campaign 1: `utm_content=sign_up_focus`
- Campaign 2: `utm_content=revenue_focus`

### **STEP 7: Select Recipients**

1. Click **"Recipients"** in left sidebar
2. Choose your contact list: **"2,500 Tour Operators (Nidhi Extract)"**
3. Click **"Select List"**

**If you need to segment:**
- **Tier 1 (Decision makers):** All 2,500 get Campaign 1
- **Tier 2 (Follow-up):** Send Campaign 2 after 3 days to non-openers

### **STEP 8: Set Send Time**

**Best Send Times for Indian Tour Operators:**
- **Day:** Tuesday or Wednesday
- **Time:** 10:30 AM IST (most responsive)
- Alternative: 6:00 PM IST (evening check)

In Brevo:
1. Click **"Send Settings"**
2. Choose **"Schedule Send"**
3. Select Date & Time
4. Or choose **"Send Immediately"** if urgent

### **STEP 9: Preview & Test**

**CRITICAL: Always test before sending to 2,500 people**

1. Click **"Preview"** button
2. Check:
   - ✅ All images load
   - ✅ Colors display correctly
   - ✅ Links work (click a few)
   - ✅ Contact info is correct
   - ✅ Mobile view looks good (check mobile preview)
   - ✅ No broken formatting

3. Send test email to yourself:
   - Click **"Send Test Email"**
   - Enter your email
   - Check spam folder
   - Verify opens, clicks work

### **STEP 10: Set Analytics & Tracking**

In **"Settings"** before sending:
```
✓ Track Email Opens
✓ Track Link Clicks
✓ Track Unsubscribes
✓ Add Google Analytics UTM (already in links)
```

### **STEP 11: SEND CAMPAIGN**

1. Final review of everything
2. Click **"SEND"** button
3. Brevo asks for confirmation: **"Yes, Send to 2,500 contacts"**
4. Wait 5 seconds for processing
5. You'll see: **"Campaign Sent Successfully"**

---

## 📊 EXPECTED RESULTS & METRICS

### **Typical Email Campaign Performance:**

| **Metric** | **Target** | **Benchmark** |
|---|---|---|
| **Delivery Rate** | 98%+ | 2,450+ emails delivered |
| **Open Rate** | 25-35% | 612-875 opens |
| **Click-Through Rate (CTR)** | 12-18% | 300-450 clicks to site |
| **Conversion Rate** | 2-4% | 60-180 signups |
| **Unsubscribe Rate** | <0.5% | <12 unsubscribes |

---

## 🎯 FOLLOW-UP SEQUENCE

**For Maximum Conversions, Use This Sequence:**

### **Day 1: Campaign 1 (Sign-Up Focus)**
- Send to all 2,500 operators
- Focus: Platform features, sign-up process
- Expected opens: 612-875

### **Day 3: Campaign 2 (Revenue Focus)**
- Segment: Non-openers from Day 1
- Focus: Revenue math, social proof
- Expected opens: 200-300 (from non-openers)

### **Day 5: Follow-Up Email**
```html
Subject: "Did You See? ₹50L+ Revenue Potential (Last Chance)"

<p>Hi [Name],

You might have missed our Diwali offer. Here's what you're about to lose:</p>

<p><strong>Offer Ends [DATE]</strong></p>

<p>✓ List tours for ₹999/year (normally ₹15,999)
✓ Lock 10 products FREE FOREVER
✓ Reach 4,200+ agents + 50K travelers
✓ Start earning within 24 hours</p>

<p>Don't wait. Supply shortages = higher prices for you.</p>

<p><a href="supply.ideaholiday.in">Sign Up Now</a></p>

— Idea Holiday Team
```

### **Day 7: Win-Back Email (If Still No Action)**
```html
Subject: "Last 48 Hours - Free Listings Expire"

<p>We're extending the Diwali offer for 48 more hours only.</p>

<p>After that, new suppliers pay ₹3,000/product/month.</p>

<p>Your move. <a href="supply.ideaholiday.in">List Now</a></p>

— Idea Holiday
```

---

## 📁 FILE LOCATIONS

Your HTML email templates are saved at:
```
/Users/jitendramaury/ToDoThingWithIdeaHoliday/brevo_diwali_campaign.html
/Users/jitendramaury/ToDoThingWithIdeaHoliday/brevo_diwali_revenue_focus.html
```

---

## ✅ PRE-SEND CHECKLIST

Before clicking "SEND" to 2,500 people:

- [ ] HTML template loaded correctly
- [ ] All images rendering
- [ ] Contact info updated (email, phone, WhatsApp)
- [ ] UTM parameters added
- [ ] Subject line written
- [ ] List selected (2,500 tour operators)
- [ ] Send time scheduled (Tue/Wed 10:30 AM IST)
- [ ] Test email sent to self
- [ ] Test email links work
- [ ] Mobile preview looks good
- [ ] No typos or broken text
- [ ] Footer unsubscribe link works
- [ ] Analytics tracking enabled
- [ ] Team reviewed before sending

---

## 🎨 TEMPLATE CUSTOMIZATION TIPS

### **Change Header Colors**
In HTML, find:
```html
<div class="header" style="background: linear-gradient(135deg, #0B2545 0%, #722F37 100%);">
```

Replace with your brand colors.

### **Change Company Info**
Find these sections:
```html
<!-- CONTACT SECTION -->
<!-- FOOTER SECTION -->
```

Update:
- Company name
- Email address
- Phone number
- WhatsApp link
- Physical office locations

### **Change CTA Button Text**
Find:
```html
<a href="https://supply.ideaholiday.in" class="btn btn-primary">👉 SIGN UP & START LISTING</a>
```

Keep simple: **"Sign Up"**, **"Get Started"**, **"Join Now"**

---

## 📞 CONTACT SUPPORT

If issues with Brevo:
1. **Brevo Help:** support@brevo.com
2. **Brevo Live Chat:** In your Brevo dashboard
3. **Common issues:**
   - HTML not rendering → Copy code again, check for special characters
   - Images not showing → Check absolute URLs (not relative paths)
   - Links not tracking → Enable "Track Clicks" in settings

---

## 💡 PRO TIPS FOR SUCCESS

1. **Send on Tuesday/Wednesday** — Best engagement
2. **10:30 AM IST** — Tour operators check email (post-morning planning)
3. **Keep subject under 50 characters** — Mobile inbox preview
4. **Use numbers in subject** — "₹50L+", "4,200+", "2,500" — gets 25% more opens
5. **Mobile-first design** — 70%+ will open on phone
6. **Test links** — Every CTA before sending
7. **Have backup plan** — If platform overloaded post-email, have sales team ready
8. **Track everything** — Brevo will show you opens, clicks, unsubscribes by contact

---

## 🎯 SUCCESS METRICS TO MONITOR

After sending, check Brevo dashboard for:
- **Total Delivered:** Should be 98%+ of 2,500
- **Unique Opens:** Track day-by-day (peaks around hour 2-4)
- **Top Clicked Links:** Which CTA performs best?
- **Unsubscribes:** Should be <0.5%
- **Bounce Rate:** Should be 0-2%

**Example Dashboard Check:**
```
Send Time: Tuesday 10:30 AM
Hour 1: 245 opens (10%)
Hour 2: 480 opens (19%) ← Peak
Hour 3: 320 opens (13%)
Hour 4: 210 opens (8%)
End of Day: 850 opens (34%)

Clicks: 250 (29% of opens = excellent)
Signups: 45 (18% of clicks = strong conversion)
```

---

## 🚀 NEXT STEPS

1. **Open Brevo:** https://www.brevo.com
2. **Create Campaign** → "Email Campaign" → "Design Your Own"
3. **Copy-Paste HTML** from brevo_diwali_campaign.html
4. **Customize** contact info & UTM parameters
5. **Select List:** 2,500 tour operators
6. **Send Test** to yourself
7. **Schedule Send:** Tuesday 10:30 AM IST
8. **Monitor Analytics:** Track opens, clicks, conversions
9. **Day 3: Send Campaign 2** to non-openers
10. **Day 5-7:** Send win-back emails

---

## 📧 SUBJECT LINE VARIATIONS TO A/B TEST

If Brevo allows A/B testing:

**Variation A (Revenue Focused):**
```
🎉 Double Your Revenue This Diwali (Offer Inside)
```

**Variation B (Urgency Focused):**
```
⏰ Last Chance: ₹15,000 Diwali Savings Expires Soon
```

**Variation C (Curiosity Focused):**
```
How 300+ Tour Operators Earn ₹50L+ Annually (Let's Show You)
```

Brevo will automatically send each variant to ~833 contacts and report which performs best.

---

## 💪 YOU'RE READY!

Your 2,500 tour operator outreach is professional, branded, and ready to convert.

Expected outcome:
- ✅ 850-1,000 opens
- ✅ 250-400 clicks
- ✅ 60-180 new supplier signups
- ✅ Foundation for ₹100K+ USD partnership expansion

**Good luck! 🚀**

Questions? Reply to this message or check Brevo's help center.
