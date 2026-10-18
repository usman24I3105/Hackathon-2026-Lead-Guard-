async function runIntegrationTests() {
  console.log('--- 1. Testing Health & Integrations Status ---');
  const healthRes = await fetch('http://localhost:3000/api/health');
  console.log('Health status:', healthRes.status, await healthRes.json());

  // Login as amina@demo.com to get auth cookie
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173', 'X-CSRF-Token': '1' },
    body: JSON.stringify({ email: 'amina@demo.com', password: 'Password123!' }),
  });
  const cookie = loginRes.headers.get('set-cookie');
  console.log('Login status:', loginRes.status, 'Cookie exists:', !!cookie);

  const authHeaders = {
    'Cookie': cookie || '',
    'Origin': 'http://localhost:5173',
    'X-CSRF-Token': '1',
    'Content-Type': 'application/json',
  };

  // 1. Integrations status
  const intRes = await fetch('http://localhost:3000/api/integrations', { headers: authHeaders });
  const intData = await intRes.json();
  console.log('Integrations list:', intRes.status, JSON.stringify(intData, null, 2));

  // 2. Sync history
  const syncRes = await fetch('http://localhost:3000/api/sync/history', { headers: authHeaders });
  console.log('Sync history status:', syncRes.status, await syncRes.json());

  // 3. Twilio Inbound Webhook - Regular text
  console.log('\n--- 2. Testing Twilio Inbound Webhook ---');
  const twilioRegularPayload = new URLSearchParams({
    From: '+15551234567',
    Body: 'Hello, I would like more information about your cleaning services.',
    ProfileName: 'Alice Smith',
    MessageSid: `SM_TEST_${Date.now()}`,
    AccountSid: 'AC34e35d3a456ae2e83c7763fe8b9816e5',
  }).toString();

  const twilioRes1 = await fetch('http://localhost:3000/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: twilioRegularPayload,
  });
  const twilioXml1 = await twilioRes1.text();
  console.log('Twilio Regular Inbound status:', twilioRes1.status);
  console.log('Twilio TwiML Response:', twilioXml1);

  // 4. Twilio Inbound Webhook - Hot / Urgent Lead
  console.log('\n--- 3. Testing Twilio Hot Keyword -> Slack Alert ---');
  const twilioUrgentPayload = new URLSearchParams({
    From: '+15559876543',
    Body: 'Urgent! Need pricing and quote ASAP, call me immediately to buy!',
    ProfileName: 'Bob Buyer',
    MessageSid: `SM_URGENT_${Date.now()}`,
    AccountSid: 'AC34e35d3a456ae2e83c7763fe8b9816e5',
  }).toString();

  const twilioRes2 = await fetch('http://localhost:3000/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: twilioUrgentPayload,
  });
  console.log('Twilio Urgent Inbound status:', twilioRes2.status);
  console.log('Twilio Urgent TwiML Response:', await twilioRes2.text());

  // 5. Twilio Inbound Webhook - STOP Opt-out
  console.log('\n--- 4. Testing Twilio STOP Opt-Out ---');
  const twilioStopPayload = new URLSearchParams({
    From: '+15551234567',
    Body: 'STOP',
    MessageSid: `SM_STOP_${Date.now()}`,
    AccountSid: 'AC34e35d3a456ae2e83c7763fe8b9816e5',
  }).toString();

  const twilioRes3 = await fetch('http://localhost:3000/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: twilioStopPayload,
  });
  console.log('Twilio STOP status:', twilioRes3.status);

  // 6. Test Outbound Message to Opted Out contact (should fail with 400)
  console.log('\n--- 5. Testing Outbound Message to Opted-out Contact ---');
  const sendRes1 = await fetch('http://localhost:3000/api/messages/send', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      to: '+15551234567',
      body: 'Can we still talk?',
    }),
  });
  console.log('Send to opted-out status:', sendRes1.status, await sendRes1.json());

  // 7. Stripe Checkout Session creation
  console.log('\n--- 6. Testing Stripe Create Checkout Session ---');
  const stripeCreateRes = await fetch('http://localhost:3000/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      amountCents: 15000,
      title: 'Commercial Cleaning Deposit',
      customerEmail: 'buyer@test.com',
    }),
  });
  const stripeSession = await stripeCreateRes.json();
  console.log('Stripe checkout create status:', stripeCreateRes.status, stripeSession);

  // 8. Stripe Webhook - checkout.session.completed
  if (stripeSession.sessionId) {
    console.log('\n--- 7. Testing Stripe Webhook checkout.session.completed ---');
    const webhookEvent = {
      id: `evt_test_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: stripeSession.sessionId,
          amount_total: 15000,
          customer_email: 'buyer@test.com',
          payment_intent: `pi_test_${Date.now()}`,
          metadata: {
            opportunityId: '',
          },
        },
      },
    };

    const stripeWebRes = await fetch('http://localhost:3000/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookEvent),
    });
    console.log('Stripe webhook response status:', stripeWebRes.status, await stripeWebRes.json());
  }

  // 9. Calendar Book with Conflict Check
  console.log('\n--- 8. Testing Calendar Booking & Conflict Avoidance ---');
  const now = new Date();
  const startAt = new Date(now.getTime() + 3600000).toISOString();
  const endAt = new Date(now.getTime() + 7200000).toISOString();

  // Book first appointment (or test internal conflict check)
  const bookRes1 = await fetch('http://localhost:3000/api/calendar/book', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      summary: 'Initial Consultation',
      startDateTime: startAt,
      endDateTime: endAt,
      customerEmail: 'client@example.com',
      checkConflict: true,
    }),
  });
  console.log('Calendar Book 1 status:', bookRes1.status, await bookRes1.json());

  // 10. Check Sync History updated
  console.log('\n--- 9. Verifying Sync History Recorded All Events ---');
  const syncFinalRes = await fetch('http://localhost:3000/api/sync/history', { headers: authHeaders });
  const finalHistory = await syncFinalRes.json();
  console.log(`Sync history events count: ${finalHistory.history?.length}`);
  console.log('Latest 5 events:', JSON.stringify(finalHistory.history?.slice(0, 5), null, 2));
}

runIntegrationTests().catch(console.error);
