/**
 * Hook I/O adapter.
 *
 * Encapsulates the version-specific shape of the Claude Code `UserPromptSubmit`
 * hook contract so the rest of the product does not depend on exact field
 * names. Current Claude Code sends the prompt as `user_prompt`; older/newer
 * builds have used `prompt`. We read both defensively.
 *
 * Output uses the documented `hookSpecificOutput.additionalContext` mechanism.
 * A `UserPromptSubmit` hook CANNOT rewrite the prompt — it can only append
 * context — so we never attempt to, and we never block (exit 2 would erase the
 * user's prompt).
 */

export interface HookInput {
  prompt: string;
  cwd: string | null;
  sessionId: string | null;
  transcriptPath: string | null;
  eventName: string | null;
  permissionMode: string | null;
  raw: unknown;
}

export class UserPromptSubmitAdapter {
  parse(rawStdin: string): HookInput | null {
    if (!rawStdin || !rawStdin.trim()) return null;
    let obj: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawStdin);
      if (!parsed || typeof parsed !== 'object') return null;
      obj = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
    const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
    const prompt = str(obj.user_prompt) ?? str(obj.prompt) ?? '';
    return {
      prompt,
      cwd: str(obj.cwd),
      sessionId: str(obj.session_id),
      transcriptPath: str(obj.transcript_path),
      eventName: str(obj.hook_event_name),
      permissionMode: str(obj.permission_mode),
      raw: obj,
    };
  }

  /** Build the stdout JSON that injects additional context. */
  formatContext(additionalContext: string): string {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext,
      },
    });
  }
}
