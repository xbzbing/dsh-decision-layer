const css = `
.decision-trigger{position:relative;display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:14rem;border:none;border-radius:var(--dsw-radius-sm,6px);background:0 0;color:var(--dsw-alias-label-tertiary,#77818b);padding:1px 8px;font:inherit;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);font-weight:400;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer}
.decision-trigger:hover,.decision-trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,#eef1f3);color:var(--dsw-alias-label-secondary,#59636e)}
.decision-trigger-icon{flex:none;color:inherit}
/* Quality-trend severity on the radar-triangle icon. Only the icon is tinted, via
   a CSS variable so light/dark are one pair of overrides. Multimodal: the tooltip
   text and the icon shape carry the meaning too, not color alone. First version
   is color-only; a pulse animation is added later behind prefers-reduced-motion. */
.decision-trend-warn .decision-trigger-icon{color:var(--decision-trend-warn,#c98a1e)}
.decision-trend-severe .decision-trigger-icon{color:var(--decision-trend-severe,#c0392b)}
@media (prefers-color-scheme:dark){
  .decision-trend-warn .decision-trigger-icon{color:var(--decision-trend-warn,#e0a83e)}
  .decision-trend-severe .decision-trigger-icon{color:var(--decision-trend-severe,#f0645a)}
}
.decision-trigger-text{min-width:0;flex:0 1 auto;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}
.decision-trigger-text b{color:inherit;font-weight:500;font-variant-numeric:tabular-nums}
.decision-trigger:focus-visible,.decision-dialog button:focus-visible,.decision-dialog input:focus-visible,.decision-config input:focus-visible,.decision-config button:focus-visible{outline:2px solid #1f5d50;outline-offset:2px}
.decision-dialog{box-sizing:border-box;flex-direction:column;width:min(46rem,calc(100vw - 2rem));max-height:min(74vh,40rem);border:1px solid var(--dsw-alias-border-l2,#dce1e6);border-radius:14px;padding:0;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#202124);box-shadow:0 1rem 3rem rgba(0,0,0,.18);font:inherit}
.decision-dialog[open]{display:flex}
.decision-dialog::backdrop{background:rgba(0,0,0,.45)}
.decision-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.7rem 1.1rem;border-bottom:1px solid var(--dsw-alias-border-l2,#eceff1)}
.decision-head h2{font-size:1.05rem;margin:0}
.decision-head button{border:0;background:transparent;color:inherit;font:inherit;font-size:1.5rem;cursor:pointer;border-radius:8px;width:2rem;height:2rem}
.decision-body{flex:1 1 auto;overflow:auto;padding:0 1.1rem .8rem}
.decision-dialog section{border-top:1px solid var(--dsw-alias-border-l2,#eceff1);margin-top:.8rem;padding-top:.8rem}
.decision-body>section:first-child{border-top:0;margin-top:0;padding-top:.8rem}
.decision-dialog h3{font-size:.9rem;margin:0 0 .55rem}
.decision-dialog p{font-size:.84rem;line-height:1.5;margin:.35rem 0}
.decision-muted{color:var(--dsw-alias-label-secondary,#59636e);font-size:.76rem;line-height:1.5}
.decision-empty{color:var(--dsw-alias-label-secondary,#59636e);font-size:.82rem;padding:.6rem .8rem;border:1px dashed var(--dsw-alias-border-l2,#dce1e6);border-radius:10px}
.decision-cards{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
.decision-card{border:1px solid var(--dsw-alias-border-l2,#e6eaee);border-radius:12px;padding:.85rem .95rem;background:linear-gradient(180deg,var(--dsw-alias-bg-layer-2,#fff),var(--dsw-alias-bg-layer-1,#fafbfc))}
.decision-card-wide{grid-column:1 / -1}
.decision-card-head{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem;margin-bottom:.6rem}
.decision-card-title{font-size:.8rem;font-weight:600;color:var(--dsw-alias-label-secondary,#59636e);letter-spacing:.02em}
.decision-card-total{font-size:1.5rem;font-weight:700;line-height:1;color:var(--dsw-alias-label-primary,#202124);font-variant-numeric:tabular-nums}
.decision-card-total small{font-size:.7rem;font-weight:500;color:var(--dsw-alias-label-tertiary,#77818b);margin-left:.15rem}
.decision-card-head-metrics{display:flex;align-items:baseline;gap:.6rem}
.decision-card-rate-inline{font-size:.76rem;color:var(--dsw-alias-label-secondary,#59636e);white-space:nowrap}
.decision-card-rate-inline b{color:var(--dsw-alias-label-primary,#202124);font-variant-numeric:tabular-nums;margin-left:.2rem;font-weight:600}
.decision-bar{display:flex;height:8px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-bg-layer-1,#eef1f3)}
.decision-bar-empty{background:var(--dsw-alias-bg-layer-1,#eef1f3)}
.decision-bar-allow{background:#1f8a70}
.decision-bar-ask{background:#c98a1e}
.decision-bar-deny{background:#c0392b}
.decision-legend{list-style:none;display:flex;flex-wrap:wrap;gap:.4rem 1rem;margin:.6rem 0 0;padding:0}
.decision-legend li{display:flex;align-items:center;gap:.35rem;font-size:.78rem;color:var(--dsw-alias-label-secondary,#59636e)}
.decision-legend b{color:var(--dsw-alias-label-primary,#202124);font-variant-numeric:tabular-nums}
.decision-legend-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.decision-dot-allow{background:#1f8a70}
.decision-dot-ask{background:#c98a1e}
.decision-dot-deny{background:#c0392b}
.decision-card-foot{display:flex;justify-content:space-between;gap:1rem;margin-top:.7rem;padding-top:.6rem;border-top:1px solid var(--dsw-alias-border-l2,#eef1f3);font-size:.76rem;color:var(--dsw-alias-label-secondary,#59636e)}
.decision-card-foot b{color:var(--dsw-alias-label-primary,#202124);font-variant-numeric:tabular-nums;margin-left:.3rem}
.decision-card-stats{display:flex;gap:.6rem}
.decision-stat{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:.2rem;padding:.5rem .3rem;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#f6f8fa)}
.decision-stat-num{font-size:1.35rem;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,#202124)}
.decision-stat-pct{font-size:.74rem;font-weight:600;line-height:1;color:var(--dsw-alias-label-tertiary,#77818b);font-variant-numeric:tabular-nums}
.decision-stat-warn{color:#c98a1e}
.decision-stat-muted{color:var(--dsw-alias-label-tertiary,#9aa5b1)}
.decision-stat-label{font-size:.72rem;color:var(--dsw-alias-label-secondary,#59636e)}
.decision-log{list-style:none;margin:0;padding:0;display:grid;gap:.5rem;max-height:13rem;overflow:auto}
.decision-log-item{display:flex;align-items:baseline;gap:.6rem;font-size:.8rem;padding-left:.6rem;border-left:2px solid var(--dsw-alias-border-l2,#dce1e6);line-height:1.5}
.decision-log-item.decision-log-deny{border-left-color:#c0392b}
.decision-log-item.decision-log-error,.decision-log-item.decision-log-warn{border-left-color:#c98a1e}
.decision-log-item.decision-log-ok{border-left-color:#1f8a70}
.decision-log-item.decision-log-muted{border-left-color:var(--dsw-alias-border-l2,#dce1e6)}
.decision-log-time{color:var(--dsw-alias-label-tertiary,#77818b);font-variant-numeric:tabular-nums;flex:0 0 auto}
.decision-log-body{color:var(--dsw-alias-label-primary,#202124);flex:1 1 auto;min-width:0}
.decision-rate{flex:0 0 auto;display:inline-flex;gap:1px;align-self:center}
.decision-rate-btn{display:inline-flex;align-items:center;justify-content:center;width:1.55rem;height:1.55rem;border:1px solid transparent;background:0 0;border-radius:7px;padding:0;cursor:pointer;color:var(--dsw-alias-label-tertiary,#9aa5b1);transition:color .12s,background .12s}
.decision-rate-btn:hover{color:var(--dsw-alias-label-secondary,#59636e);background:var(--dsw-alias-interactive-bg-hover,#eef1f3)}
.decision-rate-btn.decision-rate-on{background:var(--dsw-alias-interactive-bg-hover,#eef1f3)}
.decision-rate-btn.decision-rate-good{color:#1f8a70}
.decision-rate-btn.decision-rate-bad{color:#c0392b}
.decision-rate-btn.decision-rate-unsure{color:#c98a1e}
.decision-rate-summary{margin-top:.5rem}
.decision-log-tool{font-size:.76rem;padding:.05rem .35rem;border-radius:5px;background:var(--dsw-alias-bg-layer-1,#f2f4f6);color:var(--dsw-alias-label-primary,#202124)}
.decision-log-verdict{font-weight:600}
.decision-log-deny .decision-log-verdict{color:#c0392b}
.decision-log-ok .decision-log-verdict{color:#1f8a70}
.decision-log-warn .decision-log-verdict{color:#c98a1e}
.decision-log-detail{color:var(--dsw-alias-label-secondary,#59636e)}
/* A low-confidence low score is noise: its verdict is shown muted (not the amber
   warn accent) and a "noise, ignore" tag hangs off the row so it never reads as a
   real quality dip. */
.decision-log-muted-verdict{font-weight:600;color:var(--dsw-alias-label-tertiary,#9aa5b1)}
.decision-log-muted .decision-log-time{opacity:.75}

.decision-status{display:flex;align-items:center;gap:.5rem;margin-top:.7rem;font-size:.82rem}
.decision-status-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:#9aa5b1}
.decision-status-ok{background:#1f8a70}
.decision-status-down{background:#c0392b}
.decision-status-checking{background:#c98a1e}
.decision-status-idle{background:#9aa5b1}
.decision-status-label{color:var(--dsw-alias-label-secondary,#59636e)}
.decision-status-recheck{margin-left:auto;border:1px solid var(--dsw-alias-border-l2,#ccd3da);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#59636e);padding:.15rem .55rem;font:inherit;font-size:.76rem;cursor:pointer}
.decision-status-recheck:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1,#f2f4f6);color:var(--dsw-alias-label-primary,#202124)}
.decision-status-recheck:disabled{opacity:.5;cursor:default}

.decision-config{display:grid;gap:0;color:var(--dsw-alias-label-primary,#202124);container-type:inline-size}
.decision-config section{margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--dsw-alias-border-l2,#eceff1)}
.decision-config section:first-child{margin-top:0;padding-top:0;border-top:0}
.decision-config h3{font-size:1rem;font-weight:600;margin:0 0 .7rem;display:flex;align-items:center;gap:.55rem}
.decision-head-icon{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:1.7rem;height:1.7rem;border-radius:8px}
.decision-head-icon-features{color:#1f8a70;background:rgba(31,138,112,.14)}
.decision-head-icon-advanced{color:#c98a1e;background:rgba(201,138,30,.16)}
.decision-head-icon-backend{color:#5b6ee1;background:rgba(91,110,225,.15)}
.decision-collapse{margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--dsw-alias-border-l2,#eceff1)}
.decision-collapse-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;list-style:none;cursor:pointer;border-radius:8px}
.decision-collapse-head::-webkit-details-marker{display:none}
.decision-collapse-head h3{margin:0}
.decision-collapse-head:hover h3{color:var(--dsw-alias-label-primary,#202124)}
.decision-collapse-head:focus-visible{outline:2px solid #1f5d50;outline-offset:2px}
.decision-collapse-icon{flex:0 0 auto;position:relative;width:1.6rem;height:1.6rem;border:1px solid var(--dsw-alias-border-l2,#ccd3da);border-radius:8px}
.decision-collapse-icon::before,.decision-collapse-icon::after{content:"";position:absolute;top:50%;left:50%;background:var(--dsw-alias-label-secondary,#59636e);transform:translate(-50%,-50%)}
.decision-collapse-icon::before{width:.7rem;height:1.5px}
.decision-collapse-icon::after{width:1.5px;height:.7rem;transition:transform .15s ease,opacity .15s ease}
.decision-collapse[open] .decision-collapse-icon::after{transform:translate(-50%,-50%) scaleY(0);opacity:0}
.decision-collapse-body{margin-top:.7rem}
.decision-config p{font-size:.84rem;line-height:1.6;margin:.45rem 0}
.decision-destination{display:flex;flex-direction:column;gap:.25rem;align-items:flex-start}
.decision-destination code{font-size:.78rem;padding:.15rem .4rem;border-radius:6px;background:var(--dsw-alias-bg-layer-1,#f2f4f6);color:var(--dsw-alias-label-primary,#202124);word-break:break-all}
.decision-config form{display:grid;gap:1rem;margin-top:.8rem}
.decision-field{display:grid;gap:.4rem;font-size:.82rem;font-weight:600}
.decision-field .decision-muted{font-weight:400;margin:.1rem 0 0}
.decision-config input:not([type=checkbox]){box-sizing:border-box;width:100%;min-height:2.4rem;border:1px solid var(--dsw-alias-border-l2,#ccd3da);border-radius:8px;padding:.4rem .7rem;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;font:inherit;font-weight:400}
.decision-config input:not([type=checkbox]):disabled{background:var(--dsw-alias-bg-layer-1,#f6f8fa);opacity:.7}
.decision-config textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2,#ccd3da);border-radius:8px;padding:.4rem .7rem;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;font:inherit;font-weight:400;resize:vertical;min-height:3.4rem}
.decision-config textarea:disabled{background:var(--dsw-alias-bg-layer-1,#f6f8fa);opacity:.7}
.decision-field-textarea{margin-top:.7rem}
.decision-field-inline{margin-top:.7rem}
.decision-narrow-cap{width:6rem!important}
.decision-prefixes{font-family:var(--dsw-alias-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)!important;line-height:1.5}

.decision-field-block{display:grid;gap:.35rem}
.decision-field-block+.decision-field-block{margin-top:1.1rem}
.decision-field-block .decision-muted{font-weight:400;margin:0}
.decision-advanced-grid{display:grid;grid-template-columns:1fr;gap:1.1rem;align-items:start;justify-content:start}
.decision-advanced-grid .decision-field-block+.decision-field-block{margin-top:0}
@container (min-width:34rem){.decision-advanced-grid{grid-template-columns:repeat(2,minmax(0,28rem));column-gap:2rem}}
.decision-subhead{font-size:.86rem;font-weight:600;color:var(--dsw-alias-label-secondary,#59636e)}
.decision-toggle{display:flex;align-items:center;justify-content:space-between;gap:1rem;font-size:.86rem;font-weight:600;cursor:pointer}
.decision-toggle-text{flex:1 1 auto}
.decision-toggle-box{position:relative;display:inline-flex;flex:0 0 auto;width:38px;height:22px}
.decision-toggle-input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.decision-toggle-input:disabled{cursor:default}
.decision-toggle-track{box-sizing:border-box;position:absolute;inset:0;width:38px;height:22px;border:1px solid var(--dsw-alias-border-l2,#ccd3da);border-radius:999px;background:var(--dsw-alias-bg-layer-1,#f2f4f6);transition:background .15s ease,border-color .15s ease;pointer-events:none}
.decision-toggle-track::after{content:"";position:absolute;top:50%;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transform:translateY(-50%);transition:transform .15s ease}
.decision-toggle-input:checked+.decision-toggle-track{background:#1f5d50;border-color:#1f5d50}
.decision-toggle-input:checked+.decision-toggle-track::after{transform:translate(16px,-50%)}
.decision-toggle-input:disabled+.decision-toggle-track{opacity:.5}
.decision-toggle-input:focus-visible+.decision-toggle-track{outline:2px solid #1f5d50;outline-offset:2px}

.decision-actions{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-top:.2rem}
.decision-actions button{border:1px solid #1f4038;border-radius:8px;background:#1f4038;color:#fff;padding:.5rem .9rem;font:inherit;font-size:.83rem;font-weight:500;cursor:pointer}
.decision-actions .decision-secondary{background:transparent;color:#1f4038}
.decision-actions .decision-secondary:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1,#f2f4f6)}
.decision-actions button:disabled{opacity:.5;cursor:not-allowed}
.decision-probe-result{font-size:.82rem;font-weight:500}
.decision-danger-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-top:1rem;padding-top:1rem;border-top:1px dashed var(--dsw-alias-border-l2,#dce1e6)}
.decision-danger-text{display:grid;gap:.25rem;min-width:0}
.decision-danger-title{font-size:.84rem;font-weight:600;color:var(--dsw-alias-label-primary,#202124)}
.decision-danger-text .decision-muted{font-weight:400}
.decision-danger-button{flex:0 0 auto;border:1px solid #c0392b;border-radius:8px;background:transparent;color:#c0392b;padding:.4rem .9rem;font:inherit;font-size:.82rem;font-weight:500;cursor:pointer}
.decision-danger-button:hover:not(:disabled){background:#fdecea}
.decision-danger-button:disabled{opacity:.5;cursor:not-allowed}
.decision-danger-button:focus-visible{outline:2px solid #c0392b;outline-offset:2px}
.decision-message{font-size:.82rem;margin:.2rem 0 0}
.decision-message-ok{color:#1f6f57}
.decision-message-warn{color:#9d4b1f}
/* Conversation-view "Decision analysis" tab. It reuses the card / stat / log
   primitives above; this block only supplies the scroll container and section
   rhythm, since the tab is not inside the modal's .decision-body wrapper. */
.decision-analysis{height:100%;overflow:auto;color:var(--dsw-alias-label-primary,#202124);font:inherit}
.decision-analysis-inner{max-width:52rem;margin:0 auto;padding:1.4rem 1.5rem 3rem}
.decision-analysis-title{font-size:1.15rem;margin:0 0 .3rem}
.decision-analysis-intro{margin:0 0 .4rem}
.decision-analysis-section{border-top:1px solid var(--dsw-alias-border-l2,#eceff1);margin-top:1.1rem;padding-top:1rem}
.decision-analysis-section>h3{font-size:.92rem;margin:0 0 .6rem}
.decision-analysis-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:.7rem}
.decision-analysis-cards .decision-card-stats{flex-wrap:wrap}
.decision-analysis-trend{max-width:26rem}
.decision-analysis-note{margin:.5rem 0 0}
@media (prefers-color-scheme:dark){
  .decision-analysis{color:var(--dsw-alias-label-primary,#e6eaee)}
}
`;

export function installStyles(): () => void {
  if (typeof document === 'undefined' || document.querySelector('style[data-plugin="dsh-decision-layer"]')) return () => {};
  const element = document.createElement('style');
  element.dataset.plugin = 'dsh-decision-layer';
  element.textContent = css;
  document.head.appendChild(element);
  return () => element.remove();
}
