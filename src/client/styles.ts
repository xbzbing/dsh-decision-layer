const css = `
.decision-trigger{display:inline-flex;align-items:center;gap:.4rem;border:1px solid var(--dsw-alias-border-l2,#cbd5e1);border-radius:.5rem;padding:.25rem .5rem;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#202124);cursor:pointer;font:inherit;font-size:.8rem}
.decision-trigger:focus-visible,.decision-dialog button:focus-visible,.decision-dialog input:focus-visible{outline:2px solid #236c63;outline-offset:2px}
.decision-dot{width:.5rem;height:.5rem;border-radius:50%;background:#26896f}
.decision-dot-off{background:#79838a}
.decision-dialog{box-sizing:border-box;width:min(30rem,calc(100vw - 2rem));max-height:min(85vh,48rem);border:1px solid var(--dsw-alias-border-l2,#cbd5e1);border-radius:.75rem;padding:1rem 1.25rem;overflow:auto;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#202124);box-shadow:0 1rem 3rem rgba(0,0,0,.18);font:inherit}
.decision-dialog::backdrop{background:rgba(0,0,0,.45)}
.decision-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem}
.decision-head h2{font-size:1.2rem;margin:0}
.decision-head button{border:0;background:transparent;color:inherit;font:inherit;font-size:1.5rem;cursor:pointer}
.decision-dialog section{border-top:1px solid var(--dsw-alias-border-l2,#cbd5e1);margin-top:1rem;padding-top:1rem}
.decision-dialog h3{font-size:.95rem;margin:0 0 .75rem}
.decision-dialog p{font-size:.84rem;line-height:1.5;margin:.4rem 0}
.decision-dialog form,.decision-dialog form label{display:grid;gap:.45rem}
.decision-dialog form{gap:.8rem}
.decision-dialog form label{font-size:.8rem}
.decision-dialog input:not([type=checkbox]){box-sizing:border-box;width:100%;min-height:2.25rem;border:1px solid var(--dsw-alias-border-l2,#cbd5e1);border-radius:.35rem;padding:.35rem .5rem;background:transparent;color:inherit;font:inherit}
.decision-dialog .decision-switch{display:flex;align-items:center;gap:.5rem;font-size:.84rem}
.decision-muted{color:var(--dsw-alias-label-secondary,#59636e);font-size:.76rem}
.decision-actions{display:flex;gap:.5rem;flex-wrap:wrap}
.decision-actions button{border:1px solid var(--dsw-alias-border-l2,#cbd5e1);border-radius:.35rem;background:var(--dsw-alias-bg-layer-1,#f4f6f7);color:inherit;padding:.45rem .7rem;font:inherit;cursor:pointer}
.decision-actions button:disabled{opacity:.5;cursor:not-allowed}
.decision-message{color:var(--dsw-alias-label-primary,#202124)}
.decision-metrics{display:grid;gap:.4rem;margin:0}
.decision-metrics div{display:flex;justify-content:space-between;gap:1rem;font-size:.82rem}
.decision-metrics dt{color:var(--dsw-alias-label-secondary,#59636e);margin:0}
.decision-metrics dd{margin:0;font-variant-numeric:tabular-nums}
`;

export function installStyles(): () => void {
  if (typeof document === 'undefined' || document.querySelector('style[data-plugin="dsh-decision-layer"]')) return () => {};
  const element = document.createElement('style');
  element.dataset.plugin = 'dsh-decision-layer';
  element.textContent = css;
  document.head.appendChild(element);
  return () => element.remove();
}
