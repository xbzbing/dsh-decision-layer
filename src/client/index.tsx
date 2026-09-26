import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import { dictionaries, type TranslationKey } from './i18n.js';
import { DecisionPanel } from './panel.js';
import { ConfigForm } from './config-form.js';
import { installStyles } from './styles.js';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'dsh-decision-layer': TranslationKey }
  interface SlotMap { 'conversation.composer.dock': { kind: 'list'; scope: 'session' } }
}

interface ConfigProps extends PluginConfigViewProps { t: Translate<TranslationKey> }

export const inject = ['slots', 'locale'];

export function apply(ctx: Context) {
  ctx.effect(installStyles);
  ctx.effect(() => ctx.locale.register('dsh-decision-layer', dictionaries));
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'decision-layer-panel', order: 20,
    locale: 'dsh-decision-layer', registrant: 'dsh-decision-layer',
    inject: (sessionId: string) => ({ sessionId }),
  }, DecisionPanel));
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register(
    { name: 'plugins.bundle.config', key: 'dsh-decision-layer', locale: 'dsh-decision-layer' as const },
    (props: ConfigProps) => (props.view === 'summary' ? props.t('summary') : <ConfigForm t={props.t} />),
  ));
}

export { ConfigForm };
