import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTaskCompletion, extractConditions, completionQuestions } from '../service/task-completion.mjs';

const turn = (userText, { output = '完成了', evidence = [{ tool: 'bash', outcome: 'ok' }], sessionId = 's1', turnNo = 1 } = {}) =>
  ({ agent: { session: { id: sessionId } }, turn: turnNo, signal: AbortSignal.timeout(1000), userText, output, evidence });

const choice = value => ({ type: 'choice', choice: value, confidence: 0.9, probabilities: { satisfied: 0, unsatisfied: 0, insufficient_evidence: 0 } });

test('extractConditions reads numbered, bulleted, and comma-joined multi-command forms', () => {
  assert.deepEqual(extractConditions('1. 改配置\n2. 跑测试\n3. 说明失败原因'), ['改配置', '跑测试', '说明失败原因']);
  assert.deepEqual(extractConditions('- 建文件\n- 写测试'), ['建文件', '写测试']);
  assert.deepEqual(extractConditions('改配置、跑测试、说明失败原因'), ['改配置', '跑测试', '说明失败原因']);
  assert.deepEqual(extractConditions('就改一下这个 typo'), [], 'a single free-form ask has no explicit conditions');
  assert.deepEqual(extractConditions(''), []);
});

test('extractConditions dedupes and caps', () => {
  assert.deepEqual(extractConditions('1. 同一项\n2. 同一项'), ['同一项']);
  const many = Array.from({ length: 30 }, (_, i) => `${i + 1}. 项${i}`).join('\n');
  assert.equal(extractConditions(many).length, 20);
});

test('completionQuestions builds three-state choices and marks tool evidence as primary', () => {
  const { state, questions } = completionQuestions(['改配置', '跑测试'], [{ tool: 'bash', outcome: 'error' }], '测试通过了');
  assert.equal(Object.keys(questions).length, 2);
  assert.deepEqual(Object.keys(questions.c0.criteria), ['satisfied', 'unsatisfied', 'insufficient_evidence']);
  assert.equal(state.conditions[0].id, 'c0');
  assert.equal(state.toolEvidence[0].outcome, 'error');
  assert.match(state.note, /不作为证据/);
});

test('fewer than minConditions conditions skips without calling the backend', async () => {
  const check = createTaskCompletion({ evaluate: async () => { throw new Error('must not run'); } });
  assert.equal((await check.review(turn('就改一下 typo'))).evaluated, false);
});

test('no tool evidence skips without calling the backend', async () => {
  const check = createTaskCompletion({ evaluate: async () => { throw new Error('must not run'); } });
  assert.equal((await check.review(turn('1. 改配置\n2. 跑测试', { evidence: [] }))).evaluated, false);
});

test('disabled session skips', async () => {
  const check = createTaskCompletion({ sessions: { snapshot: () => ({ enabled: false }) }, evaluate: async () => { throw new Error('must not run'); } });
  assert.equal((await check.review(turn('1. 改配置\n2. 跑测试'))).evaluated, false);
});

test('observe mode records three-state verdict and never steers', async () => {
  const steers = [];
  const entries = [];
  const sessions = { snapshot: () => ({ enabled: true }), recordComplete: () => {}, log: (_id, e) => entries.push(e) };
  const check = createTaskCompletion({ sessions, steer: () => steers.push(1),
    evaluate: async () => ({ answers: { c0: choice('satisfied'), c1: choice('unsatisfied') } }) });
  const result = await check.review(turn('1. 改配置\n2. 跑测试'));
  assert.equal(result.evaluated, true);
  assert.equal(result.satisfied, 1);
  assert.equal(result.unsatisfied, 1);
  assert.equal(result.steered, false, 'observe never steers');
  assert.equal(steers.length, 0);
  assert.equal(entries.at(-1).outcome, 'unsatisfied');
});

test('insufficient_evidence is its own state, not folded into unsatisfied', async () => {
  const check = createTaskCompletion({
    evaluate: async () => ({ answers: { c0: choice('insufficient_evidence'), c1: choice('satisfied') } }) });
  const result = await check.review(turn('1. 改配置\n2. 跑测试'));
  assert.equal(result.insufficient, 1);
  assert.equal(result.unsatisfied, 0);
  assert.equal(result.satisfied, 1);
});

test('steer mode steers once on a confident unsatisfied, at most once per turn', async () => {
  const steers = [];
  const check = createTaskCompletion({ settings: { mode: 'steer' }, steer: (agent, text) => steers.push(text),
    evaluate: async () => ({ answers: { c0: choice('unsatisfied'), c1: choice('satisfied') } }) });
  assert.equal((await check.review(turn('1. 改配置\n2. 跑测试', { turnNo: 5 }))).steered, true);
  assert.equal((await check.review(turn('1. 改配置\n2. 跑测试', { turnNo: 5 }))).steered, false, 'same turn does not steer twice');
  assert.equal(steers.length, 1);
  assert.match(steers[0], /未满足|复核/);
});

test('steer does not fire when all satisfied or when confidence is low', async () => {
  const allOk = createTaskCompletion({ settings: { mode: 'steer' }, steer: () => { throw new Error('must not steer'); },
    evaluate: async () => ({ answers: { c0: choice('satisfied'), c1: choice('satisfied') } }) });
  assert.equal((await allOk.review(turn('1. a\n2. b'))).steered, false);
  const lowConf = createTaskCompletion({ settings: { mode: 'steer' }, steer: () => { throw new Error('must not steer'); },
    evaluate: async () => ({ answers: { c0: { ...choice('unsatisfied'), confidence: 0.2 }, c1: choice('satisfied') } }) });
  assert.equal((await lowConf.review(turn('1. a\n2. b'))).steered, false, 'a low-confidence unsatisfied must not steer');
});

test('a low-confidence satisfied on one condition does not suppress a confident unsatisfied on another', async () => {
  const steers = [];
  // c0 confidently unsatisfied (0.9), c1 low-confidence satisfied (0.1): the steer
  // gate must look at the unsatisfied confidence only, not the global minimum.
  const check = createTaskCompletion({ settings: { mode: 'steer' }, steer: (_agent, text) => steers.push(text),
    evaluate: async () => ({ answers: {
      c0: { ...choice('unsatisfied'), confidence: 0.9 },
      c1: { ...choice('satisfied'), confidence: 0.1 },
    } }) });
  const result = await check.review(turn('1. a\n2. b'));
  assert.equal(result.steered, true, 'a confident unsatisfied still steers despite a low-confidence satisfied elsewhere');
  assert.equal(steers.length, 1);
});

test('backend failure and invalid response are recorded as error, not unsatisfied', async () => {
  const entries = [];
  const sessions = { snapshot: () => ({ enabled: true }), recordComplete: () => {}, log: (_id, e) => entries.push(e) };
  const failing = createTaskCompletion({ sessions, evaluate: async () => { throw new Error('offline'); } });
  assert.equal((await failing.review(turn('1. a\n2. b'))).evaluated, false);
  assert.equal(entries.at(-1).outcome, 'error');
  assert.equal(entries.at(-1).reason, 'unreachable');
  const bad = createTaskCompletion({ sessions, evaluate: async () => ({ answers: null }) });
  assert.equal((await bad.review(turn('1. a\n2. b'))).evaluated, false);
  assert.equal(entries.at(-1).reason, 'invalid-response');
});

test('a throwing steer is contained and reported as not steered', async () => {
  const check = createTaskCompletion({ settings: { mode: 'steer' }, steer: () => { throw new Error('steer rejected'); },
    evaluate: async () => ({ answers: { c0: choice('unsatisfied'), c1: choice('satisfied') } }) });
  const result = await check.review(turn('1. a\n2. b'));
  assert.equal(result.evaluated, true);
  assert.equal(result.steered, false);
});

test('a transient steer failure does not consume the turn budget; a later retry can steer', async () => {
  let attempts = 0;
  const check = createTaskCompletion({ settings: { mode: 'steer' },
    steer: () => { attempts++; if (attempts === 1) throw new Error('transient'); },
    evaluate: async () => ({ answers: { c0: choice('unsatisfied'), c1: choice('satisfied') } }) });
  assert.equal((await check.review(turn('1. a\n2. b', { turnNo: 7 }))).steered, false, 'first attempt throws');
  assert.equal((await check.review(turn('1. a\n2. b', { turnNo: 7 }))).steered, true, 'same turn can retry after a transient failure');
  assert.equal(attempts, 2);
});
