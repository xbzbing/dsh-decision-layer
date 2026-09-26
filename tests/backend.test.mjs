import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBackend, validateRequest } from '../service/backend.mjs';

const payload = { state: { task: 'Summarize this short note' }, questions: { relevant: { type: 'noul', instructions: 'Is this relevant?' } } };
const response = { model: 'jev-latest', answers: { relevant: { type: 'noul', noul: 0.9 } }, usage: { input_tokens: 9, output_tokens: 2 } };

test('evaluation sends configured model and validates structured answer', async () => {
  let called = 0;
  const backend = createBackend({ config: async () => ({ url: 'https://api.typesafe.ai', apiKey: 'private-value', model: 'dev' }), fetcher: async (url, options) => {
    called++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(JSON.parse(options.body).model, 'dev');
    assert.equal(options.headers.authorization, 'Bearer private-value');
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(response), { status: 200 });
  } });
  assert.equal((await backend.evaluate(payload)).answers.relevant.noul, 0.9);
  assert.equal(called, 1);
});

test('unapproved HTTP, no key and malformed model results are denied', async () => {
  let called = 0;
  const config = { url: 'http://localhost:8080', apiKey: 'secret', model: 'jev-latest', httpApprovedUrl: '' };
  const backend = createBackend({ config: async () => config, fetcher: async () => { called++; return new Response('{}'); } });
  await assert.rejects(backend.evaluate(payload), /confirmation/i);
  assert.equal(called, 0);
  config.httpApprovedUrl = config.url;
  await assert.rejects(backend.evaluate(payload), /invalid response/i);
  config.apiKey = '';
  await assert.rejects(backend.evaluate(payload), /API key/i);
});

test('invalid requests fail before making a network call', async () => {
  assert.throws(() => validateRequest({ state: '', questions: {} }), /state|question/i);
  assert.throws(() => validateRequest({ ...payload, questions: { x: { type: 'choice', instructions: 'Pick', criteria: { one: 'One' } } } }), /choice/i);
  assert.throws(() => validateRequest({ ...payload, questions: { x: { type: 'score', instructions: 'Grade', criteria: ['only one'] } } }), /score/i);
  assert.throws(() => validateRequest({ ...payload, state: 'x'.repeat(300_000) }), /large/i);
});

test('score answers accept fractional positions and reject out-of-range or non-numeric', async () => {
  const fractional = createBackend({ config: async () => ({ url: 'https://api.typesafe.ai', apiKey: 'secret', model: 'jev-latest' }),
    fetcher: async () => new Response(JSON.stringify({ model: 'jev-latest', answers: { grade: {
      type: 'score', confidence: 1, probabilities: { '0': 0.5, '1': 0.5 }, score: 0.5,
    } } })) });
  const value = await fractional.evaluate({ state: 'test', questions: { grade: { type: 'score', instructions: 'Grade', criteria: ['low', 'high'] } } });
  assert.equal(value.answers.grade.score, 0.5);
  const outOfRange = createBackend({ config: async () => ({ url: 'https://api.typesafe.ai', apiKey: 'secret', model: 'jev-latest' }),
    fetcher: async () => new Response(JSON.stringify({ model: 'jev-latest', answers: { grade: {
      type: 'score', confidence: 1, probabilities: { '0': 0, '1': 1 }, score: 2.5,
    } } })) });
  await assert.rejects(outOfRange.evaluate({ state: 'test', questions: { grade: { type: 'score', instructions: 'Grade', criteria: ['low', 'high'] } } }), /score/i);
});

test('special question IDs cannot disappear from answers', async () => {
  const questions = JSON.parse('{"__proto__":{"type":"noul","instructions":"Is this text present?"}}');
  const backend = createBackend({ config: async () => ({ url: 'https://api.typesafe.ai', apiKey: 'secret', model: 'jev-latest' }),
    fetcher: async () => new Response(JSON.stringify({ model: 'jev-latest',
      answers: JSON.parse('{"__proto__":{"type":"noul","noul":0.8}}'), usage: { input_tokens: 1, output_tokens: 1 } })) });
  const result = await backend.evaluate({ state: 'test', questions });
  assert.equal(Object.hasOwn(result.answers, '__proto__'), true);
  assert.equal(result.answers.__proto__.noul, 0.8);
});

test('double-slash base path cannot redirect Bearer key to another origin', async () => {
  for (const scheme of ['https', 'http']) {
    let sent;
    const url = `${scheme}://legit.example//attacker.example`;
    const backend = createBackend({ config: async () => ({ url, httpApprovedUrl: scheme === 'http' ? url : '', apiKey: 'secret', model: 'jev-latest' }),
      fetcher: async destination => { sent = destination; return new Response(JSON.stringify(response)); } });
    await backend.evaluate(payload);
    assert.equal(new URL(sent).origin, `${scheme}://legit.example`);
    assert.equal(new URL(sent).pathname, '//attacker.example/v1/systemone');
  }
});

test('transient 429 and 529 responses retry with bounded attempts', async () => {
  let calls = 0;
  const backend = createBackend({ config: async () => ({ url: 'https://api.typesafe.ai', apiKey: 'secret', model: 'jev-latest' }),
    fetcher: async () => {
      calls++;
      if (calls === 1) return new Response('busy', { status: 429 });
      if (calls === 2) return new Response('overloaded', { status: 529 });
      return new Response(JSON.stringify(response));
    }, retryDelayMs: 1 });
  assert.equal((await backend.evaluate(payload)).answers.relevant.noul, 0.9);
  assert.equal(calls, 3);
});

test('network errors do not leak headers or remote response body', async () => {
  const backend = createBackend({ config: async () => ({ url: 'https://api.typesafe.ai', apiKey: 'secret', model: 'jev-latest' }), fetcher: async () => new Response('upstream secret: secret', { status: 500 }) });
  await assert.rejects(backend.evaluate(payload), error => !error.message.includes('secret') && /HTTP 500/.test(error.message));
});
