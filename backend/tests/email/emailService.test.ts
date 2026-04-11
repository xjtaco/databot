import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetSmtpConfig = vi.fn();
vi.mock('../../src/globalConfig/globalConfig.service', () => ({
  getSmtpConfig: (...args: unknown[]) => mockGetSmtpConfig(...args),
}));

const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));
vi.mock('nodemailer', () => ({
  default: {
    createTransport: (...args: Parameters<typeof mockCreateTransport>) =>
      mockCreateTransport(...args),
  },
}));

describe('emailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendWelcomeEmail', () => {
    it('should return false when SMTP host is not configured', async () => {
      mockGetSmtpConfig.mockResolvedValue({
        host: '',
        user: 'test@example.com',
        port: 465,
        secure: true,
        pass: 'pass',
        fromName: 'DataBot',
      });

      const { sendWelcomeEmail } = await import('../../src/email/emailService');
      const result = await sendWelcomeEmail('user@example.com', 'testuser', 'TempPass123!');

      expect(result).toBe(false);
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should return false when SMTP user is not configured', async () => {
      mockGetSmtpConfig.mockResolvedValue({
        host: 'smtp.example.com',
        user: '',
        port: 465,
        secure: true,
        pass: 'pass',
        fromName: 'DataBot',
      });

      const { sendWelcomeEmail } = await import('../../src/email/emailService');
      const result = await sendWelcomeEmail('user@example.com', 'testuser', 'TempPass123!');

      expect(result).toBe(false);
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should return true when SMTP is configured and sendMail succeeds', async () => {
      mockGetSmtpConfig.mockResolvedValue({
        host: 'smtp.example.com',
        user: 'sender@example.com',
        port: 465,
        secure: true,
        pass: 'password',
        fromName: 'DataBot',
      });
      mockSendMail.mockResolvedValue({ messageId: 'msg-123' });

      const { sendWelcomeEmail } = await import('../../src/email/emailService');
      const result = await sendWelcomeEmail('user@example.com', 'testuser', 'TempPass123!');

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledOnce();
      const callArgs = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.to).toBe('user@example.com');
      expect(callArgs.subject).toBe('Your DataBot Account Has Been Created');
    });

    it('should return false on sendMail error without throwing', async () => {
      mockGetSmtpConfig.mockResolvedValue({
        host: 'smtp.example.com',
        user: 'sender@example.com',
        port: 465,
        secure: true,
        pass: 'password',
        fromName: 'DataBot',
      });
      mockSendMail.mockRejectedValue(new Error('SMTP connection refused'));

      const { sendWelcomeEmail } = await import('../../src/email/emailService');
      const result = await sendWelcomeEmail('user@example.com', 'testuser', 'TempPass123!');

      expect(result).toBe(false);
    });
  });
});
