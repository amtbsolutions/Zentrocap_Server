import nodemailer from 'nodemailer';
import crypto from 'crypto';

// Create nodemailer transporter
const createTransporter = () => {
  const port = Number(process.env.EMAIL_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port,
    secure: port === 465, // true for 465, false otherwise
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 180000, // 3 minutes
    greetingTimeout: 180000,   // 3 minutes
    socketTimeout: 180000      // 3 minutes
  });
};

// Generate OTP
export const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Send OTP email
export const sendOTPEmail = async (email, otp, type = 'registration', name = 'User') => {
  try {
    // Check if email credentials are properly configured
    const hasValidEmailConfig = process.env.EMAIL_USER && 
                               process.env.EMAIL_PASS && 
                               process.env.EMAIL_USER !== 'test@example.com' &&
                               process.env.EMAIL_PASS !== 'testpassword';

    if (!hasValidEmailConfig) {
      console.log(`📧 OTP Email (Development Mode - No SMTP configured):`);
      console.log(`   To: ${email}`);
  console.log(`   Type: ${type}`);
      console.log(`   Name: ${name}`);
      console.log(`   OTP: ${otp}`);
  console.log(`   Valid for: ${type === 'registration' ? '10 minutes' : '4 minutes'}`);
      
      return { 
        success: true, 
        messageId: `dev-${Date.now()}`,
        note: 'Email sent in development mode (logged to console)'
      };
    }

    // Production email sending
    const transporter = createTransporter();

    const isLoginOtp = type === 'login';
  const isRegistration = type === 'registration';
    const subject = isLoginOtp ? 'Login Verification - OTP Code' : 'Email Verification - OTP Code';
    const title = isLoginOtp ? 'Login Verification' : 'Email Verification';
    const message = isLoginOtp 
      ? 'You are attempting to log in to your Zentrocap account. Please use the OTP below to complete your login:'
      : 'Thank you for registering with Zentrocap Partner Program. Please use the OTP below to verify your email address:';

    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'Zentrocap'} <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: white;
              padding: 20px;
              border-radius: 10px;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
              margin-top: 20px;
            }
            .header {
              text-align: center;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px 20px;
              border-radius: 10px 10px 0 0;
              margin: -20px -20px 20px -20px;
            }
            .otp-box {
              background: #f8f9fa;
              border: 2px dashed #667eea;
              border-radius: 8px;
              padding: 20px;
              text-align: center;
              margin: 20px 0;
            }
            .otp-code {
              font-size: 36px;
              font-weight: bold;
              color: #667eea;
              letter-spacing: 8px;
              margin: 10px 0;
            }
            .warning {
              background: #fff3cd;
              border: 1px solid #ffeaa7;
              color: #856404;
              padding: 12px;
              border-radius: 5px;
              margin: 15px 0;
            }
            .footer {
              text-align: center;
              color: #666;
              font-size: 14px;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📧 ${title}</h1>
              <p>${isLoginOtp ? 'Verify your login attempt' : 'Verify your email to complete registration'}</p>
            </div>
            
            <h2>Hello ${name}!</h2>
            <p>${message}</p>
            
            <div class="otp-box">
              <p style="margin: 0; font-size: 16px; color: #666;">Your OTP Code:</p>
              <div class="otp-code">${otp}</div>
              <p style="margin: 0; font-size: 14px; color: #666;">Valid for ${isRegistration ? '10' : '4'} minutes</p>
            </div>
            
            <p>${isLoginOtp 
              ? 'Please enter this code in the login verification form to complete your login.' 
              : 'Please enter this code in the verification form to proceed with your registration.'
            }</p>
            
            <div class="warning">
              <strong>Security Note:</strong> This OTP is valid for ${isRegistration ? '10' : '4'} minutes only. Do not share this code with anyone. ${isLoginOtp 
                ? "If you didn't attempt to log in, please secure your account immediately." 
                : "If you didn't request this verification, please ignore this email."
              }
            </div>
            
            <p>If you're having trouble, please contact our support team.</p>
            
            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
              <p>&copy; ${new Date().getFullYear()} Zentrocap. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ OTP email sent successfully:', {
      messageId: info.messageId,
      to: email,
      accepted: info.accepted,
      rejected: info.rejected
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending OTP email:', {
      error: error.message,
      code: error.code,
      to: email,
      smtpConfig: {
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        user: process.env.EMAIL_USER,
        hasPassword: !!process.env.EMAIL_PASS
      }
    });
    return { success: false, error: error.message };
  }
};

// Send welcome email after successful verification
export const sendWelcomeEmail = async (email, name) => {
  try {
    // For development/testing - just log instead of sending email
    if (process.env.NODE_ENV === 'development') {
  console.log(`🎉 Welcome Email (Development Mode):`);
  console.log(`   To: ${email}`);
  console.log(`   Name: ${name}`);
  console.log(`   Message: Welcome to Zentrocap! Email verified successfully.`);
      
      return { 
        success: true, 
        messageId: `dev-welcome-${Date.now()}`,
        note: 'Welcome email sent in development mode (logged to console)'
      };
    }

    // Production email sending
    const transporter = createTransporter();

    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: 'Welcome to Zentrocap!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome to Zentrocap</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: white;
              padding: 20px;
              border-radius: 10px;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
              margin-top: 20px;
            }
            .header {
              text-align: center;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px 20px;
              border-radius: 10px 10px 0 0;
              margin: -20px -20px 20px -20px;
            }
            .success-icon {
              font-size: 48px;
              margin-bottom: 10px;
            }
            .info-box {
              background: #e7f3ff;
              border-left: 4px solid #2196F3;
              padding: 15px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              color: #666;
              font-size: 14px;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="success-icon">🎉</div>
              <h1>Welcome to Zentrocap!</h1>
              <p>Your email has been successfully verified</p>
            </div>
            
            <h2>Hello ${name}!</h2>
            <p>Congratulations! Your email has been successfully verified and your registration is now complete.</p>
            
            <div class="info-box">
              <strong>What's Next?</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Your account is currently pending admin approval</li>
                <li>You'll receive an email once your account is approved</li>
                <li>After approval, you can access all Zentrocap dashboard features</li>
              </ul>
            </div>
            
            <p>Thank you for joining Zentrocap. We're excited to have you on board!</p>
            
            <div class="footer">
              <p>If you have any questions, feel free to contact our support team.</p>
              <p>&copy; ${new Date().getFullYear()} Zentrocap. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
};

// Generic email sender for contact form & future simple notifications
export const sendGenericEmail = async ({ to, subject, html, text }) => {
  try {
    const hasValidEmailConfig = process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.EMAIL_USER !== 'test@example.com' && process.env.EMAIL_PASS !== 'testpassword';

    if (!hasValidEmailConfig) {
      // Provide explicit diagnostic info so users know why they are not receiving real emails
      console.log('────────────────────────────────────────────────────────');
      console.log('📧 Generic Email (Development / Fallback Mode)');
      console.log('Real SMTP send skipped because EMAIL_USER / EMAIL_PASS appear unset or using placeholder values.');
      console.log('To enable real email sending, set the following environment variables:');
      console.log('  EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS');
      console.log('Optional (recommended): EMAIL_FROM, EMAIL_FROM_NAME, CONTACT_FORM_TO, PARTNER_INTEREST_TO');
      console.log('Detected Values:');
      console.log('  EMAIL_HOST=', process.env.EMAIL_HOST || '(missing)');
      console.log('  EMAIL_PORT=', process.env.EMAIL_PORT || '(missing)');
      console.log('  EMAIL_USER=', process.env.EMAIL_USER || '(missing)');
      console.log('  EMAIL_PASS=', process.env.EMAIL_PASS ? '[set]' : '(missing)');
      console.log('  CONTACT_FORM_TO=', process.env.CONTACT_FORM_TO || '(missing - will fallback)');
      console.log('  PARTNER_INTEREST_TO=', process.env.PARTNER_INTEREST_TO || '(missing - will fallback)');
      console.log('Simulated Email Metadata:');
      console.log('  To:', to);
      console.log('  Subject:', subject);
      console.log('────────────────────────────────────────────────────────');
      return { success: true, messageId: 'dev-generic-' + Date.now(), dev: true };
    }

    const transporter = createTransporter();
    const fromAddress = `${process.env.EMAIL_FROM_NAME || 'Zentrocap'} <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`;
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text
    });
    console.log(`✅ Generic email sent via SMTP -> id: ${info.messageId} to: ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending generic email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send forgot password OTP email
export const sendForgotPasswordOTPEmail = async (email, otp, name = 'User') => {
  try {
    // Check if email credentials are properly configured
    const hasValidEmailConfig = process.env.EMAIL_USER && 
                               process.env.EMAIL_PASS && 
                               process.env.EMAIL_USER !== 'your-email@gmail.com' &&
                               process.env.EMAIL_PASS !== 'your-app-password';

    if (!hasValidEmailConfig) {
      console.log(`📧 Forgot Password OTP Email (Development Mode - No SMTP configured):`);
      console.log(`   To: ${email}`);
      console.log(`   Name: ${name}`);
      console.log(`   OTP: ${otp}`);
  console.log(`   Purpose: Password Reset`);
  console.log(`   Valid for: 10 minutes`);
      
      return { 
        success: true, 
        messageId: `dev-${Date.now()}`,
        note: 'Email sent in development mode (logged to console)'
      };
    }

    // Production email sending
    const transporter = createTransporter();

    const mailOptions = {
  from: `${process.env.EMAIL_FROM_NAME || 'Zentrocap'} <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset - OTP Verification',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Password Reset</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: white;
              padding: 20px;
              border-radius: 10px;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
              margin-top: 20px;
            }
            .header {
              text-align: center;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
              padding: 30px 20px;
              border-radius: 10px 10px 0 0;
              margin: -20px -20px 20px -20px;
            }
            .otp-box {
              background: #fff5f5;
              border: 2px dashed #ff6b6b;
              border-radius: 8px;
              padding: 20px;
              text-align: center;
              margin: 20px 0;
            }
            .otp-code {
              font-size: 36px;
              font-weight: bold;
              color: #ff6b6b;
              letter-spacing: 8px;
              margin: 10px 0;
            }
            .warning-box {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              color: #666;
              font-size: 14px;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Password Reset Request</h1>
              <p>We received a request to reset your password</p>
            </div>
            
            <h2>Hello ${name}!</h2>
            <p>You requested to reset your password for your Zentrocap Partner Account. Use the OTP code below to proceed with the password reset.</p>
            
            <div class="otp-box">
              <p><strong>Your Password Reset OTP:</strong></p>
              <div class="otp-code">${otp}</div>
              <p style="color: #666; font-size: 14px;">This code expires in 4 minutes</p>
            </div>

            <div class="warning-box">
              <p><strong>⚠️ Security Notice:</strong></p>
              <p>• If you didn't request this password reset, please ignore this email</p>
              <p>• Never share this OTP with anyone</p>
              <p>• Our support team will never ask for your OTP</p>
            </div>
            
            <p>If you're having trouble, you can contact our support team for assistance.</p>
            
            <div class="footer">
              <p>This is an automated message. Please do not reply to this email.</p>
              <p>&copy; ${new Date().getFullYear()} Zentrocap. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Forgot Password OTP email sent successfully:', {
      messageId: info.messageId,
      to: email,
      accepted: info.accepted,
      rejected: info.rejected
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending forgot password OTP email:', {
      error: error.message,
      code: error.code,
      to: email,
      smtpConfig: {
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        user: process.env.EMAIL_USER,
        hasPassword: !!process.env.EMAIL_PASS
      }
    });
    return { success: false, error: error.message };
  }
};

// Send invoice with PDF attachment to partner
export const sendInvoiceEmail = async ({ to, name = 'Partner', subject, htmlMessage, pdfBuffer, filename = 'invoice.pdf' }) => {
  try {
    const hasValidEmailConfig = process.env.EMAIL_USER && 
                               process.env.EMAIL_PASS && 
                               !['test@example.com', 'your-email@gmail.com'].includes(process.env.EMAIL_USER) &&
                               !['testpassword', 'your-app-password'].includes(process.env.EMAIL_PASS);

    if (!hasValidEmailConfig) {
      console.log('📧 Invoice Email (Development Mode - No SMTP configured):');
      console.log('   To:', to);
      console.log('   Subject:', subject);
      console.log('   Filename:', filename);
      console.log('   Message Preview:', htmlMessage?.slice(0, 120));
  return { success: true, messageId: `dev-invoice-${Date.now()}`, note: 'Email not sent (dev mode). Logged to server console.' };
    }

    const transporter = createTransporter();
    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'Zentrocap'} <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to,
      bcc: process.env.EMAIL_BCC || undefined,
      subject: subject || 'Your Invoice from Zentrocap',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Invoice</title>
          <style>
            body{font-family:Arial,sans-serif;background:#f6f8fb;margin:0;padding:0;color:#333}
            .container{max-width:640px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,0.08);}
            .header{background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;padding:28px 24px}
            .content{padding:24px}
            .greet{font-size:16px;margin:0 0 12px}
            .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0}
            .footer{padding:18px 24px;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin:0">Your Invoice</h2>
              <p style="margin:6px 0 0;opacity:.9">Zentrocap Partner Portal</p>
            </div>
            <div class="content">
              <p class="greet">Dear ${name},</p>
              ${htmlMessage || '<p>Please find your invoice attached.</p>'}
              <div class="card">If you have any questions, just reply to this email and our team will help you promptly.</div>
              <p>Warm regards,<br/>Zentrocap Billing Team</p>
            </div>
            <div class="footer">&copy; ${new Date().getFullYear()} Zentrocap. All rights reserved.</div>
          </div>
        </body>
        </html>
      `,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

  const info = await transporter.sendMail(mailOptions);
  console.log('✅ Invoice email sent:', { to, filename, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected });
  return { success: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
  } catch (error) {
    console.error('❌ Error sending invoice email:', error);
    return { success: false, error: error.message };
  }
};

export default {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
  sendForgotPasswordOTPEmail
};
