import legacyJson from '@/benchmark/scenarios.json';
import trajectoriesJson from '@/benchmark/trajectory-scenarios.json';
import {
  evaluateBenchmark,
  type BenchmarkSummary,
  type LegacyScenario,
  type TrajectoryScenario,
} from '@/lib/benchmark-engine';

export type { BenchmarkSummary } from '@/lib/benchmark-engine';

export function runBenchmark(): BenchmarkSummary {
  return evaluateBenchmark(
    legacyJson as LegacyScenario[],
    trajectoriesJson as TrajectoryScenario[],
  );
}
