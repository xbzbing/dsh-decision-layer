import assert from 'node:assert/strict';
import { test } from 'node:test';
import { narrowTools } from '../service/narrowing.mjs';

const answers = probs => ({ answers: Object.fromEntries(Object.entries(probs).map(([tool, noul]) => [tool, { type: 'noul', noul }])) });

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
