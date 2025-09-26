import nodemailer from 'nodemailer';

let transporter = null;
function ready(){
  return !!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.FROM_EMAIL);
}

if (ready()){
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT||587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

export async function sendEmail(to, subject, text){
  if (!transporter){ 
    console.warn('Email not sent (missing SMTP config)');
    return { ok:false, skipped:true };
  }
  try {
    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to, subject, text
    });
    return { ok:true, messageId: info.messageId };
  } catch (e){
    console.error('Email send error:', e.message);
    return { ok:false, error: e.message };
  }
}
