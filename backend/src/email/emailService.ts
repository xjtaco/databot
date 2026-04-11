import nodemailer from 'nodemailer';
import { getSmtpConfig } from '../globalConfig/globalConfig.service';
import logger from '../utils/logger';

export async function sendWelcomeEmail(
  to: string,
  username: string,
  password: string
): Promise<boolean> {
  try {
    const smtp = await getSmtpConfig();
    if (!smtp.host || !smtp.user) {
      logger.warn('SMTP not configured, cannot send welcome email');
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 465,
      secure: smtp.secure !== false,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const fromName = smtp.fromName || 'DataBot';
    const html = buildWelcomeEmailHtml(username, password);

    await transporter.sendMail({
      from: `"${fromName}" <${smtp.user}>`,
      to,
      subject: 'Your DataBot Account Has Been Created',
      html,
    });

    logger.info('Welcome email sent', { to, username });
    return true;
  } catch (err) {
    logger.error('Failed to send welcome email', { to, error: err });
    return false;
  }
}

function buildWelcomeEmailHtml(username: string, password: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Welcome to DataBot</h2>
      <p>Your account has been created. Here are your login credentials:</p>
      <table style="border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px 16px; font-weight: bold; background: #f5f5f5;">Username</td>
          <td style="padding: 8px 16px;">${username}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; font-weight: bold; background: #f5f5f5;">Password</td>
          <td style="padding: 8px 16px; font-family: monospace;">${password}</td>
        </tr>
      </table>
      <p style="color: #e74c3c;"><strong>Important:</strong> You will be required to change your password on first login.</p>
    </div>
  `;
}
