import { sendGenericEmail } from '../utils/emailUtils.js';

// Basic validation helper
const isEmail = (v='') => /.+@.+\..+/.test(v);

export const submitContactForm = async (req, res) => {
  const t0 = Date.now();
  try {
    const { firstName='', lastName='', email='', phoneNumber='', message='', _bot } = req.body || {};

    // Honeypot field to deter simple bots
    if (_bot) {
      console.warn('contact:bot-detected', { ip: req.ip, ua: req.get('user-agent') });
      return res.status(400).json({ success:false, error:'Invalid submission' });
    }

    if (!firstName.trim() || !lastName.trim() || !message.trim() || !isEmail(email)) {
      return res.status(400).json({ success:false, error:'Missing or invalid fields' });
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const to = process.env.CONTACT_FORM_TO || process.env.EMAIL_USER;
    if (!to) {
      console.error('contact:recipient-missing', { CONTACT_FORM_TO: process.env.CONTACT_FORM_TO, EMAIL_USER: process.env.EMAIL_USER });
      return res.status(500).json({ success:false, error:'Contact recipient not configured' });
    }

    const subject = `New Contact Form Message from ${fullName}`;
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;">\n<h2>New Contact Form Submission</h2>\n<p><strong>Name:</strong> ${fullName}</p>\n<p><strong>Email:</strong> ${email}</p>\n<p><strong>Phone:</strong> ${phoneNumber || 'N/A'}</p>\n<p><strong>Message:</strong></p>\n<p style="white-space:pre-line;border:1px solid #eee;padding:12px;border-radius:6px;background:#fafafa;">${message.replace(/</g,'&lt;')}</p>\n<p style="font-size:12px;color:#888;">Sent ${new Date().toLocaleString()}</p>\n</body></html>`;

    const tSendStart = Date.now();
    const sendResult = await sendGenericEmail({ to, subject, html });
    const sendMs = Date.now() - tSendStart;

    if (!sendResult.success) {
      // If timeout, give clearer client message
      if (sendResult.error === 'EMAIL_TIMEOUT') {
        console.error('contact:email-timeout', { to, sendMs, totalMs: Date.now() - t0, emailHost: process.env.EMAIL_HOST, port: process.env.EMAIL_PORT });
        return res.status(500).json({ success:false, error:'Email service timeout. Please try again shortly.' });
      }
      console.error('contact:email-failed', { to, error: sendResult.error, raw: sendResult.raw, sendMs });
      return res.status(500).json({ success:false, error: 'Failed to send message' });
    }

    console.log('contact:submitted', { to, sendMs, totalMs: Date.now() - t0, dev: sendResult.dev || false });
    return res.json({ success:true, message:'Message sent' });
  } catch (err) {
    console.error('contact:unhandled-error', { error: err.message, stack: err.stack, totalMs: Date.now() - t0 });
    return res.status(500).json({ success:false, error:'Server error' });
  }
};
