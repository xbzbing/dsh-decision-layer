import { randomUUID } from 'node:crypto';
import { isObject } from './types.js';
import type { EvaluationTelemetry, Evaluator } from './types.js';

const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Local wrapper: the backend alone still owns wire validation and transport counts. */
export function measuredEvaluator(evaluate: Evaluator, now = () => performance.now()): Evaluator {
  return async (input, options) => {
    const start = now();
    const telemetry: EvaluationTelemetry = { requestId: randomUUID(), latencyMs: 0 };
    try { telemetry.requestBytes = Buffer.byteLength(JSON.stringify(input)); } catch { /* invalid inputs still reach the canonical validator */ }
    try {
      const result = await evaluate(input, options);
      telemetry.latencyMs = Math.max(0, now() - start);
      telemetry.model = result.model;
      if (result.usage) {
        if (numeric(result.usage.input_tokens)) telemetry.inputTokens = result.usage.input_tokens;
        if (numeric(result.usage.output_tokens)) telemetry.outputTokens = result.usage.output_tokens;
      }
      return { ...result, telemetry: { ...telemetry, ...result.telemetry, latencyMs: telemetry.latencyMs } };
    } catch (error) {
      telemetry.latencyMs = Math.max(0, now() - start);
      // Keep the original error/reason; never copy its message or response body into telemetry.
      if (error instanceof Error) {
        const existing = (error as Error & { telemetry?: EvaluationTelemetry }).telemetry;
        Object.assign(error, { telemetry: { ...telemetry, ...existing, latencyMs: telemetry.latencyMs } });
      }
      throw error;
    }
  };
}

/** One logical decision may fan out into several backend calls. Its latency is wall time. */
export function createEvaluationTrace(evaluate: Evaluator, now = () => performance.now()) {
  const requestId = randomUUID();
  let started: number | undefined;
  let ended = 0;
  const samples: Partial<EvaluationTelemetry>[] = [];
  const record = (value: unknown): void => {
    const sample = isObject(value) && isObject(value.telemetry) ? value.telemetry : {};
    samples.push(sample);
    ended = now();
  };
  const traced: Evaluator = async (input, options) => {
    started ??= now();
    try { const result = await evaluate(input, options); record(result); return result; }
    catch (error) { record(error); throw error; }
  };
  return {
    evaluate: traced,
    detail(): Partial<EvaluationTelemetry> {
      if (!samples.length || started === undefined) return {};
      const detail: Partial<EvaluationTelemetry> = { requestId, latencyMs: Math.max(0, ended - started) };
      for (const key of ['requestBytes', 'backendAttempts', 'inputTokens', 'outputTokens'] as const) {
        if (samples.every(sample => numeric(sample[key]))) detail[key] = samples.reduce((sum, sample) => sum + (sample[key] as number), 0);
      }
      const models = new Set(samples.map(sample => sample.model).filter((model): model is string => typeof model === 'string'));
      if (models.size === 1) detail.model = [...models][0];
      else if (models.size > 1) detail.model = 'mixed';
      return detail;
    },
  };
}
