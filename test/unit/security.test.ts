import { describe, it, expect } from 'vitest';
import { SecretRedactor } from '../../src/security/redactor.js';
import { isSensitivePath, hasBinaryExtension } from '../../src/security/denylist.js';

const r = new SecretRedactor();

describe('SecretRedactor', () => {
  it('redacts provider API keys', () => {
    const out = r.redact('key is sk-ant-abcdef1234567890 ok');
    expect(out.text).not.toContain('sk-ant-abcdef1234567890');
    expect(out.redactions).toBeGreaterThan(0);
  });

  it('redacts key=value assignments', () => {
    const out = r.redact('API_TOKEN=supersecretvalue123');
    expect(out.text).toContain('[REDACTED]');
    expect(out.text).not.toContain('supersecretvalue123');
  });

  it('redacts JWTs and PEM blocks', () => {
    const jwt = 'eyJhbGciOi.eyJzdWIiOiIx.SflKxwRJSMeKKF2';
    expect(r.redact(jwt).text).not.toContain(jwt);
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----';
    expect(r.redact(pem).text).not.toContain('abc');
  });

  it('redacts credentials embedded in URLs', () => {
    const out = r.redact('postgres://user:p4ssw0rd@host/db');
    expect(out.text).not.toContain('p4ssw0rd');
  });

  it('leaves ordinary text untouched', () => {
    const out = r.redact('This is a normal sentence about code.');
    expect(out.redactions).toBe(0);
    expect(out.text).toBe('This is a normal sentence about code.');
  });
});

describe('denylist', () => {
  it('flags sensitive paths', () => {
    expect(isSensitivePath('.env')).toBe(true);
    expect(isSensitivePath('config/.env.production')).toBe(true);
    expect(isSensitivePath('id_rsa')).toBe(true);
    expect(isSensitivePath('secrets.yaml')).toBe(true);
    expect(isSensitivePath('src/index.ts')).toBe(false);
  });

  it('detects binary extensions', () => {
    expect(hasBinaryExtension('logo.png')).toBe(true);
    expect(hasBinaryExtension('app.wasm')).toBe(true);
    expect(hasBinaryExtension('main.ts')).toBe(false);
  });
});
