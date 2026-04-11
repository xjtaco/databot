import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { marked } from 'marked';
import { getSmtpConfig } from '../../globalConfig/globalConfig.service';
import { WorkflowExecutionError } from '../../errors/types';
import type { EmailNodeConfig, EmailNodeOutput } from '../workflow.types';
import type { NodeExecutor, NodeExecutionContext } from './types';

export class EmailExecutor implements NodeExecutor {
  readonly type = 'email';

  async execute(context: NodeExecutionContext): Promise<EmailNodeOutput> {
    const config = context.resolvedConfig as EmailNodeConfig;

    // 1. Load SMTP config
    const smtp = await getSmtpConfig();
    if (!smtp.host || !smtp.user) {
      throw new WorkflowExecutionError('SMTP not configured. Please configure in Settings.');
    }

    // 2. All template variables already resolved by engine

    // 3. Get content
    let content: string;
    if (config.contentSource === 'upstream' && config.upstreamField) {
      content = readFileSync(config.upstreamField, 'utf-8');
    } else {
      content = config.body || '';
    }

    // 4. Convert markdown to HTML if needed
    let html: string | undefined;
    const text: string = content;
    if (config.isHtml) {
      const htmlBody = await marked(content);
      html =
        `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #1f2328; line-height: 1.5;">` +
        `<style>` +
        `table { border-collapse: collapse; border-spacing: 0; width: auto; margin: 16px 0; }` +
        `th, td { padding: 6px 13px; border: 1px solid #d1d9e0; }` +
        `th { font-weight: 600; background-color: #f6f8fa; }` +
        `tr:nth-child(even) { background-color: #f6f8fa; }` +
        `h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }` +
        `h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid #d1d9e0; }` +
        `h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid #d1d9e0; }` +
        `h3 { font-size: 1.25em; }` +
        `p { margin-top: 0; margin-bottom: 16px; }` +
        `code { padding: 0.2em 0.4em; font-size: 85%; background-color: #eff1f3; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace; }` +
        `pre { padding: 16px; overflow: auto; font-size: 85%; line-height: 1.45; background-color: #f6f8fa; border-radius: 6px; }` +
        `pre code { padding: 0; background-color: transparent; }` +
        `blockquote { padding: 0 1em; color: #656d76; border-left: 0.25em solid #d1d9e0; margin: 0 0 16px 0; }` +
        `hr { height: 0.25em; padding: 0; margin: 24px 0; background-color: #d1d9e0; border: 0; }` +
        `ul, ol { padding-left: 2em; margin-bottom: 16px; }` +
        `li + li { margin-top: 0.25em; }` +
        `img { max-width: 100%; }` +
        `</style>` +
        `${htmlBody}</div>`;
    }

    // 5. Send email
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const recipients = config.to
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    const info = await transporter.sendMail({
      from: smtp.fromName ? `"${smtp.fromName}" <${smtp.user}>` : smtp.user,
      to: recipients.join(', '),
      subject: config.subject,
      text,
      html,
    });

    return {
      success: true,
      messageId: info.messageId,
      recipients,
    };
  }
}
