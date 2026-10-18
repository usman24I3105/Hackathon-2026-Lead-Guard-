# 5. Mandatory Third-Party Integrations

A business platform is only useful if it works with the services a company already uses. The solution must connect to real external services in their sandbox or test modes, not to fake or hard-coded stand-ins. Three integrations are mandatory (I1 to I3), and a team must choose one more (I4). Each external service has its own authentication scheme, event format, failure behavior and limits, and the solution must handle them correctly.

| ID | Integration | Provider (sandbox or test mode) | Business purpose |
| :--- | :--- | :--- | :--- |
| **I1** | **Messaging** | Twilio WhatsApp Sandbox (Twilio SMS is an accepted alternative) | Talk to customers and capture leads from incoming messages |
| **I2** | **Payments** | Stripe in test mode | Collect payments for opportunities and see their status on the customer record |
| **I3** | **Calendar** | Google Calendar through OAuth 2.0 | Book appointments with customers on employees' real calendars |
| **I4** | **Notifications**<br>*(choose one)* | Slack, Telegram bot, or transactional email (for example Resend, SendGrid or Mailgun) | Alert employees outside the application when a lead escalates |

---

## I1. Messaging

| ID | Requirement | Acceptance criteria |
| :--- | :--- | :--- |
| **I1.1** | **Receive messages** | A message sent from a real phone to the sandbox number reaches the platform through the provider's webhook and appears in a conversation view |
| **I1.2** | **Request authenticity** | Webhook requests are verified with the provider's signature mechanism; a forged or altered request is rejected and recorded |
| **I1.3** | **Send messages** | An employee replies from the platform and the customer receives it on their phone |
| **I1.4** | **Delivery status** | Sent, delivered and failed states from the provider's status callbacks are stored and shown on each message |
| **I1.5** | **Contact matching** | An incoming message from a known number attaches to the existing contact; from an unknown number it creates a contact and a lead (F3.1) |
| **I1.6** | **Ownership** | Each conversation shows its assigned employee and is visible only to users permitted to see it |
| **I1.7** | **Failure handling** | If the provider rejects a send or is unreachable, the message stays visible as failed with the reason, and the employee can retry; nothing is silently dropped |
| **I1.8** | **Duplicates** | A webhook delivered twice by the provider does not create two messages or two leads |
| **I1.9** | **Opt-out** | A contact marked as opted out cannot be messaged, and the interface explains why |

---

## I2. Payments

| ID | Requirement | Acceptance criteria |
| :--- | :--- | :--- |
| **I2.1** | **Create a payment request** | From an opportunity, an employee creates a payment link or checkout session for a stated amount and currency, and can send it to the customer |
| **I2.2** | **Payment confirmation by webhook** | Completing a test payment updates the opportunity's payment status in the platform without any manual refresh or action, driven by the provider's webhook |
| **I2.3** | **Request authenticity** | Payment webhooks are verified with the provider's signature mechanism before any record changes |
| **I2.4** | **Idempotent processing** | The same event received more than once records the payment once |
| **I2.5** | **Other outcomes** | Expired, abandoned and failed payments are shown with the correct status; a refund made in the provider's dashboard is reflected in the platform |
| **I2.6** | **Collected versus expected** | The platform distinguishes collected revenue from projected or unpaid amounts, and the dashboard (F5.1) uses collected revenue only for payments received |
| **I2.7** | **Traceability** | Each payment shows the opportunity, contact, employee who requested it and the provider's reference |
| **I2.8** | **No card data stored** | The platform never stores or logs card numbers; payment details are entered only on the provider's hosted page |

---

## I3. Calendar

| ID | Requirement | Acceptance criteria |
| :--- | :--- | :--- |
| **I3.1** | **Connect with consent** | An employee connects their own Google account through the OAuth 2.0 consent flow, and can disconnect it |
| **I3.2** | **Token handling** | Access tokens are refreshed automatically; tokens are stored only on the server; a revoked or expired connection is detected and shown as needing reconnection |
| **I3.3** | **Create appointments** | From an opportunity or contact, an employee books an appointment that appears in the employee's real Google Calendar and on the customer record |
| **I3.4** | **Avoid conflicts** | The booking screen reads the employee's busy times and prevents or warns about overlaps |
| **I3.5** | **Time zones** | Appointment times display correctly for the employee and are stored unambiguously, including across different time zones |
| **I3.6** | **Change and cancel** | Rescheduling or cancelling in the platform updates the Google event, and the change is recorded in the activity history |
| **I3.7** | **Availability link** | Calendar connection status is visible to Admins; an employee without a connected calendar cannot be booked and sees why |

---

## I4. Notifications (choose one provider)

| ID | Requirement | Acceptance criteria |
| :--- | :--- | :--- |
| **I4.1** | **Real delivery** | When a lead escalates (F3.5), the new owner receives a message on the chosen channel within the same minute |
| **I4.2** | **Useful content** | The alert names the lead, the source, the reason for escalation and a link that opens the lead |
| **I4.3** | **Per-user routing** | Each employee can configure their own destination (Slack user, Telegram chat or email address) |
| **I4.4** | **Failure handling** | A failed alert is recorded, retried a limited number of times and visible to Admins |

---

## I5. Requirements shared by every integration

| ID | Requirement | Acceptance criteria |
| :--- | :--- | :--- |
| **I5.1** | **Central integrations page** | One page lists each integration with its status (not connected, connected, error), when it last worked and its recent errors |
| **I5.2** | **Per-workspace configuration** | Each workspace supplies its own credentials or connection; one workspace's connection is never used by another |
| **I5.3** | **Secret handling** | API keys, tokens and signing secrets are never sent to the browser, never committed to the repository and never shown in full in the interface |
| **I5.4** | **Synchronization history** | Every inbound event and outbound call is recorded with time, result and a reference, and can be reviewed by authorized users |
| **I5.5** | **Resilience** | Temporary provider errors are retried with a delay; permanent errors are shown to a user with a plain explanation |
| **I5.6** | **Clearly stated limits** | The interface states what each integration can and cannot do (for example, that the messaging sandbox only reaches phones that have joined it) |
| **I5.7** | **Permission and audit** | Only users with the integration permission can connect, change or remove an integration, and each change is recorded in the audit history (F4.1) |
| **I5.8** | **Isolation of failures** | If one provider is unavailable, the rest of the platform keeps working |

---

## Provider constraints to plan for

These are the practical conditions of the chosen providers. Confirm them against each provider's current documentation, since they can change.

| Provider | What is needed | What to expect |
| :--- | :--- | :--- |
| **Twilio WhatsApp Sandbox** | A Twilio account and the sandbox number | A phone must first join the sandbox by sending the join phrase; sandbox messages are for testing only |
| **Stripe test mode** | A Stripe account in test mode, no business verification | Payments use published test card numbers; webhook secrets are issued per endpoint |
| **Google Calendar** | A Google Cloud project, enabled Calendar API and an OAuth consent screen | An app in testing status accepts only listed test users and may issue short-lived refresh tokens |
| **Slack, Telegram or email provider** | A free account or bot with its own token | Each has its own message format, rate limits and error codes |
| **All webhooks** | A publicly reachable HTTPS address | A local development setup needs a tunnel or a deployed address for providers to reach it |
