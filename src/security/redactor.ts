/**
 * Secret redaction.
 *
 * A conservative, dependency-free redactor that masks probable secrets before
 * any text is logged or sent to an (optional) LLM classifier. It errs toward
 * over-redaction: false positives are harmless here, missed secrets are not.
 *
 * This is defense-in-depth, not a guarantee — by default nothing is logged or
 * sent anywhere at all (see privacy defaults).
 */

export interface RedactionResult {
  text: string;
  redactions: number;
}

interface Rule {
  id: string;
  pattern: RegExp;
  replace: (match: string, ...groups: string[]) => string;
}

const MASK = '[REDACTED]';

const RULES: Rule[] = [
  // key = value / key: value assignments for sensitive-looking keys.
  {
    id: 'assignment',
    pattern:
      /\b([A-Za-z0-9_.-]*(?:secret|token|password|passwd|pwd|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|auth|bearer|credential)[A-Za-z0-9_.-]*)\s*[:=]\s*(['"]?)([^\s'"]{4,})\2/gi,
    replace: (_m, key: string) => `${key}=${MASK}`,
  },
  // Common provider key formats.
  { id: 'anthropic', pattern: /\bsk-ant-[A-Za-z0-9_-]{8,}/g, replace: () => MASK },
  { id: 'openai', pattern: /\bsk-[A-Za-z0-9]{20,}/g, replace: () => MASK },
  { id: 'github', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, replace: () => MASK },
  { id: 'slack', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, replace: () => MASK },
  { id: 'google', pattern: /\bAIza[0-9A-Za-z_-]{20,}/g, replace: () => MASK },
  { id: 'aws-akid', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: () => MASK },
  // JWTs.
  {
    id: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,
    replace: () => MASK,
  },
  // PEM private key blocks.
  {
    id: 'pem',
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: () => MASK,
  },
  // URLs with embedded credentials.
  {
    id: 'url-cred',
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s:@/]+@/gi,
    replace: (_m, scheme: string) => `${scheme}${MASK}@`,
  },
];

export class SecretRedactor {
  redact(input: string): RedactionResult {
    let text = input;
    let redactions = 0;
    for (const rule of RULES) {
      text = text.replace(rule.pattern, (...args) => {
        redactions++;
        // args: match, ...groups, offset, string
        const groups = args.slice(1, -2) as string[];
        return rule.replace(args[0] as string, ...groups);
      });
    }
    return { text, redactions };
  }

  /** Convenience: returns true if the input appears to contain a secret. */
  containsSecret(input: string): boolean {
    return this.redact(input).redactions > 0;
  }
}

export function createRedactor(): SecretRedactor {
  return new SecretRedactor();
}
