import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TASK_EXCERPT_LIMIT, redactCredentials, taskExcerpt } from '../lib/host/excerpt.js';

// The excerpt is stored in local logs/snapshots for 30 days and rendered in the
// panel, so these cases are about what must never appear, not about cosmetic
// output. Every credential form below was either reported by review or is a
// variant of one that was.

test('injected host context is stripped before anything else', () => {
  assert.equal(taskExcerpt('修复登录页 <openviking-context>memory</openviking-context> 然后提交'), '修复登录页 然后提交');
  assert.equal(taskExcerpt('<system-reminder>internal</system-reminder> 部署说明'), '部署说明');
  assert.equal(taskExcerpt('重构登录 <openviking-context>unclosed tail'), '重构登录');
  assert.equal(taskExcerpt('<openviking-context><memory>nested</memory></openviking-context>'), undefined);
  assert.equal(taskExcerpt('a <OPENVIKING-CONTEXT data-x="1">b</OPENVIKING-CONTEXT> c'), 'a c');
  assert.equal(taskExcerpt('<system-reminder>only</system-reminder>'), undefined, 'only injected context yields no excerpt');
});

test('labeled credentials are masked, including full-width colons and Chinese keys', () => {
  assert.equal(taskExcerpt('deploy TOKEN=abc123 done'), 'deploy TOKEN=[redacted] done');
  assert.equal(taskExcerpt('token：sk-live-abc123def'), 'token：[redacted]');
  assert.equal(taskExcerpt('密码：abc123'), '密码：[redacted]');
  assert.equal(taskExcerpt('令牌：{{SECRET_orw5ldcq}}'), '令牌：[redacted]');
  assert.equal(taskExcerpt('部署令牌 {{SECRET_orw5ldcq}} 完成'), '部署令牌 [redacted] 完成');
  assert.equal(taskExcerpt('api_key = "sk-live-93c9dd5ff"'), 'api_key = [redacted]');
  assert.equal(taskExcerpt('{"api_key":"sk-live-93c9dd5ff","name":"x"}'), '{"api_key":[redacted],"name":"x"}');
  assert.equal(taskExcerpt('Cookie: sid=abc; theme=dark'), 'Cookie: [redacted]');
  assert.equal(taskExcerpt('x-api-key: abc123'), 'x-api-key: [redacted]');
  assert.equal(taskExcerpt('token=abc123，然后部署'), 'token=[redacted]，然后部署', 'full-width punctuation ends the value too');
  assert.equal(taskExcerpt('密码：secret123；随后重启'), '密码：[redacted]；随后重启');
});

test('passphrase values keep their tail masked, not just the first word', () => {
  assert.equal(taskExcerpt('password: correct horse battery staple'), 'password: [redacted]');
  assert.equal(taskExcerpt('密码：正确的马电池订书钉'), '密码：[redacted]');
  assert.equal(taskExcerpt('secret: abc, next step'), 'secret: [redacted], next step', 'a clause separator ends the value');
});

test('copula forms mask the value instead of the copula', () => {
  assert.equal(taskExcerpt('the token is sk-proj-93c9dd5ff9a14b7c'), 'the token is [redacted]');
  assert.equal(taskExcerpt('token 是 sk-live-abc'), 'token 是 sk-[redacted]');
  assert.equal(taskExcerpt('密码是abc123').includes('abc123'), false);
  // Ordinary prose must survive: the tail does not look like a credential.
  assert.equal(taskExcerpt('the password is not set'), 'the password is not set');
  assert.equal(taskExcerpt('密码是必填项'), '密码是必填项');
});

test('URL userinfo, CLI flags and headers are covered', () => {
  assert.equal(taskExcerpt('DATABASE_URL=postgres://admin:pa55w0rd@db:5432/x'), 'DATABASE_URL=postgres://[redacted]@db:5432/x');
  assert.equal(taskExcerpt('redis://:pw0rd@cache:6379'), 'redis://[redacted]@cache:6379');
  assert.equal(taskExcerpt('run --token abc123 now'), 'run --token [redacted] now');
  assert.equal(taskExcerpt('run --api-key=abc123'), 'run --api-key=[redacted]');
  assert.equal(taskExcerpt('Authorization: Bearer\nsk-live-abc123def'), 'Authorization: [redacted]');
  assert.equal(taskExcerpt('Authorization: Bearer abc123').includes('abc123'), false);
});

test('unlabeled credentials with a recognizable shape are masked too', () => {
  // Built at runtime so the source does not contain a literal JWT prefix.
  const prefix = String.fromCharCode(101, 121, 74);
  const jwt = `${prefix}hbGciOiJIUzI1NiJ9.${prefix}zdWIiOiIxMjM0NTY3ODkwIn0.q0hrmlS7nLSi`;
  assert.equal(taskExcerpt('use ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'), 'use ghp_[redacted]');
  assert.equal(taskExcerpt('key AKIAIOSFODNN7EXAMPLE'), 'key AKIA[redacted]');
  assert.equal(taskExcerpt(`jwt ${jwt}`), 'jwt [redacted]');
  assert.equal(taskExcerpt('key glpat-ABCDEFGHIJKLMNOP'), 'key glpat-[redacted]');
  assert.equal(taskExcerpt('slack xoxb-1234567890-abcdefghij'), 'slack xoxb-[redacted]');
});

test('the excerpt is idempotent, bounded and safely typed', () => {
  const masked = 'token=[redacted] 密码：[redacted] Authorization: [redacted]';
  assert.equal(taskExcerpt(masked), masked, 're-masking an already masked excerpt changes nothing');
  assert.equal(taskExcerpt('文'.repeat(900))?.length, TASK_EXCERPT_LIMIT);
  assert.equal(taskExcerpt('文'.repeat(512))?.length, 512);
  assert.equal(taskExcerpt('x'.repeat(600), 10), 'xxxxxxxxxx');
  assert.equal(taskExcerpt(undefined), undefined);
  assert.equal(taskExcerpt(42), undefined);
  assert.equal(taskExcerpt('   \n  '), undefined);
  assert.equal(taskExcerpt('帮我\n  重构   登录模块'), '帮我 重构 登录模块');
});

test('redactCredentials is the shared boundary and is itself idempotent', () => {
  const input = 'password: correct horse battery staple\nAuthorization: Bearer abc123';
  const once = redactCredentials(input);
  assert.equal(once.includes('horse'), false);
  assert.equal(once.includes('abc123'), false);
  assert.equal(redactCredentials(once), once);
});

test('environment-style keys whose label is a suffix are masked', () => {
  // `\b` cannot match across `_`, so these need the dedicated env rule.
  assert.equal(taskExcerpt('PASSWORD=hunter2'), 'PASSWORD=[redacted]');
  assert.equal(taskExcerpt('AWS_SECRET_ACCESS_KEY=abc123xyz'), 'AWS_SECRET_ACCESS_KEY=[redacted]');
  assert.equal(taskExcerpt('DB_PASSWORD=s3cr3t next step'), 'DB_PASSWORD=[redacted] next step');
  // A Chinese clause after the value must survive (the value stops at the comma).
  assert.equal(taskExcerpt('token=ghp_secret，然后汇报'), 'token=[redacted]，然后汇报');
});
