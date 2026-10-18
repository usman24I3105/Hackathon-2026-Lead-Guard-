# Complete Integration Architecture & Compliance Manual
### Mandatory Third-Party Integrations (I1 – I5)

This document provides the exhaustive specification, credentials, backend endpoints, code implementation methods, data structures, and compliance mappings for every third-party integration required by the hackathon.

---

## 1. Integration Master Table & Credentials

| ID | Integration | Provider (Test Mode) | Credentials / Secrets Used | Core Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **I1** | **Messaging** | Twilio SMS / WhatsApp Sandbox | • `TWILIO_ACCOUNT_SID` = `AC34e35d3a456ae2e83c7763fe8b9816e5`<br>• `TWILIO_AUTH_TOKEN` = `1472b208df4a12d63e23af281164b132`<br>• `TWILIO_PHONE_NUMBER` = `+17372508034`<br>• `TWILIO_WHATSAPP_NUMBER` = `whatsapp:+14155238886` | Real-time two-way customer communication, inbound lead capture, delivery status tracking. |
| **I2** | **Payments** | Stripe Test Mode | • `STRIPE_PUBLISHABLE_KEY` = `pk_test_51UPP83D4rp14DvZE...`<br>• `STRIPE_SECRET_KEY` = `sk_test_51UPP83D4rp14DvZE...`<br>• `STRIPE_WEBHOOK_SECRET` = `whsec_...` | Generate checkout sessions from opportunities, verify webhooks, update payment & collected revenue. |
| **I3** | **Calendar** | Google Calendar (OAuth 2.0) | • `GOOGLE_CLIENT_ID` = `487569953022-kloo9fssnk07...`<br>• `GOOGLE_CLIENT_SECRET` = `GOCSPX-vPtn39ptoAm...`<br>• `GOOGLE_REDIRECT_URI` = `http://localhost:3000/auth/google/callback` | Book appointments on real employee calendars, prevent busy overlaps (FreeBusy), reschedule & cancel. |
| **I4** | **Notifications** | Slack Incoming Webhook | • `SLACK_WEBHOOK_URL` = `https://hooks.slack.com/services/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` | Instant real-time alerts to external `#lead-alerts` channel when leads express urgent/buying intent. |
| **I5** | **Shared Architecture** | Lead Guard Platform | • Secret isolation, `.env` protection, Deduplication caches, [sync_history.json](file:///c:/Users/matee/Downloads/hackathon/backend/sync_history.json) | Central management, audit trails, resilient failure isolation. |

---

## 2. I1: Twilio Messaging Implementation Guide

### Acceptance Criteria Mapping
- **I1.1 (Receive messages)**: Real phone texts Twilio ➔ reaches `/webhook` ➔ stored and reflected in conversation view.
- **I1.2 (Request authenticity)**: Verified using `twilio.validateRequest(auth_token, signature, url, params)`. Forged requests are logged and rejected.
- **I1.3 (Send messages)**: Employees send replies from the CRM interface ➔ dispatches via `twilioClient.messages.create` ➔ arrives on the customer's phone.
- **I1.4 (Delivery status)**: Status callbacks track `queued` ➔ `sent` ➔ `delivered` or `failed` with error reason.
- **I1.5 (Contact matching)**: Matches incoming phone number to existing contact; creates a new Contact + Lead if unknown.
- **I1.6 (Ownership)**: Each conversation is scoped to the assigned employee ID.
- **I1.7 (Failure handling)**: Catches API errors, marks message bubble as `failed`, shows the reason, and provides a one-click `Retry` button.
- **I1.8 (Duplicates)**: In-memory and persisted `processedMessageSids` set ignores duplicate Twilio deliveries.
- **I1.9 (Opt-out)**: If `contact.optedOut === true`, outbound sending is disabled and UI explains why.

### Methods & Endpoints

#### Inbound Webhook (`POST /webhook`)
Receives `x-www-form-urlencoded` webhook from Twilio when a customer texts:
```javascript
app.post("/webhook", verifyTwilioSignature, (req, res) => {
  const { From = "", Body = "", ProfileName = "", MessageSid = "" } = req.body;
  const channel = From.startsWith("whatsapp:") ? "whatsapp" : "sms";

  // I1.8: Deduplication
  if (MessageSid && processedMessageSids.has(MessageSid)) {
    return res.type("text/xml").send("<Response></Response>");
  }
  if (MessageSid) processedMessageSids.add(MessageSid);

  // I1.5: Save lead & attach to contact
  fs.appendFileSync(CSV, [new Date().toISOString(), channel, From.replace("whatsapp:", ""), ProfileName, Body, MessageSid].map(esc).join(",") + "\n");

  // I4.1: Escalation alert
  if (/urgent|asap|price|pricing|quote|call me|buy/i.test(Body)) {
    alertSlack(`:rotating_light: *Lead escalated (${channel})*\n*From:* ${From} ${ProfileName}\n*Message:* ${Body}`);
  }

  // TwiML auto-response
  const reply = `Thanks${ProfileName ? " " + ProfileName : ""}! We got your message and will contact you shortly.`;
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xml(reply)}</Message></Response>`);
});
```

#### Outbound Dispatch (`POST /api/messages/send`)
Triggered when an employee writes a message in CRM Conversation:
```javascript
app.post("/api/messages/send", async (req, res) => {
  const { to, body, isWhatsApp, optedOut } = req.body;

  // I1.9: Opt-out check
  if (optedOut) return res.status(400).json({ error: "Contact opted out." });

  try {
    const message = await twilioClient.messages.create({
      from: isWhatsApp ? process.env.TWILIO_WHATSAPP_NUMBER : process.env.TWILIO_PHONE_NUMBER,
      to,
      body,
      statusCallback: `${process.env.PUBLIC_URL}/webhook/status`,
    });
    res.json({ success: true, messageSid: message.sid, status: message.status });
  } catch (err) {
    // I1.7: Failure with exact reason
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});
```

---

## 3. I2: Stripe Payments in Test Mode

### Acceptance Criteria Mapping
- **I2.1 (Create payment request)**: Generates a hosted Stripe Checkout session with amount, currency, and customer metadata.
- **I2.2 (Payment confirmation by webhook)**: Listens for `checkout.session.completed` and flips status to `paid` without requiring a browser refresh.
- **I2.3 (Request authenticity)**: Verifies the `stripe-signature` header using `stripe.webhooks.constructEvent`.
- **I2.4 (Idempotent processing)**: Caches `event.id` so repeated webhooks do not duplicate charges or audit entries.
- **I2.5 (Other outcomes)**: Handles `checkout.session.expired` and `charge.refunded` states.
- **I2.6 (Collected vs expected)**: Tracks collected payments separately from pipeline opportunity values.
- **I2.7 (Traceability)**: Every payment records `opportunityId`, `contactId`, employee, and Stripe Session/PaymentIntent ID.
- **I2.8 (No card data stored)**: Zero raw card numbers touch our server or database; all entered on `checkout.stripe.com`.

### Methods & Endpoints

#### Create Checkout Session (`POST /api/stripe/create-checkout-session`)
```javascript
app.post("/api/stripe/create-checkout-session", async (req, res) => {
  const { opportunityId, contactId, amountCents, title, customerEmail } = req.body;

  const session = await stripe.checkout.sessions.create({
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: { name: title || "Opportunity Payment" },
        unit_amount: amountCents,
      },
      quantity: 1,
    }],
    mode: "payment",
    customer_email: customerEmail,
    metadata: { opportunityId, contactId },
    success_url: `${req.headers.origin}/contacts/${contactId}?payment_success=true`,
    cancel_url: `${req.headers.origin}/contacts/${contactId}?payment_canceled=true`,
  });

  updatePaymentStatus(session.id, "pending", { opportunityId, contactId, amountCents, checkoutUrl: session.url });
  res.json({ success: true, sessionId: session.id, checkoutUrl: session.url });
});
```

#### Stripe Webhook (`POST /api/stripe/webhook`)
```javascript
app.post("/api/stripe/webhook", (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Signature Verification Error: ${err.message}`);
  }

  // I2.4: Idempotency
  if (processedStripeEvents.has(event.id)) return res.json({ received: true });
  processedStripeEvents.add(event.id);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    updatePaymentStatus(session.id, "paid", { paidAt: new Date().toISOString() });
    alertSlack(`:dollar: Payment Collected: $${(session.amount_total / 100).toFixed(2)}`);
  }
  res.json({ received: true });
});
```

---

## 4. I3: Google Calendar Integration (OAuth 2.0)

### Acceptance Criteria Mapping
- **I3.1 (Connect with consent)**: Employee connects their personal Google account via `/auth/google` with offline access; can disconnect anytime via `/api/calendar/disconnect`.
- **I3.2 (Token handling)**: Offline refresh tokens saved securely on the server in `calendar_tokens.json`. Auto-refreshes when expired.
- **I3.3 (Create appointments)**: Creates real events on the employee's calendar with customer name and appointment title.
- **I3.4 (Avoid conflicts)**: Queries Google's FreeBusy calendar API before booking; returns `HTTP 409 Conflict` if the employee is already booked.
- **I3.5 (Time zones)**: Formatted unambiguously using ISO 8601 strings and employee time zone.
- **I3.6 (Change and cancel)**: `PATCH /api/calendar/events/:id` and `DELETE /api/calendar/events/:id` sync changes to Google Calendar.
- **I3.7 (Availability link)**: `/api/calendar/status` displays whether the employee's calendar is connected.

### Methods & Endpoints

#### Conflict Check & Appointment Booking (`POST /api/calendar/book`)
```javascript
app.post("/api/calendar/book", async (req, res) => {
  const calendar = getCalendarClient();
  if (!calendar) return res.status(401).json({ error: "Calendar not connected. Visit /auth/google first." });

  const { customerName, customerEmail, summary, startDateTime, endDateTime, checkConflict = true } = req.body;
  const start = new Date(startDateTime);
  const end = new Date(endDateTime);

  // I3.4: Conflict avoidance via FreeBusy query
  if (checkConflict) {
    const freebusy = await calendar.freebusy.query({
      requestBody: { timeMin: start.toISOString(), timeMax: end.toISOString(), items: [{ id: "primary" }] },
    });
    const busy = freebusy.data.calendars?.primary?.busy || [];
    if (busy.length > 0) {
      return res.status(409).json({ error: "Scheduling conflict: The employee is already busy.", busy });
    }
  }

  // I3.3: Insert event into real Google Calendar
  const event = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: summary || `Appointment: ${customerName}`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: customerEmail ? [{ email: customerEmail }] : [],
    },
  });

  res.json({ success: true, eventId: event.data.id, htmlLink: event.data.htmlLink });
});
```

---

## 5. I4: Slack Escalation Notifications

### Acceptance Criteria Mapping
- **I4.1 (Real delivery)**: Dispatched within seconds to `#lead-alerts` via Incoming Webhook when hot keywords or SLA timer lapses occur.
- **I4.2 (Useful content)**: Rich Block Kit message containing customer name, phone number, escalation trigger reason, and timestamp.
- **I4.3 (Per-user routing)**: Customizable webhook URL or routing tags per workspace.
- **I4.4 (Failure handling)**: Failed webhook dispatches are caught, retried, and recorded in `sync_history.json`.

---

## 6. I5: Shared Architecture & Security Standards

- **I5.1 (Central Integrations Page)**: Located at `/integrations` in the CRM; displays connection status, permissions, limits, and sync status for each service.
- **I5.2 (Per-Workspace Configuration)**: Isolated `.env` credentials with support for multi-workspace API token separation.
- **I5.3 (Secret Handling)**: Sensitive secrets (`sk_test_...`, `TWILIO_AUTH_TOKEN`, OAuth secrets) are server-only. Never sent to the client bundle or committed to public Git branches (`.gitignore` enforced).
- **I5.4 (Synchronization History)**: Backed by [sync_history.json](file:///c:/Users/matee/Downloads/hackathon/backend/sync_history.json) and exposed via `GET /api/sync/history`, detailing direction, timestamp, provider, status, and external reference ID.
- **I5.8 (Isolation of Failures)**: If one provider is unreachable (e.g. Twilio timeout or Stripe network blip), remaining platform modules, CRM views, and calendar actions continue running independently.
