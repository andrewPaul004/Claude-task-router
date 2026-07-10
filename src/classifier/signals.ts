import type { TaskType } from '../types/analysis.js';

/**
 * Deterministic classification signals.
 *
 * Each rule is a set of case-insensitive patterns plus the contributions it
 * makes to the four scoring axes (complexity/risk/ambiguity/scope), an optional
 * task-type vote, an optional safety flag, and a short human-readable reason.
 *
 * Base contributions live here (in code, versioned); *multipliers* for each
 * axis live in configuration (`scoring.weights`) so behavior is tunable without
 * a code change. Keeping the pattern lists in code keeps configuration small.
 */

export interface SignalRule {
  id: string;
  patterns: RegExp[];
  complexity?: number;
  risk?: number;
  ambiguity?: number;
  scope?: number;
  /** Task-type vote and its weight. */
  typeHint?: TaskType;
  typeWeight?: number;
  /** Safety flag raised when matched. */
  safetyFlag?: string;
  /** Reason surfaced in explain output when matched. */
  reason: string;
}

function words(...ws: string[]): RegExp[] {
  return ws.map((w) => new RegExp(`\\b${w}\\b`, 'i'));
}

export const SIGNAL_RULES: SignalRule[] = [
  // ---- Task-type votes (low intrinsic score, strong type signal) ----
  {
    id: 'type-formatting',
    patterns: [
      ...words(
        'format',
        'reformat',
        'prettier',
        'indent',
        'lint',
        'lowercase',
        'uppercase'
      ),
      /\bconvert\b.*\b(csv|json|list|yaml|xml|markdown|table)\b/i,
      /\bcomma[- ]separated\b/i,
    ],
    typeHint: 'formatting',
    typeWeight: 3,
    reason: 'Mentions formatting or a mechanical conversion.',
  },
  {
    id: 'type-extraction',
    patterns: [
      /\bextract\b.*\b(value|values|email|emails|url|urls|number|numbers|field|fields|name|names|date|dates|price|prices|id|ids|data|text|entries|list)\b/i,
      /\bparse\b.*\b(json|csv|xml|yaml|log|logs|text|string|output|response)\b/i,
      /\bpull out\b/i,
      /\blist (all|the)\b/i,
      /\bget (all|the) (values|keys|fields|names|numbers|emails|urls)\b/i,
    ],
    typeHint: 'extraction',
    typeWeight: 2,
    reason: 'Requests extraction of values from text.',
  },
  {
    id: 'type-summarization',
    patterns: [...words('summarize', 'summary', 'tldr', 'recap'), /\btl;dr\b/i],
    typeHint: 'summarization',
    typeWeight: 3,
    reason: 'Requests a summary.',
  },
  {
    id: 'type-explanation',
    patterns: [
      /\b(explain|describe)\b/i,
      /\bwhat (is|are|does|do)\b/i,
      /\bhow (does|do|can) \b/i,
      /\bwhy (does|do|is|are)\b/i,
      /\bwalk me through\b/i,
    ],
    typeHint: 'explanation',
    typeWeight: 2,
    reason: 'Asks for an explanation.',
  },
  {
    id: 'type-code-search',
    patterns: [
      /\b(find|locate|search for|grep|where is|where are)\b/i,
      /\bwhich (file|function|class|module)\b/i,
    ],
    typeHint: 'code-search',
    typeWeight: 1.5,
    reason: 'Asks to locate code.',
  },
  {
    id: 'type-debugging',
    patterns: [
      ...words(
        'fix',
        'bug',
        'debug',
        'broken',
        'crash',
        'crashing',
        'error',
        'fails',
        'failing',
        'regression'
      ),
      /\bnot working\b/i,
      /\bdoesn'?t work\b/i,
      /\bstack ?trace\b/i,
      /\bthrows?\b/i,
      /\bexception\b/i,
    ],
    typeHint: 'debugging',
    typeWeight: 2,
    complexity: 1,
    reason: 'Describes a defect to diagnose and fix.',
  },
  {
    id: 'type-feature',
    patterns: [
      ...words('add', 'implement', 'create', 'build', 'introduce', 'support'),
      /\bnew (feature|endpoint|component|page|command|option)\b/i,
      /\bfeature\b/i,
    ],
    typeHint: 'feature',
    typeWeight: 1.5,
    complexity: 1,
    reason: 'Requests new functionality.',
  },
  {
    id: 'type-testing',
    patterns: [
      ...words('test', 'tests', 'spec', 'specs', 'coverage'),
      /\bunit test/i,
      /\be2e\b/i,
      /\bintegration test/i,
    ],
    typeHint: 'testing',
    typeWeight: 2,
    reason: 'Concerns tests.',
  },
  {
    id: 'type-refactor',
    patterns: [
      ...words(
        'refactor',
        'restructure',
        'rename',
        'extract',
        'simplify',
        'cleanup',
        'deduplicate',
        'reorganize'
      ),
      /\bclean up\b/i,
      /\bpull (out|up)\b/i,
    ],
    typeHint: 'refactoring',
    typeWeight: 2,
    complexity: 1,
    reason: 'Requests restructuring existing code.',
  },
  {
    id: 'type-architecture',
    patterns: [
      ...words('architecture', 'architect', 'architectural'),
      /\bsystem design\b/i,
      /\bdesign (a|the|our) (system|service|api|schema|architecture)\b/i,
      /\bhigh[- ]level design\b/i,
      /\btrade[- ]?offs?\b/i,
    ],
    typeHint: 'architecture',
    typeWeight: 3,
    complexity: 3,
    reason: 'Involves system architecture or design.',
  },
  {
    id: 'type-security',
    patterns: [
      ...words(
        'security',
        'vulnerability',
        'vulnerabilities',
        'exploit',
        'cve',
        'xss',
        'csrf',
        'injection',
        'pentest',
        'malware'
      ),
      /\bsql injection\b/i,
      /\bsecurity (review|audit)\b/i,
      /\bthreat model\b/i,
    ],
    typeHint: 'security',
    typeWeight: 2.5,
    complexity: 2,
    risk: 3,
    safetyFlag: 'security-sensitive',
    reason: 'Security-sensitive work.',
  },
  {
    id: 'type-database',
    patterns: [
      ...words(
        'database',
        'schema',
        'sql',
        'query',
        'index',
        'postgres',
        'mysql',
        'mongodb',
        'sqlite',
        'orm'
      ),
      /\bdb\b/i,
      /\bdata model\b/i,
    ],
    typeHint: 'database',
    typeWeight: 1.5,
    complexity: 1,
    reason: 'Involves the database or data model.',
  },
  {
    id: 'type-migration',
    patterns: [
      ...words('migrate', 'migration', 'upgrade', 'port', 'backfill'),
      /\bmove (from|to)\b/i,
      /\bconvert (the )?(codebase|project|app)\b/i,
    ],
    typeHint: 'migration',
    typeWeight: 2,
    complexity: 2,
    risk: 2,
    scope: 2,
    reason: 'A migration or large upgrade.',
  },
  {
    id: 'type-distributed',
    patterns: [
      ...words(
        'distributed',
        'microservice',
        'microservices',
        'kafka',
        'queue',
        'consensus',
        'sharding',
        'replication'
      ),
      /\brace condition\b/i,
      /\beventual consistency\b/i,
      /\bconcurren(t|cy)\b/i,
    ],
    typeHint: 'distributed-systems',
    typeWeight: 2.5,
    complexity: 3,
    risk: 2,
    reason: 'Distributed-systems concern.',
  },
  {
    id: 'type-devops',
    patterns: [
      ...words(
        'deploy',
        'deployment',
        'ci',
        'cd',
        'pipeline',
        'docker',
        'kubernetes',
        'k8s',
        'terraform',
        'infrastructure',
        'helm'
      ),
      /\bci\/cd\b/i,
      /\bgithub actions?\b/i,
    ],
    typeHint: 'devops',
    typeWeight: 1.5,
    complexity: 1,
    reason: 'Infrastructure or CI/CD work.',
  },
  {
    id: 'type-documentation',
    patterns: [
      ...words(
        'document',
        'documentation',
        'readme',
        'docstring',
        'changelog',
        'comment',
        'comments'
      ),
      /\bwrite docs\b/i,
      /\bapi docs?\b/i,
    ],
    typeHint: 'documentation',
    typeWeight: 1.5,
    reason: 'Documentation work.',
  },
  {
    id: 'type-product',
    patterns: [
      ...words(
        'roadmap',
        'prioritize',
        'requirements',
        'spec',
        'prd',
        'user story',
        'stories',
        'backlog',
        'okrs'
      ),
      /\bproduct (plan|planning|strategy)\b/i,
    ],
    typeHint: 'product-planning',
    typeWeight: 2,
    reason: 'Product planning work.',
  },
  {
    id: 'type-ux',
    patterns: [
      ...words('ux', 'ui', 'usability', 'wireframe', 'accessibility', 'a11y', 'design'),
      /\buser experience\b/i,
      /\buser flow\b/i,
    ],
    typeHint: 'ux',
    typeWeight: 1,
    reason: 'UX/UI work.',
  },
  {
    id: 'type-research',
    patterns: [
      ...words(
        'research',
        'investigate',
        'compare',
        'evaluate',
        'benchmark',
        'options',
        'alternatives'
      ),
      /\bpros and cons\b/i,
      /\bwhich (library|framework|approach|tool)\b/i,
    ],
    typeHint: 'research',
    typeWeight: 1.5,
    complexity: 1,
    reason: 'Open-ended research or comparison.',
  },
  {
    id: 'type-noncoding',
    patterns: [
      /\bwrite (an?|the) (email|tweet|poem|story|blog|essay|letter)\b/i,
      ...words('translate', 'rephrase', 'proofread'),
    ],
    typeHint: 'non-coding',
    typeWeight: 1.5,
    reason: 'Non-coding writing task.',
  },

  // ---- Cross-cutting concern signals (no type vote) ----
  {
    id: 'concern-auth',
    patterns: [
      ...words(
        'login',
        'logout',
        'signin',
        'signup',
        'session',
        'sessions',
        'cookie',
        'token',
        'tokens',
        'authentication',
        'authorization',
        'jwt',
        'oauth',
        'encryption'
      ),
      /\bsign[- ]?(in|up|out)\b/i,
      /\blogged[- ]?(in|out)\b/i,
      /\baccess control\b/i,
    ],
    complexity: 2,
    risk: 3,
    safetyFlag: 'auth-or-session',
    reason: 'Involves authentication, sessions, or tokens.',
  },
  {
    id: 'concern-performance',
    patterns: [
      ...words(
        'performance',
        'slow',
        'latency',
        'throughput',
        'memory',
        'leak',
        'bottleneck'
      ),
      /\btoo slow\b/i,
    ],
    complexity: 1,
    reason: 'Performance-sensitive work.',
  },

  // ---- Risk signals ----
  {
    id: 'risk-destructive',
    patterns: [
      ...words(
        'delete',
        'drop',
        'remove',
        'destroy',
        'wipe',
        'truncate',
        'purge',
        'erase'
      ),
      /\brm -rf\b/i,
      /\bdrop table\b/i,
      /\bforce[- ]?push\b/i,
    ],
    risk: 4,
    complexity: 1,
    safetyFlag: 'destructive-action',
    reason: 'Mentions a destructive or irreversible action.',
  },
  {
    id: 'risk-production',
    patterns: [
      ...words('production', 'prod', 'live', 'customers', 'customer-facing'),
      /\bin prod\b/i,
    ],
    risk: 3,
    safetyFlag: 'production-impact',
    reason: 'Touches production or customer-facing systems.',
  },
  {
    id: 'risk-data',
    patterns: [
      ...words(
        'payment',
        'payments',
        'billing',
        'pii',
        'gdpr',
        'financial',
        'money',
        'transaction'
      ),
      /\bpersonal data\b/i,
    ],
    risk: 3,
    safetyFlag: 'sensitive-data',
    reason: 'Involves payments or sensitive data.',
  },
  {
    id: 'risk-privilege',
    patterns: [
      ...words('sudo', 'root', 'chmod', 'credentials', 'secret', 'secrets', 'password'),
    ],
    risk: 3,
    safetyFlag: 'credentials-or-privilege',
    reason: 'Involves credentials or elevated privileges.',
  },

  // ---- Scope signals ----
  {
    id: 'scope-broad',
    patterns: [
      ...words(
        'everywhere',
        'everything',
        'entire',
        'all',
        'whole',
        'across',
        'codebase',
        'system-wide',
        'global',
        'throughout'
      ),
      /\bevery (file|module|service|component)\b/i,
    ],
    scope: 3,
    complexity: 2,
    reason: 'Broad, cross-cutting scope.',
  },
  {
    id: 'scope-major-change',
    patterns: [
      ...words('redesign', 'rearchitect', 'overhaul', 'rewrite'),
      /\bfrom scratch\b/i,
      /\bground up\b/i,
    ],
    scope: 3,
    complexity: 3,
    reason: 'A large redesign/rewrite.',
  },
  {
    id: 'scope-multi',
    patterns: [
      /\b(several|multiple|many) (files|modules|services|places)\b/i,
      /\bend[- ]to[- ]end\b/i,
    ],
    scope: 2,
    complexity: 1,
    reason: 'Spans multiple files or components.',
  },

  // ---- Ambiguity signals ----
  {
    id: 'ambiguity-vague-target',
    patterns: [
      /\bfix (the|this|that|it|things?)\b/i,
      /\bthe (\w+ )?(issue|problem|bug|error|failure|thing)\b/i,
      /\bsomething('?s| is)? (wrong|broken|off)\b/i,
      /\bmake it (work|better|faster|nicer|good)\b/i,
      /\bit'?s broken\b/i,
    ],
    ambiguity: 4,
    typeHint: 'debugging',
    typeWeight: 1,
    reason: 'Refers to an unspecified target ("the issue", "it").',
  },
  {
    id: 'ambiguity-underspecified',
    patterns: [
      ...words(
        'somehow',
        'properly',
        'correctly',
        'better',
        'improve',
        'optimize',
        'clean'
      ),
      /\bas needed\b/i,
      /\betc\.?\b/i,
    ],
    ambiguity: 2,
    reason: 'Underspecified success criteria.',
  },

  // ---- Autonomy / accuracy signals ----
  {
    id: 'autonomy-high',
    patterns: [
      /\bautonomous(ly)?\b/i,
      /\bon your own\b/i,
      /\bwithout asking\b/i,
      /\bhandle everything\b/i,
      /\bfigure it out\b/i,
      /\btake care of\b/i,
    ],
    complexity: 1,
    reason: 'Requests autonomous, long-horizon execution.',
  },
];

/** Rules used by the fast path to detect explicit, high-signal requests. */
export const EXPLICIT_INTENT: Array<{
  type: TaskType;
  patterns: RegExp[];
  reason: string;
}> = [
  {
    type: 'architecture',
    patterns: [
      /\barchitect(ure)?\b/i,
      /\bsystem design\b/i,
      /\bdesign (a|the) (system|architecture)\b/i,
    ],
    reason: 'Explicit architecture request.',
  },
  {
    type: 'security',
    patterns: [/\bsecurity (review|audit)\b/i, /\baudit .* (security|vulnerabilit)/i],
    reason: 'Explicit security review request.',
  },
  {
    type: 'migration',
    patterns: [
      /\bmigrat(e|ion)\b.*\b(from|to|database|schema)\b/i,
      /\bdatabase migration\b/i,
    ],
    reason: 'Explicit migration request.',
  },
];

/** Normalize a prompt for matching: collapse whitespace, keep original case-insensitivity to the regexes. */
export function normalizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim();
}

/** Rough token estimate (~4 chars/token) used for budgets, not billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
