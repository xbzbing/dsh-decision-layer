export const dictionaries = {
  zh: {
    button: '决策层', title: '介入面板', close: '关闭', metrics: '自动裁决',
    empty: '尚无自动裁决。手动裁决不计入这里。', attempts: '评估次数', failures: '失败回退', suggestions: '模型建议（放行 / 询问 / 拒绝）', actual: '实际宿主结果（放行 / 拒绝）', settings: '会话设置',
    enabled: '启用自动介入', future: '当前版本尚无自动介入功能；开关只保存本会话的偏好。',
    backend: '裁决后端', url: '服务地址', model: '模型', key: 'API Key',
    keyHint: '留空则保留已保存的 Key；若未保存，会回落到环境变量。',
    removeKey: '清除已保存的 Key', save: '保存配置', probe: '测试连接',
    saved: '配置已保存', connected: '连接成功', unavailable: '连接不可用', error: '操作失败，请重试。',
    loading: '正在读取会话状态', capacity: '会话状态容量已满：此会话自动介入已暂停；操作仍受宿主权限策略约束。',
    destination: '裁决时会向以下后端发送必要的评估上下文：',
    httpWarning: '此地址使用未加密的 HTTP。确认后，API Key 与评估上下文将以明文发送至该地址。',
  },
  en: {
    button: 'Decision layer', title: 'Intervention panel', close: 'Close', metrics: 'Automatic decisions',
    empty: 'No automatic decisions yet. Manual verdicts are not counted here.', attempts: 'Evaluations', failures: 'Fallback failures', suggestions: 'Model suggestions (allow / ask / deny)', actual: 'Actual host outcomes (allow / deny)', settings: 'Session settings',
    enabled: 'Enable automatic interventions', future: 'No automatic interventions are available yet; this saves your session preference.',
    backend: 'Decision backend', url: 'Server URL', model: 'Model', key: 'API key',
    keyHint: 'Leave blank to keep the saved key or use an environment credential.',
    removeKey: 'Clear saved API key', save: 'Save configuration', probe: 'Test connection',
    saved: 'Configuration saved', connected: 'Connected', unavailable: 'Connection unavailable', error: 'Request failed. Please retry.',
    loading: 'Loading session settings', capacity: 'Session capacity reached: automatic intervention is paused here; host permission rules still apply.',
    destination: 'Decisions send the necessary evaluation context to this backend:',
    httpWarning: 'This address uses unencrypted HTTP. Your API key and evaluation context will be sent in plaintext to this address.',
  },
} as const;

export type TranslationKey = keyof typeof dictionaries.zh;
