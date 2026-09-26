import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSelfCheck, DEFAULT_RUBRIC, scoreQuestion } from '../service/self-check.mjs';

const turn = (text, { sessionId = 's1', turn = 1 } = {}) => ({ agent: { id: sessionId, session: { id: sessionId } }, turn, signal: AbortSignal.timeout(1000), output: text });
const lowScore = { answers: { quality: { type: 'score', score: 0, confidence: 1, probabilities: { '0': 1, '1': 0, '2': 0 } } } };

test('builds a score question from the default rubric', () => {
  const question = scoreQuestion('some answer', DEFAULT_RUBRIC).questions.quality;
  assert.equal(question.type, 'score');
  assert.equal(question.criteria.length, DEFAULT_RUBRIC.length);
  assert.ok(question.criteria.every(level => typeof level === 'string' && level));
});

test('low score is observation-only by default and never steers', async () => {
  const steers = [];
  const check = createSelfCheck({
    evaluate: async () => ({ answers: { quality: { type: 'score', score: 0, confidence: 1, probabilities: { '0': 0.9, '1': 0.05, '2': 0.05 } } } }),
    steer: (agent, text) => steers.push({ agent, text }),
  });
  const result = await check.review(turn('final answer'));
  assert.equal(result.lowScore, true);
  assert.equal(result.steered, false);
  assert.equal(steers.length, 0);
});

test('steer mode passes the turn agent and prompt text to the host steer callback', async () => {
  const steers = [];
  const check = createSelfCheck({ settings: () => ({ mode: 'steer' }),
    evaluate: async () => lowScore, steer: (agent, text) => steers.push({ agent, text }) });
  const t = turn('weak answer', { turn: 7 });
  const result = await check.review(t);
  assert.equal(result.steered, true);
  assert.equal(steers.length, 1);
  assert.equal(steers[0].agent, t.agent, 'must steer the turn payload agent, not a ctx.agent');
  assert.match(steers[0].text, /自检/);
});

test('a throwing host steer is contained and reported as not steered', async () => {
  const check = createSelfCheck({ settings: { mode: 'steer' },
    evaluate: async () => lowScore, steer: () => { throw new Error('steer rejected'); } });
  const result = await check.review(turn('weak answer'));
  assert.equal(result.steered, false);
  assert.equal(result.lowScore, true);
});

test('hard steer runs once per session turn even across fresh turn objects', async () => {
  const steers = [];
  const check = createSelfCheck({ settings: { mode: 'steer' },
    evaluate: async () => lowScore, steer: (agent, text) => steers.push(text) });
  assert.equal((await check.review(turn('weak', { turn: 7 }))).steered, true);
  assert.equal((await check.review(turn('weak', { turn: 7 }))).steered, false, 'same session+turn must not steer twice');
  assert.equal(steers.length, 1);
  assert.equal((await check.review(turn('weak', { turn: 8 }))).steered, true, 'a later turn may steer again');
});

test('configurable rubric and threshold flow through settings', async () => {
  const seen = [];
  const check = createSelfCheck({
    settings: () => ({ rubric: ['bad', 'ok', 'good', 'excellent'], lowScoreThreshold: 2 }),
    evaluate: async question => { seen.push(question.questions.quality.criteria); return { answers: { quality: { type: 'score', score: 2, confidence: 1, probabilities: { '0': 0, '1': 0, '2': 1, '3': 0 } } } }; },
  });
  const result = await check.review(turn('answer'));
  assert.deepEqual(seen[0], ['bad', 'ok', 'good', 'excellent']);
  assert.equal(result.lowScore, true, 'score 2 is low when threshold is 2');
});

test('invalid rubric or threshold falls back to safe defaults', async () => {
  let asked;
  const check = createSelfCheck({ settings: () => ({ rubric: ['only-one'], lowScoreThreshold: -3 }),
    evaluate: async question => { asked = question.questions.quality.criteria; return { answers: { quality: { type: 'score', score: 0, confidence: 1, probabilities: { '0': 1, '1': 0, '2': 0 } } } }; } });
  const result = await check.review(turn('answer'));
  assert.deepEqual(asked, DEFAULT_RUBRIC, 'a rubric with fewer than two levels reverts to default');
  assert.equal(result.lowScore, true);
});

test('high score records without hinting or steering', async () => {
  const check = createSelfCheck({ evaluate: async () => ({ answers: { quality: { type: 'score', score: 2, confidence: 1, probabilities: { '0': 0, '1': 0, '2': 1 } } } }) });
  const result = await check.review(turn('great answer'));
  assert.equal(result.lowScore, false);
  assert.equal(result.evaluated, true);
});

test('empty output, disabled session, and backend failure skip the check without steering', async () => {
  const steers = [];
  const failing = createSelfCheck({ settings: { mode: 'steer' }, evaluate: async () => { throw new Error('offline'); }, steer: () => steers.push(1) });
  assert.equal((await failing.review(turn('anything'))).evaluated, false);
  assert.equal(steers.length, 0);
  const empty = createSelfCheck({ evaluate: async () => { throw new Error('must not run'); } });
  assert.equal((await empty.review(turn('   '))).evaluated, false);
  const disabled = createSelfCheck({ sessions: { snapshot: () => ({ enabled: false }) }, evaluate: async () => { throw new Error('must not run'); } });
  assert.equal((await disabled.review(turn('answer'))).evaluated, false);
});

test('self-check logs score on evaluation and a reason on failure', async () => {
  const entries = [];
  const sessions = { snapshot: () => ({ enabled: true }), recordCheck: () => {}, log: (_id, entry) => entries.push(entry) };
  const ok = createSelfCheck({ sessions, evaluate: async () => ({ answers: { quality: { type: 'score', score: 2, confidence: 1, probabilities: { '0': 0, '1': 0, '2': 1 } } } }) });
  await ok.review(turn('great answer'));
  assert.deepEqual(entries.at(-1), { kind: 'check', outcome: 'ok', score: 2, confidence: 1 });
  const offline = createSelfCheck({ sessions, evaluate: async () => { throw new Error('offline'); } });
  await offline.review(turn('answer'));
  assert.deepEqual(entries.at(-1), { kind: 'check', outcome: 'error', reason: 'unreachable' });
});

test('fractional scores are accepted and low confidence is a valid answer, not a failure', async () => {
  const entries = [];
  const sessions = { snapshot: () => ({ enabled: true }), recordCheck: () => {}, log: (_id, entry) => entries.push(entry) };
  const fractional = createSelfCheck({ sessions, evaluate: async () => ({ answers: { quality: { type: 'score', score: 1.43, confidence: 0.9, probabilities: { '0': 0, '1': 0.57, '2': 0.43 } } } }) });
  const result = await fractional.review(turn('great answer'));
  assert.equal(result.evaluated, true);
  assert.equal(result.lowScore, false, 'a fractional score above the threshold is not low');
  assert.deepEqual(entries.at(-1), { kind: 'check', outcome: 'ok', score: 1.43, confidence: 0.9 });
  // A low-confidence score is still recorded as a real ok/low answer with its confidence, never as an error.
  const lowConf = createSelfCheck({ sessions, evaluate: async () => ({ answers: { quality: { type: 'score', score: 0, confidence: 0.17, probabilities: { '0': 0.4, '1': 0.35, '2': 0.25 } } } }) });
  const lowConfResult = await lowConf.review(turn('answer'));
  assert.equal(lowConfResult.evaluated, true);
  assert.equal(lowConfResult.lowScore, true);
  assert.deepEqual(entries.at(-1), { kind: 'check', outcome: 'low', score: 0, confidence: 0.17 });
});

test('low confidence never steers even in steer mode, but a confident low score does', async () => {
  const steers = [];
  const shy = createSelfCheck({ settings: { mode: 'steer' },
    evaluate: async () => ({ answers: { quality: { type: 'score', score: 0, confidence: 0.2, probabilities: { '0': 0.4, '1': 0.35, '2': 0.25 } } } }),
    steer: (agent, text) => steers.push(text) });
  const shyResult = await shy.review(turn('weak', { turn: 3 }));
  assert.equal(shyResult.lowScore, true);
  assert.equal(shyResult.steered, false, 'a low-confidence low score must not interrupt the user');
  assert.equal(steers.length, 0);
  const sure = createSelfCheck({ settings: { mode: 'steer' },
    evaluate: async () => ({ answers: { quality: { type: 'score', score: 0, confidence: 0.9, probabilities: { '0': 0.9, '1': 0.05, '2': 0.05 } } } }),
    steer: (agent, text) => steers.push(text) });
  assert.equal((await sure.review(turn('weak', { turn: 4 }))).steered, true, 'a confident low score steers');
  assert.equal(steers.length, 1);
});
