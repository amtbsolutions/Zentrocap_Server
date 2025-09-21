import { sendGenericEmail } from '../utils/emailUtils.js';

const isEmail = (v='') => /.+@.+\..+/.test(v);

export const submitPartnerInterest = async (req, res) => {
  try {
    const { name='', company='', email='', phone='', phoneNumber='', city='', message='', _bot } = req.body || {};
    if (_bot) return res.status(400).json({ success:false, error:'Invalid submission' });
    const phoneVal = phoneNumber || phone;
    if (!name.trim() || !company.trim() || !isEmail(email) || !message.trim()) {
      return res.status(400).json({ success:false, error:'Missing required fields' });
    }
    const to = process.env.PARTNER_INTEREST_TO || process.env.CONTACT_FORM_TO || process.env.EMAIL_USER;
    if (!to) return res.status(500).json({ success:false, error:'Recipient not configured' });
    const subject = `New Partner Interest: ${name} (${company})`;
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;">\n<h2>Partner Interest Submission</h2>\n<p><strong>Name:</strong> ${name}</p>\n<p><strong>Company:</strong> ${company}</p>\n<p><strong>Email:</strong> ${email}</p>\n<p><strong>Phone:</strong> ${phoneVal || 'N/A'}</p>\n<p><strong>City:</strong> ${city || 'N/A'}</p>\n<p><strong>Message:</strong></p><p style="white-space:pre-line;border:1px solid #eee;padding:12px;border-radius:6px;background:#fafafa;">${(message||'').replace(/</g,'&lt;')}</p>\n<p style="font-size:12px;color:#888;">Sent ${new Date().toLocaleString()}</p></body></html>`;
    const result = await sendGenericEmail({ to, subject, html });
    if (!result.success) return res.status(500).json({ success:false, error: result.error || 'Failed to send email' });
    return res.json({ success:true, message:'Application submitted' });
  } catch (e) {
    console.error('Partner interest error', e);
    return res.status(500).json({ success:false, error:'Server error' });
  }
};
