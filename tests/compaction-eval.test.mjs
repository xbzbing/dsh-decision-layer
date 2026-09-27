import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { batchFacts, scoreSample, evaluateSample } from '../scripts/research/compaction-eval.mjs';

const facts = [
  { id: 'f0', text: '阈值 0.3', source_seq: 15, must_keep: true, human_preserved: true },
  { id: 'f1', text: '上限 20', source_seq: 18, must_keep: true, human_preserved: true },
  { id: 'f2', text: 'PATH_KEYS 覆盖 file_path', source_seq: 23, must_keep: true, human_preserved: false },
  { id: 'f3', text: 'README 双语', source_seq: 31, must_keep: false, human_preserved: true },
  { id: 'f4', text: '日志保留 30 天', source_seq: 40, must_keep: true, human_preserved: false },
];

test('batchFacts keeps each batch under the question-count ceiling', () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ id: `f${i}`, text: `fact ${i}` }));
  const batches = batchFacts('summary', many, { maxQuestions: 64 });
  assert.ok(batches.length >= 3);
  assert.ok(batches.every(batch => batch.length <= 64));
  assert.equal(batches.reduce((sum, batch) => sum + batch.length, 0), 150);
});

test('batchFacts splits when the byte ceiling would be exceeded', () => {
  const big = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, text: 'x'.repeat(2000) }));
  const batches = batchFacts('s', big, { maxQuestions: 64, byteLimit: 4096 });
  assert.ok(batches.length > 1, 'a tight byte limit forces multiple batches');
});

test('scoreSample compares model verdicts against human labels with clean tallies', () => {
  // model: f0 preserved, f1 preserved, f2 dropped (correct catch), f3 preserved, f4 preserved (missed a real miss)
  const verdicts = {
    f0: { type: 'noul', noul: 0.9 },
    f1: { type: 'noul', noul: 0.8 },
    f2: { type: 'noul', noul: 0.1 },
    f3: { type: 'noul', noul: 0.7 },
    f4: { type: 'noul', noul: 0.9 },
  };
  const tally = scoreSample(facts, verdicts);
  assert.equal(tally.totalFacts, 5);
  assert.equal(tally.evaluated, 5);
  assert.equal(tally.unevaluated, 0);
  assert.equal(tally.realMisses, 2, 'f2 and f4 are must-keep but dropped');
  assert.equal(tally.detectedMisses, 1, 'model caught f2 but not f4');
  assert.equal(tally.missedMisses, 1, 'model said f4 preserved when it was dropped');
  assert.equal(tally.falseAlarms, 0);
});

test('an unevaluated fact is skipped, never counted as a miss', () => {
  const verdicts = { f0: { type: 'noul', noul: 0.9 } };
  const tally = scoreSample(facts, verdicts);
  assert.equal(tally.evaluated, 1);
  assert.equal(tally.unevaluated, 4, 'facts without a verdict are unevaluated');
  assert.equal(tally.missedMisses, 0);
});

test('evaluateSample batches, collects verdicts, and reports cost without a real backend', async () => {
  const sample = { compactionId: 'c1', summary: 'summary', facts };
  let calls = 0;
  const fakeEvaluate = async ({ questions }) => {
    calls++;
    const answers = Object.fromEntries(Object.keys(questions).map(id => [id, { type: 'noul', noul: id === 'f2' ? 0.1 : 0.9 }]));
    return { answers, usage: { input_tokens: 10, output_tokens: 3 } };
  };
  const result = await evaluateSample(sample, fakeEvaluate);
  assert.equal(result.compactionId, 'c1');
  assert.equal(result.evaluated, 5);
  assert.equal(result.detectedMisses, 1);
  assert.equal(result.cost.requests, calls);
  assert.equal(result.cost.inputTokens, 10 * calls);
});

test('a failing backend batch leaves those facts unevaluated, not missed', async () => {
  const sample = { compactionId: 'c2', summary: 'summary', facts };
  const failing = async () => { throw new Error('offline'); };
  const result = await evaluateSample(sample, failing);
  assert.equal(result.evaluated, 0);
  assert.equal(result.unevaluated, 5);
  assert.equal(result.missedMisses, 0);
  assert.ok(result.cost.failedBatches >= 1);
});

test('the shipped sample fixture parses and scores', async () => {
  const sample = JSON.parse(await readFile(new URL('../scripts/research/fixtures/sample.json', import.meta.url), 'utf8'));
  const perfect = async ({ questions }) => ({ answers: Object.fromEntries(Object.entries(questions).map(([id]) => {
    const fact = sample.facts.find(f => f.id === id);
    return [id, { type: 'noul', noul: fact.human_preserved ? 0.9 : 0.1 }];
  })) });
  const result = await evaluateSample(sample, perfect);
  // with a perfect model, every real miss is detected and there are no false alarms
  assert.equal(result.detectedMisses, result.realMisses);
  assert.equal(result.falseAlarms, 0);
  assert.equal(result.missedMisses, 0);
});
