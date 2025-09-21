import { sendGenericEmail } from '../utils/emailUtils.js';

// Basic validation helper
const isEmail = (v='') => /.+@.+\..+/.test(v);

export const submitContactForm = async (req, res) => {
  try {
    const { firstName='', lastName='', email='', phoneNumber='', message='', _bot } = req.body || {};

    // Honeypot field to deter simple bots
    if (_bot) return res.status(400).json({ success:false, error:'Invalid submission' });

    if (!firstName.trim() || !lastName.trim() || !message.trim() || !isEmail(email)) {
      return res.status(400).json({ success:false, error:'Missing or invalid fields' });
    }

    // Assemble email content
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const to = process.env.CONTACT_FORM_TO || process.env.EMAIL_USER;
    if (!to) {
      return res.status(500).json({ success:false, error:'Contact recipient not configured' });
    }

    const subject = `New Contact Form Message from ${fullName}`;
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;">\n<h2>New Contact Form Submission</h2>\n<p><strong>Name:</strong> ${fullName}</p>\n<p><strong>Email:</strong> ${email}</p>\n<p><strong>Phone:</strong> ${phoneNumber || 'N/A'}</p>\n<p><strong>Message:</strong></p>\n<p style="white-space:pre-line;border:1px solid #eee;padding:12px;border-radius:6px;background:#fafafa;">${message.replace(/</g,'&lt;')}</p>\n<p style="font-size:12px;color:#888;">Sent ${new Date().toLocaleString()}</p>\n</body></html>`;

    const sendResult = await sendGenericEmail({ to, subject, html });
    if (!sendResult.success) {
      return res.status(500).json({ success:false, error: sendResult.error || 'Failed to send message' });
    }
    return res.json({ success:true, message:'Message sent' });
  } catch (err) {
    console.error('Contact form error', err);
    return res.status(500).json({ success:false, error:'Server error' });
  }
};
