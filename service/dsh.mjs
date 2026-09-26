import { readFile } from 'node:fs/promises';
import { resolveConfig } from './config-store.mjs';
import { createBackend } from './backend.mjs';
import { createManagerRoutes } from './manager-api.mjs';
import { createSessionState } from './session-state.mjs';
import { createDangerGate, normalizeDangerRules } from './danger-gate.mjs';

export const name = 'dsh-decision-layer';
export const inject = ['tools', 'skills'];

export async function apply(ctx, options = {}) {
  const path = options.configPath;
  const backend = createBackend({ config: () => resolveConfig({ path }) });
  const sessions = createSessionState();
  const gate = createDangerGate({
    evaluate: (input, request) => backend.evaluate(input, request),
    sessions,
    rules: async () => normalizeDangerRules((await resolveConfig({ path })).dangerRules),
  });
  if (typeof ctx.on === 'function') {
    if (typeof ctx.tools.guard === 'function') ctx.tools.guard(exec => gate.guardReason(exec));
    const install = () => {
      const disposePre = ctx.on('tools/pre-execute', async (exec, next) => gate.preExecute(exec, next));
      const disposePost = ctx.on('tools/post-execute', async (exec, result, next) => {
        gate.observeResult(exec, result);
        return next();
      });
      return () => { disposePre?.(); disposePost?.(); };
    };
    if (typeof ctx.effect === 'function') ctx.effect(install);
    else install();
  }
  const rawSkill = await readFile(new URL('../skills/decision-layer/SKILL.md', import.meta.url), 'utf8');
  const content = rawSkill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  ctx.skills.register({ name: 'decision-layer', description: '显式发起结构化裁决，辅助明确边界的选择与评分。', content, source: 'bundled' });

  const output = { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] };
  ctx.tools.register({
    name: 'decision_evaluate', description: '对 state 和 questions 执行一次显式结构化裁决，不修改 agent 行为。',
    parameters: { type: 'object', required: ['state', 'questions'], properties: {
      state: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }, { type: 'array', items: {} }] },
      questions: { type: 'object', additionalProperties: { type: 'object', additionalProperties: true } },
    }, additionalProperties: false },
    output, timeoutMs: 25_000,
    execute: (args, exec) => backend.evaluate(args, { signal: exec.signal }),
  });
  ctx.tools.register({
    name: 'decision_check_connection', description: '向裁决端点发送一次轻量连通测试，不增加自动裁决指标。',
    parameters: { type: 'object', properties: {}, additionalProperties: false }, output, timeoutMs: 25_000,
    execute: async (_args, exec) => {
      const result = await backend.evaluate({ state: 'Connection test', questions: {
        connected: { type: 'noul', instructions: 'Is this a connection test?' },
      } }, { signal: exec.signal });
      return { connected: true, model: result.model, usage: result.usage };
    },
  });

  ctx.inject(['webServer'], web => {
    const unregister = createManagerRoutes({ path, sessions, backend, bindHost: web.webServer.host }).map(route => web.webServer.register(route));
    return () => unregister.forEach(dispose => dispose());
  });
}
