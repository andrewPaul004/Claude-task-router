import { resolved, type CliContext } from '../cli/shared.js';
import { color, icon } from '../cli/io.js';
import { runEval } from '../eval/runner.js';

export async function evalCommand(
  ctx: CliContext,
  opts: { json?: boolean; minAgreement?: number }
): Promise<number> {
  const { config } = resolved(ctx);
  const report = await runEval(config);
  const minAgreement = opts.minAgreement ?? 0.8;

  if (opts.json) {
    ctx.io.out(
      `${JSON.stringify(
        {
          total: report.total,
          routingAgreement: report.routingAgreement,
          overRoutingRate: report.overRoutingRate,
          underRoutingRate: report.underRoutingRate,
          effortAgreement: report.effortAgreement,
          riskAccuracy: report.riskAccuracy,
          complexityAccuracy: report.complexityAccuracy,
          avgConfidence: report.avgConfidence,
          avgLatencyMs: report.avgLatencyMs,
          misclassified: report.misclassified,
        },
        null,
        2
      )}\n`
    );
    return report.routingAgreement >= minAgreement ? 0 : 1;
  }

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  ctx.io.out(
    `${color.bold('Evaluation')} — ${report.total} fixtures (offline, no LLM)\n\n`
  );
  ctx.io.out(`  Routing agreement:   ${pct(report.routingAgreement)}\n`);
  ctx.io.out(`  Over-routing rate:   ${pct(report.overRoutingRate)}\n`);
  ctx.io.out(`  Under-routing rate:  ${pct(report.underRoutingRate)}\n`);
  ctx.io.out(`  Effort agreement:    ${pct(report.effortAgreement)}\n`);
  ctx.io.out(`  Risk in range:       ${pct(report.riskAccuracy)}\n`);
  ctx.io.out(`  Complexity in range: ${pct(report.complexityAccuracy)}\n`);
  ctx.io.out(`  Avg confidence:      ${pct(report.avgConfidence)}\n`);
  ctx.io.out(`  Avg latency:         ${report.avgLatencyMs.toFixed(2)}ms\n`);

  if (report.misclassified.length > 0) {
    ctx.io.out(`\n${color.yellow('Misrouted:')}\n`);
    for (const m of report.misclassified) {
      ctx.io.out(
        `  ${color.dim(m.id)} got ${m.got}, expected ${m.expected.join('/')} — "${m.prompt}"\n`
      );
    }
  }

  const ok = report.routingAgreement >= minAgreement;
  ctx.io.out(
    `\n${ok ? icon.ok() : icon.fail()} Routing agreement ${pct(report.routingAgreement)} ` +
      `(threshold ${pct(minAgreement)}).\n`
  );
  return ok ? 0 : 1;
}
