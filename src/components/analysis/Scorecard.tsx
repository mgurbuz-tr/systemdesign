import { Icon } from '@/components/ui/Icon';
import type { PillarScore } from '@/lib/analysis/types';
import { cn } from '@/lib/utils';

const PILLAR_LABEL: Record<PillarScore['pillar'], string> = {
  reliability: 'Reliability',
  performance: 'Performance',
  cost: 'Cost',
  security: 'Security',
  operations: 'Operations',
  consistency: 'Consistency',
};

const PILLAR_ICON: Record<PillarScore['pillar'], string> = {
  reliability: 'auth',
  performance: 'metrics',
  cost: 'stripe',
  security: 'auth',
  operations: 'gear',
  consistency: 'database',
};

const GRADE_COLOR: Record<PillarScore['grade'], string> = {
  A: '#7c9c5e',
  B: '#9aae6a',
  C: '#c8a74a',
  D: '#c97e42',
  F: '#c96442',
};

/**
 * Compact scorecard — a big total score on top with six pillar bars.
 * Mirrors the readability of an AWS Well-Architected review summary
 * without taking the vertical space a full table would.
 */
export function Scorecard({
  totalScore,
  scorecard,
}: {
  totalScore: number;
  scorecard: PillarScore[];
}) {
  return (
    <div className="space-y-2.5 px-3 pt-3">
      <div className="flex items-baseline gap-2">
        <span
          className="text-[28px] font-semibold leading-none"
          style={{ color: GRADE_COLOR[gradeOf(totalScore)] }}
        >
          {totalScore}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-text-dim">
          / 100
        </span>
        <span className="ml-auto rounded-md border border-border bg-input px-1.5 py-0.5 text-[10px] font-semibold text-text">
          {gradeOf(totalScore)}
        </span>
      </div>

      <ul className="space-y-1.5">
        {scorecard.map((p) => (
          <li key={p.pillar} className="flex items-center gap-2">
            <Icon name={PILLAR_ICON[p.pillar]} size={11} stroke={1.6} />
            <span className="w-[78px] truncate text-[10.5px] text-text">
              {PILLAR_LABEL[p.pillar]}
            </span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-input">
              <div
                className={cn('absolute inset-y-0 left-0 rounded-full')}
                style={{
                  width: `${p.score}%`,
                  background: GRADE_COLOR[p.grade],
                }}
              />
            </div>
            <span
              className="w-[26px] text-right font-mono text-[10px]"
              style={{ color: GRADE_COLOR[p.grade] }}
            >
              {p.score}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function gradeOf(s: number): PillarScore['grade'] {
  if (s >= 90) return 'A';
  if (s >= 75) return 'B';
  if (s >= 60) return 'C';
  if (s >= 45) return 'D';
  return 'F';
}
