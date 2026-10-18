// Lead-capture webhook + Slack Escalation + Google Calendar OAuth 2.0 integration
require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded data

// ----------------- LEADS CSV SETUP -----------------
const CSV = "leads.csv";
if (!fs.existsSync(CSV)) {
  fs.writeFileSync(CSV, "timestamp,channel,from,name,message,message_sid\n");
}

const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const xml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Escalation: post a Slack alert when a message looks like a hot lead.
const ESCALATE = /urgent|asap|price|pricing|quote|call me|buy|order|demo|complaint/i;

async function alertSlack(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return console.warn("SLACK_WEBHOOK_URL not set; skipping alert");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    console.log(`Slack alert dispatched, status: ${res.status}`);
  } catch (e) {
    console.error("Slack alert failed:", e.message);
  }
}

// ----------------- TWILIO INBOUND WEBHOOK -----------------
app.post("/webhook", (req, res) => {
  const { From = "", Body = "", ProfileName = "", MessageSid = "" } = req.body;
  const channel = From.startsWith("whatsapp:") ? "whatsapp" : "sms";

  fs.appendFileSync(
    CSV,
    [new Date().toISOString(), channel, From.replace("whatsapp:", ""), ProfileName, Body, MessageSid]
      .map(esc)
      .join(",") + "\n"
  );
  console.log(`Lead saved from ${From}: ${Body}`);

  if (ESCALATE.test(Body)) {
    alertSlack(`:rotating_light: *Lead escalated (${channel})*\n*From:* ${From.replace("whatsapp:", "")} ${ProfileName}\n*Message:* ${Body}`);
  }

  const reply = `Thanks${ProfileName ? " " + ProfileName : ""}! We got your message and will contact you shortly.`;
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xml(reply)}</Message></Response>`);
});

// ----------------- GOOGLE CALENDAR OAUTH 2.0 -----------------
const TOKENS_PATH = path.join(__dirname, "calendar_tokens.json");

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback"
  );
}

// 1. Employee starts Google OAuth connection
app.get("/auth/google", (_req, res) => {
  const oauth2Client = getOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email"
    ],
  });
  res.redirect(authUrl);
});

// 2. Google OAuth callback: stores refresh & access tokens
app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("No code provided.");

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
    res.send(`
      <div style="font-family:sans-serif;text-align:center;padding:50px;">
        <h2 style="color:#10b981;">Google Calendar Connected!</h2>
        <p>Tokens saved. You can now book appointments directly onto your Google Calendar.</p>
        <p><a href="/api/calendar/events">View Calendar Events</a></p>
      </div>
    `);
  } catch (err) {
    console.error("Error exchanging OAuth code:", err);
    res.status(500).send("Authentication failed: " + err.message);
  }
});

// Helper to get authenticated calendar client
function getCalendarClient() {
  if (!fs.existsSync(TOKENS_PATH)) return null;
  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"));
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);
  return google.calendar({ version: "v3", auth: oauth2Client });
}

// 3. Status check: is calendar connected?
app.get("/api/calendar/status", (_req, res) => {
  res.json({ connected: fs.existsSync(TOKENS_PATH) });
});

// 4. List upcoming appointments
app.get("/api/calendar/events", async (_req, res) => {
  const calendar = getCalendarClient();
  if (!calendar) return res.status(401).json({ error: "Calendar not connected. Visit /auth/google first." });

  try {
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });
    res.json({ events: response.data.items || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Book an appointment with a customer
app.post("/api/calendar/book", async (req, res) => {
  const calendar = getCalendarClient();
  if (!calendar) return res.status(401).json({ error: "Calendar not connected. Visit /auth/google first." });

  const { customerName, customerEmail, summary, description, startDateTime, endDateTime } = req.body;

  const start = startDateTime ? new Date(startDateTime) : new Date(Date.now() + 3600000);
  const end = endDateTime ? new Date(endDateTime) : new Date(start.getTime() + 1800000); // 30 min default

  const eventPayload = {
    summary: summary || `Appointment: ${customerName || "Customer"}`,
    description: description || `Booked appointment for ${customerName || "Customer"} (${customerEmail || "No email"})`,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees: customerEmail ? [{ email: customerEmail }] : [],
  };

  try {
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: eventPayload,
    });
    console.log(`Appointment created: ${event.data.htmlLink}`);
    res.json({
      success: true,
      eventId: event.data.id,
      htmlLink: event.data.htmlLink,
      summary: event.data.summary,
      start: event.data.start,
      end: event.data.end,
    });
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (_req, res) => res.send("Lead capture, Slack alerts & Google Calendar API server is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
