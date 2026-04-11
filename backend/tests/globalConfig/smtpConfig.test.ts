import { validateSmtpConfig } from '../../src/globalConfig/globalConfig.controller';

describe('validateSmtpConfig', () => {
  it('accepts valid SMTP config', () => {
    const config = {
      type: 'smtp',
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      user: 'me@example.com',
      pass: 'secret',
    };
    expect(() => validateSmtpConfig(config)).not.toThrow();
  });

  it('rejects missing host', () => {
    const config = {
      type: 'smtp',
      host: '',
      port: 465,
      secure: true,
      user: 'me@example.com',
      pass: 'secret',
    };
    expect(() => validateSmtpConfig(config)).toThrow();
  });

  it('rejects invalid port', () => {
    const config = {
      type: 'smtp',
      host: 'smtp.example.com',
      port: 0,
      secure: true,
      user: 'me@example.com',
      pass: 'secret',
    };
    expect(() => validateSmtpConfig(config)).toThrow();
  });

  it('rejects missing user', () => {
    const config = {
      type: 'smtp',
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      user: '',
      pass: 'secret',
    };
    expect(() => validateSmtpConfig(config)).toThrow();
  });
});
