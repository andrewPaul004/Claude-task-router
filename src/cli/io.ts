import readline from 'node:readline/promises';

/** Terminal IO helpers: color (NO_COLOR-aware), printing, and confirmation. */

const useColor =
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== 'dumb' &&
  (process.stdout.isTTY ?? false);

function wrap(code: number, s: string): string {
  return useColor ? `[${code}m${s}[0m` : s;
}

export const color = {
  bold: (s: string) => wrap(1, s),
  dim: (s: string) => wrap(2, s),
  red: (s: string) => wrap(31, s),
  green: (s: string) => wrap(32, s),
  yellow: (s: string) => wrap(33, s),
  blue: (s: string) => wrap(34, s),
  cyan: (s: string) => wrap(36, s),
};

export const icon = {
  ok: () => color.green('✔'),
  warn: () => color.yellow('!'),
  fail: () => color.red('✘'),
  info: () => color.blue('•'),
};

export interface CliIO {
  out: (s: string) => void;
  err: (s: string) => void;
  confirm: (question: string) => Promise<boolean>;
  isTTY: boolean;
}

export function createCliIO(): CliIO {
  return {
    out: (s: string) => process.stdout.write(s),
    err: (s: string) => process.stderr.write(s),
    isTTY: process.stdin.isTTY ?? false,
    confirm: async (question: string): Promise<boolean> => {
      if (!(process.stdin.isTTY ?? false)) return true;
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr,
      });
      try {
        const answer = (await rl.question(question)).trim().toLowerCase();
        return answer === 'y' || answer === 'yes';
      } finally {
        rl.close();
      }
    },
  };
}

/** Read all of stdin as a string (used for piped prompts / hook input). */
export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}
