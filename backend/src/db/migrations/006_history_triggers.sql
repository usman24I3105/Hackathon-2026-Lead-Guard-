-- 006 — Record lead/message/payment/appointment changes into contact_event in
-- the SAME transaction as the change, whichever code path made it (API routes,
-- webhooks, escalation sweeper). Actor comes from app.user_id when the request
-- set it; otherwise the event is attributed to the system.

CREATE OR REPLACE FUNCTION lg_actor() RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')
$$;

CREATE OR REPLACE FUNCTION lg_event(ws TEXT, contact TEXT, opp TEXT, kind TEXT, payload JSONB, ref TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF contact IS NULL THEN RETURN; END IF;
  INSERT INTO contact_event (workspace_id, contact_id, opportunity_id, type, actor_id, payload_json, source_ref)
  VALUES (ws, contact, opp, kind, lg_actor(), payload, ref)
  ON CONFLICT DO NOTHING;
  UPDATE contact SET last_activity_at = NOW() WHERE id = contact AND workspace_id = ws;
END;
$$;

-- Leads: acknowledged / escalated / reassigned / recovery
CREATE OR REPLACE FUNCTION trg_lead_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM lg_event(NEW.workspace_id, NEW.contact_id, NEW.opportunity_id, 'lead.created',
      jsonb_build_object('lead_id', NEW.id, 'source', NEW.source, 'owner_id', NEW.owner_id), 'lead:' || NEW.id);
    RETURN NEW;
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NEW.state = 'acknowledged' THEN
    PERFORM lg_event(NEW.workspace_id, NEW.contact_id, NEW.opportunity_id, 'lead.acknowledged',
      jsonb_build_object('lead_id', NEW.id, 'seconds', NEW.time_to_first_response), NULL);
  ELSIF NEW.state IS DISTINCT FROM OLD.state AND NEW.state = 'recovery' THEN
    PERFORM lg_event(NEW.workspace_id, NEW.contact_id, NEW.opportunity_id, 'lead.recovery',
      jsonb_build_object('lead_id', NEW.id, 'reason', NEW.recovery_reason), NULL);
  END IF;
  IF NEW.escalation_level > OLD.escalation_level THEN
    PERFORM lg_event(NEW.workspace_id, NEW.contact_id, NEW.opportunity_id, 'lead.escalated',
      jsonb_build_object('lead_id', NEW.id, 'level', NEW.escalation_level, 'from_owner_id', OLD.owner_id, 'to_owner_id', NEW.owner_id), NULL);
  ELSIF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    PERFORM lg_event(NEW.workspace_id, NEW.contact_id, NEW.opportunity_id, 'lead.reassigned',
      jsonb_build_object('lead_id', NEW.id, 'from_owner_id', OLD.owner_id, 'to_owner_id', NEW.owner_id), NULL);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lead_history ON lead;
CREATE TRIGGER lead_history AFTER INSERT OR UPDATE ON lead FOR EACH ROW EXECUTE FUNCTION trg_lead_history();

-- Messages: sent / received / failed
CREATE OR REPLACE FUNCTION trg_message_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM lg_event(NEW.workspace_id, NEW.contact_id, NULL,
      CASE WHEN NEW.status = 'failed' THEN 'message.failed' WHEN NEW.direction = 'inbound' THEN 'message.received' ELSE 'message.sent' END,
      jsonb_build_object('message_id', NEW.id, 'body', left(NEW.body, 280), 'channel', NEW.channel, 'error', NEW.error), 'message:' || NEW.id);
  ELSIF NEW.status = 'failed' AND OLD.status IS DISTINCT FROM 'failed' THEN
    PERFORM lg_event(NEW.workspace_id, NEW.contact_id, NULL, 'message.failed',
      jsonb_build_object('message_id', NEW.id, 'body', left(NEW.body, 280), 'error', NEW.error), 'message-failed:' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS message_history ON message;
CREATE TRIGGER message_history AFTER INSERT OR UPDATE ON message FOR EACH ROW EXECUTE FUNCTION trg_message_history();

-- Payments: link created / paid / failed / expired / refunded
CREATE OR REPLACE FUNCTION trg_payment_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE contact TEXT;
BEGIN
  SELECT o.contact_id INTO contact FROM opportunity o WHERE o.id = NEW.opportunity_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM lg_event(NEW.workspace_id, contact, NEW.opportunity_id, 'payment.link_created',
      jsonb_build_object('payment_id', NEW.id, 'amount_cents', NEW.amount_cents), 'payment:' || NEW.id);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM lg_event(NEW.workspace_id, contact, NEW.opportunity_id, 'payment.' || NEW.status,
      jsonb_build_object('payment_id', NEW.id, 'amount_cents', NEW.amount_cents, 'refunded_cents', NEW.refunded_cents),
      'payment-' || NEW.status || ':' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS payment_history ON payment;
CREATE TRIGGER payment_history AFTER INSERT OR UPDATE ON payment FOR EACH ROW EXECUTE FUNCTION trg_payment_history();

-- Appointments: booked / canceled (deleted) / completed (status column when present)
CREATE OR REPLACE FUNCTION trg_appointment_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE contact TEXT; rec RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;
  SELECT l.contact_id INTO contact FROM lead l WHERE l.id = rec.lead_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM lg_event(rec.workspace_id, contact, NULL, 'appointment.booked',
      jsonb_build_object('appointment_id', rec.id, 'title', rec.title, 'start_at', rec.start_at), 'appointment:' || rec.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM lg_event(rec.workspace_id, contact, NULL, 'appointment.canceled',
      jsonb_build_object('appointment_id', rec.id, 'title', rec.title, 'start_at', rec.start_at), 'appointment-canceled:' || rec.id);
  ELSIF to_jsonb(NEW)->>'status' IS DISTINCT FROM to_jsonb(OLD)->>'status' THEN
    PERFORM lg_event(rec.workspace_id, contact, NULL, 'appointment.' || COALESCE(to_jsonb(NEW)->>'status', 'updated'),
      jsonb_build_object('appointment_id', rec.id, 'title', rec.title, 'start_at', rec.start_at), NULL);
  END IF;
  RETURN rec;
END;
$$;
DROP TRIGGER IF EXISTS appointment_history ON appointment;
CREATE TRIGGER appointment_history AFTER INSERT OR UPDATE OR DELETE ON appointment FOR EACH ROW EXECUTE FUNCTION trg_appointment_history();
