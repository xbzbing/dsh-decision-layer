import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import { dictionaries, type TranslationKey } from './i18n.js';
import { DecisionPanel } from './panel.js';
import { installStyles } from './styles.js';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'dsh-decision-layer': TranslationKey }
  interface SlotMap { 'conversation.input.left': { kind: 'list'; scope: 'session' } }
}

export const inject = ['slots', 'locale'];

export function apply(ctx: Context) {
  ctx.effect(installStyles);
  ctx.effect(() => ctx.locale.register('dsh-decision-layer', dictionaries));
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'decision-layer-panel', order: 20,
    locale: 'dsh-decision-layer', registrant: 'dsh-decision-layer',
    inject: (sessionId: string) => ({ sessionId }),
  }, DecisionPanel));
}
