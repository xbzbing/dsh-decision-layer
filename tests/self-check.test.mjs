import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSelfCheck, DEFAULT_RUBRIC, scoreQuestion } from '../service/self-check.mjs';

const turn = (text, { sessionId = 's1', turn = 1 } = {}) => ({ agent: { session: { id: sessionId } }, turn, signal: AbortSignal.timeout(1000), output: text });

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
    steer: message => steers.push(message),
  });
  const result = await check.review(turn('final answer'));
  assert.equal(result.lowScore, true);
  assert.equal(result.steered, false);
  assert.equal(steers.length, 0);
});

test('hard steer mode re-prompts once on a low score', async () => {
  const steers = [];
  const check = createSelfCheck({ mode: 'steer',
    evaluate: async () => ({ answers: { quality: { type: 'score', score: 0, confidence: 1, probabilities: { '0': 1, '1': 0, '2': 0 } } } }),
    steer: message => steers.push(message) });
  const weak = turn('weak answer');
  const result = await check.review(weak);
  assert.equal(result.steered, true);
  assert.equal(steers.length, 1);
  const again = await check.review(weak);
  assert.equal(again.steered, false, 'must not steer the same turn twice');
});

test('hard steer mode re-prompts once per turn even across fresh turn objects', async () => {
  const steers = [];
  const check = createSelfCheck({ mode: 'steer',
    evaluate: async () => ({ answers: { quality: { type: 'score', score: 0, confidence: 1, probabilities: { '0': 1, '1': 0, '2': 0 } } } }),
    steer: message => steers.push(message) });
  const first = await check.review(turn('weak answer', { turn: 7 }));
  assert.equal(first.steered, true);
  const again = await check.review(turn('weak answer', { turn: 7 }));
  assert.equal(again.steered, false, 'a fresh object for the same session+turn must not steer twice');
  assert.equal(steers.length, 1);
  const nextTurn = await check.review(turn('weak answer', { turn: 8 }));
  assert.equal(nextTurn.steered, true, 'a later turn may steer again');
});

test('high score records without hinting or steering', async () => {
  const check = createSelfCheck({ evaluate: async () => ({ answers: { quality: { type: 'score', score: 2, confidence: 1, probabilities: { '0': 0, '1': 0, '2': 1 } } } }) });
  const result = await check.review(turn('great answer'));
  assert.equal(result.lowScore, false);
  assert.equal(result.evaluated, true);
});

test('empty output, disabled session, and backend failure skip the check without steering', async () => {
  const steers = [];
  const failing = createSelfCheck({ mode: 'steer', evaluate: async () => { throw new Error('offline'); }, steer: m => steers.push(m) });
  assert.equal((await failing.review(turn('anything'))).evaluated, false);
  assert.equal(steers.length, 0);
  const empty = createSelfCheck({ evaluate: async () => { throw new Error('must not run'); } });
  assert.equal((await empty.review(turn('   '))).evaluated, false);
  const disabled = createSelfCheck({ sessions: { snapshot: () => ({ enabled: false }) }, evaluate: async () => { throw new Error('must not run'); } });
  assert.equal((await disabled.review(turn('answer'))).evaluated, false);
});
