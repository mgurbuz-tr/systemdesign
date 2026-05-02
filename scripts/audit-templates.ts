/**
 * One-shot template audit. Runs runAllAnalyses() against every shipped
 * template and prints a per-template scorecard. Exits non-zero if any
 * high-severity finding fires — used to keep the templates as production-
 * grade reference designs.
 *
 * Usage:  npx tsx scripts/audit-templates.ts
 */
import { runAllAnalyses } from '../src/lib/analysis';
import { TEMPLATES } from '../src/lib/templates';

let exitCode = 0;

for (const tpl of TEMPLATES) {
  const { nodes, edges } = tpl.build();
  const report = runAllAnalyses(nodes, edges);

  const high = report.findings.filter((f) => f.severity === 'high');
  const med = report.findings.filter((f) => f.severity === 'med');

  console.log(`\n=== ${tpl.id} (${tpl.name}) ===`);
  console.log(`  total score : ${report.totalScore}/100`);
  console.log(`  pillars     :`);
  for (const p of report.scorecard) {
    console.log(`    ${p.pillar.padEnd(12)} ${p.score}/100 (${p.grade})`);
  }
  console.log(`  findings    : ${high.length} high · ${med.length} med · ${report.findings.length} total`);
  console.log(`  spof        : ${report.spof.articulationPoints.length} articulation point(s)`);

  if (high.length > 0) {
    exitCode = 1;
    console.log(`  high-severity findings:`);
    for (const f of high) {
      console.log(`    [${f.code}] ${f.message}`);
    }
  }
  if (med.length > 0) {
    console.log(`  med-severity findings:`);
    for (const f of med) {
      console.log(`    [${f.code}] ${f.message}`);
    }
  }
}

console.log(`\n${exitCode === 0 ? '✓ all templates clean' : '✗ at least one template has high findings'}`);
process.exit(exitCode);
