import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import { dictionaries, type TranslationKey } from './i18n.js';
import { DecisionPanel } from './panel.js';
import { AnalysisView } from './analysis-view.js';
import { ConfigForm } from './config-form.js';
import { installStyles } from './styles.js';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'dsh-decision-layer': TranslationKey }
  interface SlotMap { 'conversation.composer.dock': { kind: 'list'; scope: 'session' } }
}

interface ConfigProps extends PluginConfigViewProps { t: Translate<TranslationKey> }

export const inject = ['slots', 'locale'];

export function apply(ctx: Context) {
  const t = ctx.locale.bind('dsh-decision-layer') as Translate<TranslationKey>;
  ctx.effect(installStyles);
  ctx.effect(() => ctx.locale.register('dsh-decision-layer', dictionaries));
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'decision-layer-panel', order: 20,
    locale: 'dsh-decision-layer', registrant: 'dsh-decision-layer',
    inject: (sessionId: string) => ({ sessionId }),
  }, DecisionPanel));
  // Session-scoped "Decision analysis" tab in the conversation view. The tab is
  // read-only over the persisted logs and append-only for annotations; it never
  // touches the agent loop. Registration rides the slot effect wrapper, so
  // unloading the plugin removes the tab. `slots.inject` tolerates a key that no
  // host has declared (a host without the conversation view simply never renders
  // the entry), so this degrades to just the composer-dock panel there.
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view', id: 'decision-layer-analysis', order: 40,
    locale: 'dsh-decision-layer', registrant: 'dsh-decision-layer',
    label: () => t('analysisTab'),
    inject: (sessionId: string) => ({ sessionId }),
  }, AnalysisView));
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register(
    { name: 'plugins.bundle.config', key: 'dsh-decision-layer', locale: 'dsh-decision-layer' as const },
    (props: ConfigProps) => (props.view === 'summary' ? props.t('summary') : <ConfigForm t={props.t} />),
  ));
}

export { ConfigForm, AnalysisView };
