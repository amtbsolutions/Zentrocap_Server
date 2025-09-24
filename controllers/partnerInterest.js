import { sendGenericEmail } from '../utils/emailUtils.js';

const isEmail = (v='') => /.+@.+\..+/.test(v);

export const submitPartnerInterest = async (req, res) => {
  const t0 = Date.now();
  try {
    const { name='', company='', email='', phone='', phoneNumber='', city='', message='', _bot } = req.body || {};
    if (_bot) {
      console.warn('partner-interest:bot-detected', { ip: req.ip, ua: req.get('user-agent') });
      return res.status(400).json({ success:false, error:'Invalid submission' });
    }
    const phoneVal = phoneNumber || phone;
    if (!name.trim() || !company.trim() || !isEmail(email) || !message.trim()) {
      return res.status(400).json({ success:false, error:'Missing required fields' });
    }
    const to = process.env.PARTNER_INTEREST_TO || process.env.CONTACT_FORM_TO || process.env.EMAIL_USER;
    if (!to) {
      console.error('partner-interest:recipient-missing', { PARTNER_INTEREST_TO: process.env.PARTNER_INTEREST_TO, CONTACT_FORM_TO: process.env.CONTACT_FORM_TO, EMAIL_USER: process.env.EMAIL_USER });
      return res.status(500).json({ success:false, error:'Recipient not configured' });
    }
    const subject = `New Partner Interest: ${name} (${company})`;
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;">\n<h2>Partner Interest Submission</h2>\n<p><strong>Name:</strong> ${name}</p>\n<p><strong>Company:</strong> ${company}</p>\n<p><strong>Email:</strong> ${email}</p>\n<p><strong>Phone:</strong> ${phoneVal || 'N/A'}</p>\n<p><strong>City:</strong> ${city || 'N/A'}</p>\n<p><strong>Message:</strong></p><p style="white-space:pre-line;border:1px solid #eee;padding:12px;border-radius:6px;background:#fafafa;">${(message||'').replace(/</g,'&lt;')}</p>\n<p style="font-size:12px;color:#888;">Sent ${new Date().toLocaleString()}</p></body></html>`;

    const tSendStart = Date.now();
    const result = await sendGenericEmail({ to, subject, html });
    const sendMs = Date.now() - tSendStart;

    if (!result.success) {
      const isTimeout = result.error === 'EMAIL_TIMEOUT' || /timed? out/i.test(result.error || '');
      console.error('partner-interest:email-failed', { to, error: result.error, isTimeout, sendMs, totalMs: Date.now() - t0 });
      return res.status(500).json({ success:false, error: isTimeout ? 'Email service timeout. Please try again shortly.' : 'Failed to send email' });
    }

    console.log('partner-interest:submitted', { to, sendMs, totalMs: Date.now() - t0, dev: result.dev || false });
    return res.json({ success:true, message:'Application submitted' });
  } catch (e) {
    console.error('partner-interest:unhandled-error', { error: e.message, stack: e.stack, totalMs: Date.now() - t0 });
    return res.status(500).json({ success:false, error:'Server error' });
  }
};
