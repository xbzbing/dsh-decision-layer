import assert from 'node:assert/strict';
import { test } from 'node:test';
import { narrowTools, relevanceQuestions, createNarrowing } from '../service/narrowing.mjs';

const answers = probs => ({ answers: Object.fromEntries(Object.entries(probs).map(([tool, noul]) => [tool, { type: 'noul', noul }])) });
const turn = (state, tools, { sessionId = 's1', turn = 1 } = {}) => ({ agent: { session: { id: sessionId } }, turn, signal: AbortSignal.timeout(1000), state, tools });

test('narrowing keeps only tools the model deems relevant, intersected with allowed set', () => {
  const result = narrowTools(['read', 'write', 'bash', 'web_search'], answers({ read: 0.9, write: 0.8, bash: 0.1, web_search: 0.05 }), { threshold: 0.5 });
  assert.deepEqual(result.keep.sort(), ['read', 'write']);
  assert.deepEqual(result.drop.sort(), ['bash', 'web_search']);
  assert.equal(result.applied, true);
});

test('narrowing never expands beyond the host-allowed set', () => {
  const result = narrowTools(['read'], answers({ read: 0.9, write: 0.9, delete_everything: 0.9 }), { threshold: 0.5 });
  assert.deepEqual(result.keep, ['read']);
  assert.equal(result.drop.length, 0);
});

test('empty, missing, or invalid noul results skip narrowing entirely', () => {
  assert.equal(narrowTools(['read', 'bash'], answers({}), { threshold: 0.5 }).applied, false);
  assert.equal(narrowTools(['read', 'bash'], { answers: { read: { type: 'choice' } } }, { threshold: 0.5 }).applied, false);
  assert.equal(narrowTools(['read', 'bash'], null, { threshold: 0.5 }).applied, false);
});

test('narrowing that would drop every tool is skipped to avoid disabling the agent', () => {
  const result = narrowTools(['read', 'bash'], answers({ read: 0.1, bash: 0.05 }), { threshold: 0.5 });
  assert.equal(result.applied, false);
  assert.deepEqual(result.keep.sort(), ['bash', 'read']);
});

test('a tool missing from the answers is conservatively kept', () => {
  const result = narrowTools(['read', 'bash', 'write'], answers({ read: 0.9, bash: 0.1 }), { threshold: 0.5 });
  assert.equal(result.keep.includes('write'), true);
  assert.deepEqual(result.drop, ['bash']);
});

test('relevanceQuestions builds one noul per tool referencing the tool by name', () => {
  const built = relevanceQuestions('fix the failing test', [
    { name: 'read', description: 'read a file' },
    { name: 'bash', description: 'run a shell command' },
  ]);
  assert.equal(built.state, 'fix the failing test');
  assert.deepEqual(Object.keys(built.questions).sort(), ['bash', 'read']);
  assert.equal(built.questions.read.type, 'noul');
  assert.equal(built.questions.read.instructions.tool.name, 'read');
});

test('createNarrowing skips when there are too few optional tools or no task state', async () => {
  const check = createNarrowing({ coreTools: [], evaluate: async () => { throw new Error('must not evaluate'); } });
  assert.equal((await check.review(turn('a task', [{ name: 'web_search', description: '' }]))).evaluated, false, 'one optional tool is below the candidate floor');
  assert.equal((await check.review(turn('', [{ name: 'web_search', description: '' }, { name: 'web_fetch', description: '' }]))).evaluated, false, 'no task state skips');
});

test('createNarrowing records observe suggestions without claiming to enforce', async () => {
  const logs = [];
  const sessions = { snapshot: () => ({ enabled: true }), recordNarrow: () => {}, log: (_id, entry) => logs.push(entry) };
  const check = createNarrowing({ sessions, settings: { mode: 'observe' }, minKeep: 1, coreTools: [],
    evaluate: async () => answers({ web_search: 0.9, web_fetch: 0.8, image_gen: 0.1 }) });
  const result = await check.review(turn('search the web', [
    { name: 'web_search', description: '' }, { name: 'web_fetch', description: '' }, { name: 'image_gen', description: '' },
  ]));
  assert.equal(result.evaluated, true);
  assert.equal(result.mode, 'observe');
  assert.deepEqual(result.drop, ['image_gen']);
  assert.deepEqual(logs.at(-1), { kind: 'narrow', outcome: 'applied', dropped: 1, kept: 2, mode: 'observe', tools: ['image_gen'] });
});

test('createNarrowing in enforce mode reports the kept set for the caller to restrict', async () => {
  const check = createNarrowing({ settings: { mode: 'enforce' }, minKeep: 1, coreTools: [],
    evaluate: async () => answers({ web_search: 0.9, web_fetch: 0.8, image_gen: 0.1, translate: 0.05 }) });
  const result = await check.review(turn('search and read pages', [
    { name: 'web_search', description: '' }, { name: 'web_fetch', description: '' }, { name: 'image_gen', description: '' }, { name: 'translate', description: '' },
  ]));
  assert.equal(result.mode, 'enforce');
  assert.equal(result.applied, true);
  assert.deepEqual(result.keep.sort(), ['web_fetch', 'web_search']);
});

test('narrowing defaults to enforce when no mode is configured', async () => {
  const check = createNarrowing({ settings: {}, minKeep: 1, coreTools: [],
    evaluate: async () => answers({ web_search: 0.9, image_gen: 0.05 }) });
  const result = await check.review(turn('search the web', [
    { name: 'web_search', description: '' }, { name: 'image_gen', description: '' },
  ]));
  assert.equal(result.mode, 'enforce', 'unset mode enforces by default');
  assert.equal(result.applied, true);
});

test('core tools are always kept and never judged for relevance', async () => {
  let asked;
  const check = createNarrowing({ settings: { mode: 'enforce' }, minKeep: 1,
    evaluate: async question => { asked = Object.keys(question.questions); return answers({ web_search: 0.05 }); } });
  const result = await check.review(turn('just chat', [
    { name: 'read', description: '' }, { name: 'write', description: '' }, { name: 'bash', description: '' }, { name: 'web_search', description: '' }, { name: 'web_fetch', description: '' },
  ]));
  // only the non-core tools are sent to the model
  assert.deepEqual(asked.sort(), ['web_fetch', 'web_search']);
  // core tools survive even when everything optional is dropped-eligible
  assert.equal(result.keep.includes('read'), true);
  assert.equal(result.keep.includes('bash'), true);
});

test('keep-prefix tools are always kept and never judged, on top of core tools', async () => {
  let asked;
  const check = createNarrowing({ settings: { mode: 'enforce', keepPrefixes: ['mcp__openviking'] }, minKeep: 1, coreTools: [],
    evaluate: async question => { asked = Object.keys(question.questions); return answers({ web_search: 0.05 }); } });
  const result = await check.review(turn('search the web', [
    { name: 'mcp__openviking__find', description: '' }, { name: 'mcp__openviking__search', description: '' },
    { name: 'web_search', description: '' }, { name: 'web_fetch', description: '' },
  ]));
  // openviking tools are never sent to the model, only the plain optional ones are
  assert.deepEqual(asked.sort(), ['web_fetch', 'web_search']);
  // even when the plain optional tools are all dropped, the prefixed ones survive
  assert.equal(result.keep.includes('mcp__openviking__find'), true);
  assert.equal(result.keep.includes('mcp__openviking__search'), true);
});

test('keep prefixes default to mcp__openviking when settings omit the field', async () => {
  let asked;
  const check = createNarrowing({ settings: { mode: 'enforce' }, minKeep: 1, coreTools: [],
    evaluate: async question => { asked = Object.keys(question.questions); return answers({ web_search: 0.9 }); } });
  const result = await check.review(turn('do work', [
    { name: 'mcp__openviking__remember', description: '' }, { name: 'web_search', description: '' }, { name: 'web_fetch', description: '' },
  ]));
  assert.equal(asked.includes('mcp__openviking__remember'), false, 'default prefix keeps openviking out of judging');
  assert.equal(result.keep.includes('mcp__openviking__remember'), true);
});

test('an explicit empty keepPrefixes clears the default so everything optional is judged', async () => {
  let asked;
  const check = createNarrowing({ settings: { mode: 'enforce', keepPrefixes: [] }, minKeep: 1, coreTools: [],
    evaluate: async question => { asked = Object.keys(question.questions); return answers({ web_search: 0.9, mcp__openviking__find: 0.05 }); } });
  await check.review(turn('do work', [
    { name: 'mcp__openviking__find', description: '' }, { name: 'web_search', description: '' },
  ]));
  assert.equal(asked.includes('mcp__openviking__find'), true, 'cleared prefixes let openviking be judged');
});

test('B: a large optional surface downgrades enforce to observe and never restricts', async () => {
  const logs = [];
  const sessions = { snapshot: () => ({ enabled: true }), recordNarrow: () => {}, log: (_id, entry) => logs.push(entry) };
  const many = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`opt_${i}`, i < 3 ? 0.9 : 0.05]));
  const tools = Object.keys(many).map(name => ({ name, description: '' }));
  const check = createNarrowing({ sessions, settings: { mode: 'enforce' }, maxCandidates: 20, minKeep: 1, coreTools: [],
    evaluate: async () => answers(many) });
  const result = await check.review(turn('do something', tools));
  assert.equal(result.overCap, true);
  assert.equal(result.mode, 'observe', 'over-cap forces observe');
  assert.equal(result.applied, false, 'a large surface is never enforced');
  assert.equal(logs.at(-1).reason, 'too-many-candidates');
});

test('a configured maxCandidates overrides the constructor default', async () => {
  // 6 optional tools with a configured cap of 5 -> over cap -> observe only.
  const many = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`opt_${i}`, i < 2 ? 0.9 : 0.05]));
  const tools = Object.keys(many).map(name => ({ name, description: '' }));
  const overCapCheck = createNarrowing({ settings: { mode: 'enforce', maxCandidates: 5 }, maxCandidates: 20, minKeep: 1, coreTools: [],
    evaluate: async () => answers(many) });
  const over = await overCapCheck.review(turn('do something', tools));
  assert.equal(over.overCap, true, 'a lower configured cap trips the guard');
  assert.equal(over.applied, false);
  // Raising the configured cap to 50 lets the same surface enforce.
  const bigCheck = createNarrowing({ settings: { mode: 'enforce', maxCandidates: 50 }, maxCandidates: 20, minKeep: 1, coreTools: [],
    evaluate: async () => answers(many) });
  const big = await bigCheck.review(turn('do something', tools));
  assert.equal(big.overCap, false, 'a higher configured cap admits more candidates');
  assert.equal(big.applied, true);
});

test('C: too few tools left over is treated as untrustworthy and not enforced', async () => {
  const check = createNarrowing({ settings: { mode: 'enforce' }, minKeep: 5, coreTools: [],
    evaluate: async () => answers({ a: 0.9, b: 0.1, c: 0.1, d: 0.1, e: 0.1 }) });
  const result = await check.review(turn('task', [
    { name: 'a', description: '' }, { name: 'b', description: '' }, { name: 'c', description: '' }, { name: 'd', description: '' }, { name: 'e', description: '' },
  ]));
  assert.equal(result.trustworthy, false, 'keeping only 1 is below minKeep');
  assert.equal(result.applied, false, 'an over-pruning verdict is not enforced');
});

test('createNarrowing disabled session skips without evaluating', async () => {
  const check = createNarrowing({ sessions: { snapshot: () => ({ enabled: false }) }, coreTools: [],
    evaluate: async () => { throw new Error('must not evaluate'); } });
  assert.equal((await check.review(turn('task', [{ name: 'web_search', description: '' }, { name: 'web_fetch', description: '' }]))).evaluated, false);
});

test('createNarrowing records a failure reason when the backend throws', async () => {
  const logs = [];
  const sessions = { snapshot: () => ({ enabled: true }), recordNarrow: () => {}, log: (_id, entry) => logs.push(entry) };
  const check = createNarrowing({ sessions, coreTools: [], evaluate: async () => { const e = new Error('down'); e.reason = 'http-error'; throw e; } });
  const result = await check.review(turn('task', [{ name: 'web_search', description: '' }, { name: 'web_fetch', description: '' }]));
  assert.equal(result.evaluated, false);
  assert.equal(logs.at(-1).reason, 'http-error');
});
