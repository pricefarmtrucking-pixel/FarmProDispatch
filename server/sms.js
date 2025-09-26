import twilio from 'twilio';

const SID = process.env.TWILIO_ACCOUNT_SID || '';
const TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const MSG_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || '';
const FROM = process.env.TWILIO_FROM || '';

let client = null;
if (SID && TOKEN){
  try {
    client = twilio(SID, TOKEN);
  } catch(e){
    console.error('Twilio init error:', e.message);
  }
}

export function twilioReady(){
  return !!client && (!!MSG_SID || !!FROM);
}

export async function sendSMS(to, body){
  if (!client || !(MSG_SID || FROM) || !to) {
    console.warn('SMS not sent (missing config or to):', { hasClient: !!client, MSG_SID: !!MSG_SID, FROM: !!FROM, to });
    return { ok:false, skipped:true };
  }
  try {
    const msg = await client.messages.create({
      to,
      body,
      ...(MSG_SID ? { messagingServiceSid: MSG_SID } : { from: FROM })
    });
    return { ok:true, sid: msg.sid };
  } catch (e){
    console.error('Twilio send error:', e.message);
    return { ok:false, error: e.message };
  }
}
