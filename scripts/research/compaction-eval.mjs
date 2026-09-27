// Offline compaction-fidelity evaluator (research; NOT wired into the agent loop
// and NOT in the npm/GitHub package `files` allowlist). Reads human-annotated
// compaction fixtures and asks the adjudication backend, per fact, whether the
// summary preserved that fact — then scores the model against the human labels.
//
// It only reuses createBackend to send structured requests; it registers no
// hooks, no tools, and never touches DSH runtime state.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createBackend } from '../../service/backend.mjs';
import { resolveConfig } from '../../service/config-store.mjs';

const REQUEST_LIMIT = 256 * 1024;
const MAX_QUESTIONS = 64;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// One fact → one noul question. The state carries the summary and the fact under
// test; the question asks whether the summary preserved it without altering meaning.
function factQuestion(summary, fact) {
  return {
    type: 'noul',
    instructions: {
      summary: String(summary ?? '').slice(0, 8 * 1024),
      fact: String(fact?.text ?? '').slice(0, 1024),
      question: '这段摘要（summary）是否保留了这条事实（fact），且没有改变它的含义？',
    },
  };
}

// Split a sample's facts into batches that stay under the question count and the
// request byte ceiling, so a large fact list never exceeds the backend limits.
export function batchFacts(summary, facts, { maxQuestions = MAX_QUESTIONS, byteLimit = REQUEST_LIMIT } = {}) {
  const list = Array.isArray(facts) ? facts.filter(fact => isObject(fact) && typeof fact.id === 'string') : [];
  const batches = [];
  let current = [];
  const wouldExceedBytes = next => {
    const questions = Object.fromEntries([...current, next].map(fact => [fact.id, factQuestion(summary, fact)]));
    return Buffer.byteLength(JSON.stringify({ state: { summary }, questions })) > byteLimit;
  };
  for (const fact of list) {
    if (current.length > 0 && (current.length >= maxQuestions || wouldExceedBytes(fact))) {
      batches.push(current);
      current = [];
    }
    current.push(fact);
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// Compare the model's per-fact verdict against the human labels. `preserved` is
// the model's judgment (noul ≥ 0.5 = preserved); an unevaluated fact is skipped
// (never counted as a miss). Returns tallies with clean denominators.
export function scoreSample(facts, verdicts, { threshold = 0.5 } = {}) {
  const tally = { totalFacts: 0, evaluated: 0, unevaluated: 0,
    realMisses: 0, detectedMisses: 0, falseAlarms: 0, missedMisses: 0 };
  for (const fact of facts) {
    tally.totalFacts++;
    const verdict = verdicts[fact.id];
    if (!isObject(verdict) || typeof verdict.noul !== 'number' || !Number.isFinite(verdict.noul)) {
      tally.unevaluated++;
      continue;
    }
    tally.evaluated++;
    const modelPreserved = verdict.noul >= threshold;
    const humanPreserved = fact.human_preserved === true;
    const humanMustKeep = fact.must_keep === true;
    // A "real miss": a must-keep fact the summary actually dropped.
    if (humanMustKeep && !humanPreserved) {
      tally.realMisses++;
      if (!modelPreserved) tally.detectedMisses++; // model flagged the real miss
    }
    // False alarm: model says dropped, but the human says it was preserved.
    if (!modelPreserved && humanPreserved) tally.falseAlarms++;
    // Missed miss: model says preserved, but the human says it was dropped.
    if (modelPreserved && !humanPreserved) tally.missedMisses++;
  }
  return tally;
}

async function loadSamples(path) {
  const info = await stat(path);
  const files = info.isDirectory()
    ? (await readdir(path)).filter(name => name.endsWith('.json')).map(name => join(path, name))
    : [path];
  const samples = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    for (const sample of Array.isArray(parsed) ? parsed : [parsed]) {
      if (isObject(sample) && Array.isArray(sample.facts)) samples.push({ file, sample });
    }
  }
  return samples;
}

// Evaluate one sample: batch its facts, call the backend per batch, collect
// verdicts, and score against the human labels. `evaluate` is injected so tests
// can supply a fake backend; production passes createBackend(...).evaluate.
export async function evaluateSample(sample, evaluate) {
  const batches = batchFacts(sample.summary, sample.facts);
  const verdicts = Object.create(null);
  let inputTokens = 0, outputTokens = 0, requests = 0, failedBatches = 0;
  for (const batch of batches) {
    const questions = Object.fromEntries(batch.map(fact => [fact.id, factQuestion(sample.summary, fact)]));
    requests++;
    try {
      const result = await evaluate({ state: { summary: sample.summary }, questions });
      const answers = isObject(result?.answers) ? result.answers : {};
      for (const fact of batch) verdicts[fact.id] = answers[fact.id];
      if (isObject(result?.usage)) {
        inputTokens += Number.isSafeInteger(result.usage.input_tokens) ? result.usage.input_tokens : 0;
        outputTokens += Number.isSafeInteger(result.usage.output_tokens) ? result.usage.output_tokens : 0;
      }
    } catch { failedBatches++; /* unevaluated facts are left absent = "未评估" */ }
  }
  const tally = scoreSample(sample.facts, verdicts);
  return { compactionId: sample.compactionId, ...tally,
    cost: { inputTokens, outputTokens, requests, failedBatches } };
}

// CLI entry: only runs when invoked directly, never on import.
async function main(argv) {
  const target = argv[2];
  if (!target) { console.error('usage: node scripts/research/compaction-eval.mjs <fixture.json | dir>'); process.exitCode = 1; return; }
  let evaluate;
  try {
    const backend = createBackend({ config: () => resolveConfig({}) });
    evaluate = (input) => backend.evaluate(input);
  } catch (error) { console.error(`backend unavailable: ${error?.message ?? error}`); process.exitCode = 1; return; }
  const samples = await loadSamples(target);
  const report = [];
  for (const { file, sample } of samples) report.push({ file, ...(await evaluateSample(sample, evaluate)) });
  console.log(JSON.stringify({ samples: report.length, results: report }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) void main(process.argv);
