import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDecisionContext, decisionText } from '../lib/host/decision-context.js';

const text = (role, value, kind = role === 'user' ? 'user' : undefined, id) =>
  ({ role, content: [{ type: 'text', text: value }], ...(kind ? { source: { kind } } : {}), ...(id ? { id } : {}) });
const fixture = (initial = []) => {
  const history = [...initial];
  const agent = { session: { id: 'context-session', deriveMessages: () => history } };
  const context = createDecisionContext();
  return { history, agent, context };
};
const tools = (id, name, result, args = {}) => [
  { id: `assistant-${id}`, role: 'assistant', content: [{ type: 'tool-call', id, name, arguments: JSON.stringify(args) }] },
  { id: `result-${id}`, role: 'tool', toolCallId: id, source: { kind: 'tool', callId: id }, content: [{ type: 'text', text: result }] },
];

test('task provenance rejects injected user messages and supports legacy plain user messages', () => {
  const request = messages => {
    const { agent, context } = fixture();
    context.enter(agent, { turn: 1, messages });
    return context.snapshot(agent).context.request;
  };
  for (const kind of ['time-context', 'runtime-context', 'plugin:openviking-memory', 'plugin:decision-layer', 'background-job']) {
    assert.equal(request([text('user', 'not a request', kind)]), '');
  }
  assert.equal(request([text('user', '真正要求'), text('user', 'injected', 'time-context')]), '真正要求');
  assert.equal(request([{ role: 'user', content: [{ type: 'text', text: '<system-reminder>hidden</system-reminder>修复问题' }] }]), '修复问题');
});

test('a short follow-up carries previous task/reply without promoting injected messages', () => {
  const f = fixture([text('user', '修复登录测试', 'user', 'u0'), text('assistant', '先定位错误再修复', undefined, 'a0')]);
  f.context.enter(f.agent, { turn: 2, step: 1, messages: [text('user', '继续')] });
  f.history.push(text('user', '继续'), text('assistant', '正在排查'), text('user', 'Time sampled ...', 'time-context'));
  const snapshot = f.context.snapshot(f.agent);
  assert.equal(snapshot.context.request, '继续');
  assert.match(JSON.stringify(snapshot.context.background), /修复登录测试/);
  assert.doesNotMatch(JSON.stringify(snapshot.context), /Time sampled/);
  assert.equal(snapshot.conditionsText, '继续');
});

test('a long assistant reply keeps its ending so a short follow-up can resolve', () => {
  // The old head-only excerpt kept the summary but lost the closing question the
  // user's "补上" was answering, which is what made the self-check low-confidence.
  const reply = `开头摘要。${'中间细节。'.repeat(300)}\n之前那个失败了的独立复核还没有重做，需要我现在补上吗？`;
  const f = fixture([text('user', 'rebase 分支', 'user', 'u0'), text('assistant', reply, undefined, 'a0')]);
  f.context.enter(f.agent, { turn: 2, step: 1, messages: [text('user', '补上')] });
  const background = f.context.snapshot(f.agent).context.background;
  const assistant = background.find(item => item.role === 'assistant');
  assert.ok(assistant);
  assert.match(assistant.text, /需要我现在补上吗/);
  assert.ok(Buffer.byteLength(assistant.text) <= 512, 'the assistant excerpt stays within its byte budget');
  assert.match(background.find(item => item.role === 'user').text, /rebase 分支/, 'the user side still keeps its head');
});

test('only tools after the current turn boundary become evidence and real results join by call id', () => {
  const f = fixture([text('user', '旧任务', 'user', 'old'), ...tools('old-tool', 'bash', 'old success')]);
  f.context.enter(f.agent, { turn: 2, step: 1, messages: [text('user', '1. 修改配置\n2. 运行测试')] });
  f.history.push(text('user', '1. 修改配置\n2. 运行测试'), ...tools('test', 'bash', 'all tests passed TOKEN=hidden-value', { command: 'npm test' }));
  const snapshot = f.context.snapshot(f.agent);
  assert.equal(snapshot.evidence.length, 1);
  assert.equal(snapshot.evidence[0].tool, 'bash');
  assert.equal(snapshot.evidence[0].command, 'npm test');
  assert.match(snapshot.evidence[0].result, /all tests passed/);
  assert.doesNotMatch(JSON.stringify(snapshot), /hidden-value|old success/);
  assert.match(snapshot.conditionsText, /1\. 修改配置\n2\. 运行测试/);
});

test('raw file and network results are not exported as evidence summaries', () => {
  const f = fixture();
  f.context.enter(f.agent, { turn: 1, step: 1, messages: [text('user', '检查文件')] });
  f.history.push(...tools('read', 'read', 'private file body', { path: '/tmp/test.txt' }), ...tools('web', 'web_fetch', 'untrusted page'));
  const snapshot = f.context.snapshot(f.agent);
  assert.equal(snapshot.evidence.length, 2);
  assert.equal(snapshot.evidence[0].path, '/tmp/test.txt');
  assert.doesNotMatch(JSON.stringify(snapshot), /private file body|untrusted page/);
});

test('rewind or compaction invalidating the anchor drops evidence conservatively', () => {
  const f = fixture([text('user', '旧任务', 'user', 'old'), text('assistant', '完成', undefined, 'anchor')]);
  f.context.enter(f.agent, { turn: 2, step: 1, messages: [text('user', '新任务')] });
  f.history.splice(0, f.history.length, text('user', '压缩摘要', 'compact-checkpoint'), ...tools('old', 'bash', 'unrelated success'));
  assert.deepEqual(f.context.snapshot(f.agent).evidence, []);
});

test('new task input is distinguished from notifications within one turn', () => {
  const f = fixture();
  assert.equal(f.context.enter(f.agent, { turn: 1, step: 1, messages: [text('user', '修改代码')] }).changed, true);
  f.history.push(text('user', '修改代码'));
  assert.equal(f.context.enter(f.agent, { turn: 1, step: 2, messages: [text('user', 'job done', 'background-job')] }).changed, false);
  assert.equal(f.context.enter(f.agent, { turn: 1, step: 3, messages: [text('user', '也要检查网页')] }).changed, true);
  assert.equal(f.context.snapshot(f.agent).context.request, '也要检查网页');
  assert.equal(f.context.snapshot(f.agent).conditionsText, '也要检查网页', 'conditions follow the latest revision only');
});

test('UTF-8 budgets and masking apply before sending context', () => {
  const value = decisionText('<openviking-context>memory</openviking-context>令牌：abc123\n' + '文'.repeat(5000), 160);
  assert.ok(Buffer.byteLength(value) <= 160);
  assert.equal(value.includes('abc123\n'), false, 'the template placeholder is masked');
  assert.equal(value.includes('memory'), false, 'the injected block is stripped');
  assert.match(value, /令牌：\[redacted\]/, 'a labelled Chinese credential is masked, not merely cut');
  const f = fixture([text('user', '旧'.repeat(8000), 'user'), text('assistant', '前文'.repeat(8000))]);
  f.context.enter(f.agent, { turn: 1, step: 1, messages: [text('user', '新'.repeat(8000))] });
  const snapshot = f.context.snapshot(f.agent);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot.context)) <= 4096);
});

test('unavailable history is fail-open and does not produce fabricated evidence', () => {
  const agent = { session: { deriveMessages: () => { throw new Error('offline'); } } };
  const context = createDecisionContext();
  context.enter(agent, { turn: 1, step: 1, messages: [text('user', '修复测试')] });
  assert.equal(context.snapshot(agent).context.request, '修复测试');
  assert.deepEqual(context.snapshot(agent).evidence, []);
});

// The model-facing request field has its own small budget, while condition
// extraction still sees the fuller turn text (the old 8K ceiling), so a long
// numbered list does not lose its later conditions.
test('the model request field is capped while conditions keep the full latest request', async () => {
  const { extractConditions } = await import('../lib/host/task-completion.js');
  const long = Array.from({ length: 20 }, (_, i) => `${i + 1}. 条件${i}：${'做'.repeat(150)}`).join('\n');
  const f = fixture();
  f.context.enter(f.agent, { turn: 1, messages: [text('user', long)] });
  const snapshot = f.context.snapshot(f.agent);
  assert.ok(Buffer.byteLength(snapshot.context.request) <= 1536, 'the model request field stays small');
  assert.ok(snapshot.conditionsText.length > 1536, 'conditions see more than the model request field');
  assert.ok(extractConditions(snapshot.conditionsText).length >= 10, 'later numbered conditions survive');
});

test('a shell result excerpt masks opaque blobs but keeps a readable status line', () => {
  const f = fixture();
  f.context.enter(f.agent, { turn: 1, messages: [text('user', '跑测试')] });
  f.history.push(...tools('run', 'bash', 'Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0Lz plus 1 failing', { command: 'npm test' }));
  const [item] = f.context.snapshot(f.agent).evidence;
  assert.doesNotMatch(item.result, /Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0Lz/);
  assert.match(item.result, /1 failing/);
});

// A steer is our own supplemental prompt. It carries kind:user for host
// compatibility, so provenance must drop it by identity or the next pass would
// judge tools against "please double-check your answer" instead of the request.
test('a message this plugin steered is not treated as the user request', () => {
  const steered = new Set(['steer-1']);
  const context = createDecisionContext({ ignored: id => steered.has(id) });
  const history = [text('user', '修复登录测试', 'user', 'u0')];
  const agent = { session: { id: 'steer-session', deriveMessages: () => history } };
  context.enter(agent, { turn: 2, messages: [text('user', '本回合自检得分偏低：请复核', 'user', 'steer-1')] });
  history.push(text('user', '本回合自检得分偏低：请复核', 'user', 'steer-1'));
  const snapshot = context.snapshot(agent);
  assert.equal(snapshot.context.request, '', 'the steered prompt never becomes the task');
  assert.equal(snapshot.conditionsText, '', 'and the earlier task is not borrowed as this turn\'s request');
  assert.match(JSON.stringify(snapshot.context.background), /修复登录测试/, 'it stays visible as background only');
});

// Two consecutive assistant updates must not crowd the user's task out of the
// background: a short "继续" would otherwise judge tools against nothing.
test('background keeps the latest user task even after several assistant updates', () => {
  const f = fixture([
    text('user', '修复登录测试并验证网页', 'user'),
    text('assistant', '开始定位'),
    text('assistant', '实现了一部分，接着排查'),
  ]);
  f.context.enter(f.agent, { turn: 2, messages: [text('user', '继续')] });
  const { context } = f.context.snapshot(f.agent);
  assert.equal(context.request, '继续');
  assert.deepEqual(context.background.map(item => item.role), ['user', 'assistant']);
  assert.match(context.background[0].text, /修复登录测试并验证网页/);
  assert.match(context.background[1].text, /实现了一部分/);
});

// A turn that started from an empty history has no anchor to re-verify; a later
// compaction marker inside the window must still stop evidence collection.
test('replacement markers inside an unanchored window drop earlier evidence', () => {
  const f = fixture();
  f.context.enter(f.agent, { turn: 1, messages: [text('user', '长任务')] });
  f.history.push(...tools('old', 'bash', 'old success'), text('user', '压缩摘要', 'compact-checkpoint'), ...tools('new', 'bash', 'new success'));
  const snapshot = f.context.snapshot(f.agent);
  assert.equal(snapshot.evidence.length, 1, 'only evidence after the checkpoint survives');
  assert.equal(snapshot.evidence[0].result, 'new success');
});

// A later request can cancel earlier work. Conditions must not accumulate across
// a turn's revisions or the completion check could push the agent to finish work
// the user explicitly dropped.
test('a cancelling request retires the earlier condition list', async () => {
  const { extractConditions } = await import('../lib/host/task-completion.js');
  const f = fixture();
  f.context.enter(f.agent, { turn: 1, messages: [text('user', '1. 删除旧产物\n2. 运行发布')] });
  f.history.push(text('user', '1. 删除旧产物\n2. 运行发布'));
  f.context.enter(f.agent, { turn: 1, messages: [text('user', '取消前面的任务，只做只读评审')] });
  f.history.push(text('user', '取消前面的任务，只做只读评审'));
  const snapshot = f.context.snapshot(f.agent);
  assert.equal(snapshot.conditionsText, '取消前面的任务，只做只读评审');
  assert.deepEqual(extractConditions(snapshot.conditionsText), [], 'the cancelled list yields no conditions');
  assert.match(JSON.stringify(snapshot.context.background), /删除旧产物/, 'the old list stays visible as background only');
});

// An additive follow-up is not merged either: with too few conditions in the
// latest revision the check skips, which is the safe direction.
test('an additive follow-up does not inherit the earlier numbered list', async () => {
  const { extractConditions } = await import('../lib/host/task-completion.js');
  const f = fixture();
  f.context.enter(f.agent, { turn: 1, messages: [text('user', '1. 改配置\n2. 跑测试')] });
  f.history.push(text('user', '1. 改配置\n2. 跑测试'));
  f.context.enter(f.agent, { turn: 1, messages: [text('user', '3. 补文档')] });
  f.history.push(text('user', '3. 补文档'));
  assert.deepEqual(extractConditions(f.context.snapshot(f.agent).conditionsText), ['补文档']);
});

// A history that could not be read when the turn opened must never be treated as
// "the turn began at index 0": after it recovers, old tools would otherwise become
// current evidence. Re-anchoring at the visible history drops everything older.
test('a history that failed at turn start is re-anchored, never backfilled', () => {
  let broken = true;
  const history = [text('user', '旧任务', 'user', 'u0'), ...tools('old', 'bash', 'old success')];
  const agent = { session: { id: 'recover-session', deriveMessages: () => { if (broken) throw new Error('down'); return history; } } };
  const context = createDecisionContext();
  context.enter(agent, { turn: 1, messages: [text('user', '新任务')] });
  broken = false;
  assert.deepEqual(context.snapshot(agent).evidence, [], 'an unreadable start yields no evidence');
  // A later real request re-anchors the window at the visible history.
  history.push(text('user', '补一条', 'user', 'u1'));
  context.enter(agent, { turn: 1, messages: [text('user', '补一条')] });
  history.push(...tools('new', 'bash', 'new success'));
  const snapshot = context.snapshot(agent);
  assert.equal(snapshot.evidence.length, 1, 'only evidence after the re-anchor is kept');
  assert.equal(snapshot.evidence[0].result, 'new success');
  assert.doesNotMatch(JSON.stringify(snapshot), /old success/);
});

test('a non-array history is unavailable, not empty', () => {
  const agent = { session: { id: 'weird-session', deriveMessages: () => ({ not: 'an array' }) } };
  const context = createDecisionContext();
  context.enter(agent, { turn: 1, messages: [text('user', '任务')] });
  assert.equal(context.snapshot(agent).context.request, '任务');
  assert.deepEqual(context.snapshot(agent).evidence, []);
});

// A turn opened purely by a host notice (schedule reminder, background job) has no
// request of its own; borrowing the previous turn's task would narrow tools and
// score the reply against work this turn never did.
test('a notice-only turn carries no request and no inherited task', () => {
  const f = fixture([text('user', '旧任务：修复登录', 'user', 'u0'), text('assistant', '完成')]);
  assert.equal(f.context.enter(f.agent, { turn: 2, messages: [text('job done', 'background-job')] }).changed, true);
  const snapshot = f.context.snapshot(f.agent);
  assert.equal(snapshot.context.request, '');
  assert.equal(snapshot.conditionsText, '');
  assert.match(JSON.stringify(snapshot.context.background), /修复登录/, 'the earlier task stays background only');
});

// The evidence window keeps the oldest calls as well as the newest, so an early
// edit that proves an early condition is not pushed out by a long test tail.
test('a long tool tail still keeps the earliest evidence', () => {
  const f = fixture();
  f.context.enter(f.agent, { turn: 1, messages: [text('user', '1. 改配置\n2. 跑测试')] });
  f.history.push(...tools('first', 'edit', 'patched config', { path: 'config.json' }));
  for (let i = 0; i < 20; i++) f.history.push(...tools(`tail-${i}`, 'bash', `test run ${i}`));
  const { evidence } = f.context.snapshot(f.agent);
  assert.equal(evidence[0].tool, 'edit', 'the earliest call survives the tail');
  assert.ok(evidence.length >= 12);
});
