import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEvaluationTrace, measuredEvaluator } from '../lib/host/evaluation-trace.js';

const input = { state: 'task', questions: { q: { type: 'noul', instructions: 'relevant?' } } };

test('local measurement captures successful and failed attempts without keeping request content', async () => {
  let clock = 0;
  const evaluate = measuredEvaluator(async () => { clock = 12; return { model: 'dev', answers: {}, usage: { input_tokens: 0, output_tokens: 3 } }; }, () => clock);
  const result = await evaluate(input);
  assert.equal(result.telemetry.latencyMs, 12);
  assert.equal(result.telemetry.inputTokens, 0);
  assert.equal(result.telemetry.outputTokens, 3);
  assert.ok(result.telemetry.requestId);
  assert.ok(result.telemetry.requestBytes > 0);
  assert.equal(result.telemetry.state, undefined);
  const failing = measuredEvaluator(async () => { throw Object.assign(new Error('safe'), { reason: 'unreachable' }); });
  await assert.rejects(failing(input), error => error.reason === 'unreachable' && Boolean(error.telemetry.requestId));
});

test('a parallel split decision records wall time, physical attempts and only fully known usage', async () => {
  let clock = 0;
  const trace = createEvaluationTrace(async () => {
    clock += 5;
    return { model: 'dev', answers: {}, telemetry: { requestId: `r${clock}`, latencyMs: 5, backendAttempts: 1, inputTokens: 2, outputTokens: 1, model: 'dev', requestBytes: 20 } };
  }, () => clock);
  await Promise.all([trace.evaluate(input), trace.evaluate(input)]);
  const detail = trace.detail();
  assert.equal(detail.backendAttempts, 2);
  assert.equal(detail.inputTokens, 4);
  assert.equal(detail.outputTokens, 2);
  assert.equal(detail.latencyMs, 10);
  assert.equal(detail.requestBytes, 40);
  const partial = createEvaluationTrace(async () => ({ model: 'dev', answers: {} }));
  await partial.evaluate(input);
  assert.equal(partial.detail().inputTokens, undefined);
  assert.equal(partial.detail().backendAttempts, undefined, 'no transport measurement means unknown physical attempts');
});
