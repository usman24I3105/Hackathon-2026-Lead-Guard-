import os
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "AC34e35d3a456ae2e83c7763fe8b9816e5")
auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "1472b208df4a12d63e23af281164b132")
client = Client(account_sid, auth_token)

try:
    message = client.messages.create(
        to="+817054633568",
        from_="+17372508034",
        body="sms_appointment_reminders",
    )
    print("SUCCESS: Message SID:", message.sid)
except TwilioRestException as e:
    print(f"TwilioRestException [{e.code}]: {e.msg}")
    print(f"Details: {e.details if hasattr(e, 'details') else ''}")
