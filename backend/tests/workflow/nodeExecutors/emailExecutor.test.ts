import { EmailExecutor } from '../../../src/workflow/nodeExecutors/emailExecutor';
import type { EmailNodeConfig } from '../../../src/workflow/workflow.types';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(__dirname, '__tmp_email_exec');

const mockSendMail = vi.fn().mockResolvedValue({ messageId: '<test@example.com>' });

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: mockSendMail,
    }),
  },
}));

vi.mock('../../../src/globalConfig/globalConfig.service', () => ({
  getSmtpConfig: vi.fn(),
}));

const DEFAULT_SMTP = {
  host: 'smtp.test.com',
  port: 465,
  secure: true,
  user: 'sender@test.com',
  pass: 'secret',
  fromName: 'Test',
};

beforeAll(() => mkdirSync(TEST_DIR, { recursive: true }));
afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('EmailExecutor', () => {
  const executor = new EmailExecutor();

  beforeEach(async () => {
    mockSendMail.mockResolvedValue({ messageId: '<test@example.com>' });
    const { getSmtpConfig } = await import('../../../src/globalConfig/globalConfig.service');
    (getSmtpConfig as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_SMTP);
  });

  it('sends email with inline content', async () => {
    const config: EmailNodeConfig = {
      nodeType: 'email',
      to: 'user@example.com',
      subject: 'Test Report',
      contentSource: 'inline',
      body: '# Hello World',
      isHtml: true,
      outputVariable: 'email_result',
    };
    const result = await executor.execute({
      workFolder: TEST_DIR,
      nodeId: 'n1',
      nodeName: 'email',
      resolvedConfig: config,
    });
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(result.recipients).toEqual(['user@example.com']);
  });

  it('sends email with upstream markdown file', async () => {
    const mdPath = join(TEST_DIR, 'report.md');
    writeFileSync(mdPath, '# Report\nSome data');
    const config: EmailNodeConfig = {
      nodeType: 'email',
      to: 'user@example.com',
      subject: 'Report',
      contentSource: 'upstream',
      upstreamField: mdPath,
      isHtml: true,
      outputVariable: 'email_result',
    };
    const result = await executor.execute({
      workFolder: TEST_DIR,
      nodeId: 'n2',
      nodeName: 'email2',
      resolvedConfig: config,
    });
    expect(result.success).toBe(true);
  });

  it('throws when SMTP not configured', async () => {
    const { getSmtpConfig } = await import('../../../src/globalConfig/globalConfig.service');
    (getSmtpConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      host: '',
      port: 465,
      secure: true,
      user: '',
      pass: '',
    });
    const config: EmailNodeConfig = {
      nodeType: 'email',
      to: 'a@b.com',
      subject: 'test',
      contentSource: 'inline',
      body: 'hi',
      isHtml: false,
      outputVariable: 'r',
    };
    await expect(
      executor.execute({
        workFolder: TEST_DIR,
        nodeId: 'n',
        nodeName: 'n',
        resolvedConfig: config,
      })
    ).rejects.toThrow();
  });
});
