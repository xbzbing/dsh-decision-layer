window.__ModuleLoader__.load({
  id: 'dsh-decision-layer',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/i18n.ts
var dictionaries = {
  zh: {
    button: "\u51B3\u7B56\u5C42",
    title: "\u4ECB\u5165\u9762\u677F",
    close: "\u5173\u95ED",
    metrics: "\u81EA\u52A8\u88C1\u51B3",
    empty: "\u5C1A\u65E0\u81EA\u52A8\u88C1\u51B3\u3002\u624B\u52A8\u88C1\u51B3\u4E0D\u8BA1\u5165\u8FD9\u91CC\u3002",
    attempts: "\u8BC4\u4F30\u6B21\u6570",
    failures: "\u5931\u8D25\u56DE\u9000",
    suggestions: "\u6A21\u578B\u5EFA\u8BAE\uFF08\u653E\u884C / \u8BE2\u95EE / \u62D2\u7EDD\uFF09",
    actual: "\u5B9E\u9645\u5BBF\u4E3B\u7ED3\u679C\uFF08\u653E\u884C / \u62D2\u7EDD\uFF09",
    checkAttempts: "\u81EA\u68C0\u8BC4\u4F30\u6B21\u6570",
    checkLow: "\u4F4E\u5206\u6B21\u6570",
    settings: "\u4F1A\u8BDD\u8BBE\u7F6E",
    enabled: "\u542F\u7528\u81EA\u52A8\u4ECB\u5165",
    future: "\u5F53\u524D\u7248\u672C\u5C1A\u65E0\u81EA\u52A8\u4ECB\u5165\u529F\u80FD\uFF1B\u5F00\u5173\u53EA\u4FDD\u5B58\u672C\u4F1A\u8BDD\u7684\u504F\u597D\u3002",
    selfCheck: "\u4EA7\u51FA\u81EA\u68C0",
    selfCheckSteer: "\u4F4E\u5206\u65F6\u8865\u5B8C\uFF08\u786C steer\uFF09",
    selfCheckHint: "\u9ED8\u8BA4\u53EA\u89C2\u6D4B\u5E76\u8BB0\u5F55\u4F4E\u5206\uFF1B\u5F00\u542F\u540E\u56DE\u5408\u7ED3\u675F\u82E5\u81EA\u68C0\u5F97\u5206\u504F\u4F4E\uFF0C\u4F1A\u8FFD\u52A0\u4E00\u6B21\u8865\u5B8C\u63D0\u793A\u3002",
    backend: "\u88C1\u51B3\u540E\u7AEF",
    url: "\u670D\u52A1\u5730\u5740",
    model: "\u6A21\u578B",
    key: "API Key",
    keyHint: "\u7559\u7A7A\u5219\u4FDD\u7559\u5DF2\u4FDD\u5B58\u7684 Key\uFF1B\u82E5\u672A\u4FDD\u5B58\uFF0C\u4F1A\u56DE\u843D\u5230\u73AF\u5883\u53D8\u91CF\u3002",
    removeKey: "\u6E05\u9664\u5DF2\u4FDD\u5B58\u7684 Key",
    save: "\u4FDD\u5B58\u914D\u7F6E",
    probe: "\u6D4B\u8BD5\u8FDE\u63A5",
    saved: "\u914D\u7F6E\u5DF2\u4FDD\u5B58",
    connected: "\u8FDE\u63A5\u6210\u529F",
    unavailable: "\u8FDE\u63A5\u4E0D\u53EF\u7528",
    error: "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
    loading: "\u6B63\u5728\u8BFB\u53D6\u4F1A\u8BDD\u72B6\u6001",
    capacity: "\u4F1A\u8BDD\u72B6\u6001\u5BB9\u91CF\u5DF2\u6EE1\uFF1A\u6B64\u4F1A\u8BDD\u81EA\u52A8\u4ECB\u5165\u5DF2\u6682\u505C\uFF1B\u64CD\u4F5C\u4ECD\u53D7\u5BBF\u4E3B\u6743\u9650\u7B56\u7565\u7EA6\u675F\u3002",
    destination: "\u88C1\u51B3\u65F6\u4F1A\u5411\u4EE5\u4E0B\u540E\u7AEF\u53D1\u9001\u5FC5\u8981\u7684\u8BC4\u4F30\u4E0A\u4E0B\u6587\uFF1A",
    httpWarning: "\u6B64\u5730\u5740\u4F7F\u7528\u672A\u52A0\u5BC6\u7684 HTTP\u3002\u786E\u8BA4\u540E\uFF0CAPI Key \u4E0E\u8BC4\u4F30\u4E0A\u4E0B\u6587\u5C06\u4EE5\u660E\u6587\u53D1\u9001\u81F3\u8BE5\u5730\u5740\u3002"
  },
  en: {
    button: "Decision layer",
    title: "Intervention panel",
    close: "Close",
    metrics: "Automatic decisions",
    empty: "No automatic decisions yet. Manual verdicts are not counted here.",
    attempts: "Evaluations",
    failures: "Fallback failures",
    suggestions: "Model suggestions (allow / ask / deny)",
    actual: "Actual host outcomes (allow / deny)",
    checkAttempts: "Self-check evaluations",
    checkLow: "Low scores",
    settings: "Session settings",
    enabled: "Enable automatic interventions",
    future: "No automatic interventions are available yet; this saves your session preference.",
    selfCheck: "Output self-check",
    selfCheckSteer: "Re-prompt on low score (hard steer)",
    selfCheckHint: "Observes and records low scores by default; when enabled, a low self-check score at turn end adds one completion prompt.",
    backend: "Decision backend",
    url: "Server URL",
    model: "Model",
    key: "API key",
    keyHint: "Leave blank to keep the saved key or use an environment credential.",
    removeKey: "Clear saved API key",
    save: "Save configuration",
    probe: "Test connection",
    saved: "Configuration saved",
    connected: "Connected",
    unavailable: "Connection unavailable",
    error: "Request failed. Please retry.",
    loading: "Loading session settings",
    capacity: "Session capacity reached: automatic intervention is paused here; host permission rules still apply.",
    destination: "Decisions send the necessary evaluation context to this backend:",
    httpWarning: "This address uses unencrypted HTTP. Your API key and evaluation context will be sent in plaintext to this address."
  }
};

// src/client/panel.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var api = "/plugins/dsh-decision-layer/api";
async function request(path, init) {
  const response = await fetch(`${api}/${path}`, init);
  const body = await response.json();
  if (!response.ok || !body.ok || body.value === void 0) throw new Error(body.error || "Request failed");
  return body.value;
}
function DecisionPanel(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SessionPanel, { ...props }, props.sessionId);
}
function SessionPanel({ sessionId, t }) {
  const dialog = (0, import_react.useRef)(null);
  const trigger = (0, import_react.useRef)(null);
  const [open, setOpen] = (0, import_react.useState)(false);
  const [enabled, setEnabled] = (0, import_react.useState)(null);
  const [capacityExceeded, setCapacityExceeded] = (0, import_react.useState)(false);
  const [config, setConfig] = (0, import_react.useState)({ url: "", model: "", apiKeySet: false, httpApprovedUrl: "", effectiveUrl: "https://api.typesafe.ai" });
  const [checkMode, setCheckMode] = (0, import_react.useState)("observe");
  const [key, setKey] = (0, import_react.useState)("");
  const [removeKey, setRemoveKey] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [dirty, setDirty] = (0, import_react.useState)(false);
  const [configReady, setConfigReady] = (0, import_react.useState)(false);
  const [metrics, setMetrics] = (0, import_react.useState)(null);
  const [message, setMessage] = (0, import_react.useState)("");
  (0, import_react.useEffect)(() => {
    let live = true;
    void request(`session?sessionId=${encodeURIComponent(sessionId)}`).then((value) => {
      if (live) {
        setEnabled(value.enabled);
        setCapacityExceeded(Boolean(value.capacityExceeded));
      }
    }).catch(() => {
      if (live) setMessage(t("error"));
    });
    return () => {
      live = false;
    };
  }, [sessionId, t]);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    let live = true;
    setMessage("");
    setConfigReady(false);
    void request(`metrics?sessionId=${encodeURIComponent(sessionId)}`).then((value) => {
      if (live) setMetrics(value);
    }).catch(() => {
    });
    void request("config").then((value) => {
      if (live) {
        setConfig(value);
        setCheckMode(value.checkSettings?.mode ?? "observe");
        setDirty(false);
        setConfigReady(true);
      }
    }).catch(() => {
      if (live) setMessage(t("error"));
    });
    return () => {
      live = false;
      element.close();
    };
  }, [open, t, sessionId]);
  const updateEnabled = async (next) => {
    setBusy(true);
    try {
      const value = await request("session", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, enabled: next })
      });
      setEnabled(value.enabled);
      setCapacityExceeded(Boolean(value.capacityExceeded));
    } catch {
      setMessage(t("error"));
    } finally {
      setBusy(false);
    }
  };
  const save = async (event) => {
    event.preventDefault();
    const url = config.url.trim();
    const needsHttpConsent = url.startsWith("http://") && url !== config.httpApprovedUrl;
    if (needsHttpConsent && !window.confirm(`${t("httpWarning")}
${url}`)) return;
    setBusy(true);
    try {
      const value = await request("config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          model: config.model,
          checkSettings: { mode: checkMode },
          ...removeKey ? { apiKey: "" } : key ? { apiKey: key } : {},
          ...needsHttpConsent ? { confirmHttpUrl: url } : {}
        })
      });
      setConfig(value);
      setCheckMode(value.checkSettings?.mode ?? "observe");
      setKey("");
      setRemoveKey(false);
      setDirty(false);
      setMessage(t("saved"));
    } catch {
      setMessage(t("error"));
    } finally {
      setBusy(false);
    }
  };
  const probe = async () => {
    setBusy(true);
    try {
      const value = await request("probe", { method: "POST" });
      setMessage(t(value.connected ? "connected" : "unavailable"));
    } catch {
      setMessage(t("error"));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { ref: trigger, className: "decision-trigger", type: "button", "aria-haspopup": "dialog", "aria-expanded": open, "aria-busy": enabled === null, onClick: () => setOpen(true), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: enabled ? "decision-dot" : "decision-dot decision-dot-off", "aria-hidden": "true" }),
      t("button")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "dialog",
      {
        ref: dialog,
        className: "decision-dialog",
        "aria-labelledby": "decision-panel-title",
        onClose: () => {
          setKey("");
          setRemoveKey(false);
          setOpen(false);
          trigger.current?.focus();
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "decision-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { id: "decision-panel-title", children: t("title") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
              dialog.current?.close();
            }, "aria-label": t("close"), children: "\xD7" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: t("metrics") }),
            !metrics?.gate && !metrics?.check ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: t("empty") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", { className: "decision-metrics", children: [
              metrics.gate && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("attempts") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: metrics.gate.attempts })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("failures") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: metrics.gate.failures })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("suggestions") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dd", { children: [
                    metrics.gate.allow,
                    " / ",
                    metrics.gate.ask,
                    " / ",
                    metrics.gate.deny
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("actual") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dd", { children: [
                    metrics.gate.actual.allow,
                    " / ",
                    metrics.gate.actual.deny
                  ] })
                ] })
              ] }),
              metrics.check && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("checkAttempts") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: metrics.check.attempts })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: t("checkLow") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: metrics.check.low })
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: t("settings") }),
            enabled === null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: t("loading") }),
            capacityExceeded && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: t("capacity") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "decision-switch", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "checkbox",
                  checked: enabled === true,
                  disabled: busy || enabled === null || capacityExceeded,
                  onChange: (event) => void updateEnabled(event.target.checked)
                }
              ),
              t("enabled")
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "decision-muted", children: t("future") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: t("selfCheck") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "decision-switch", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "checkbox",
                  checked: checkMode === "steer",
                  disabled: !configReady,
                  onChange: (event) => {
                    setCheckMode(event.target.checked ? "steer" : "observe");
                    setDirty(true);
                  }
                }
              ),
              t("selfCheckSteer")
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "decision-muted", children: t("selfCheckHint") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: t("backend") }),
            configReady && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "decision-muted", children: [
              t("destination"),
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: config.effectiveUrl })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", { onSubmit: (event) => void save(event), children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
                t("url"),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    type: "url",
                    value: config.url,
                    disabled: !configReady,
                    placeholder: "https://api.typesafe.ai",
                    onChange: (event) => {
                      setConfig({ ...config, url: event.target.value });
                      setDirty(true);
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
                t("model"),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    value: config.model,
                    disabled: !configReady,
                    placeholder: "jev-latest",
                    onChange: (event) => {
                      setConfig({ ...config, model: event.target.value });
                      setDirty(true);
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
                t("key"),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    type: "password",
                    autoComplete: "off",
                    value: key,
                    disabled: !configReady || removeKey,
                    placeholder: config.apiKeySet ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "",
                    onChange: (event) => {
                      setKey(event.target.value);
                      setDirty(true);
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { className: "decision-muted", children: t("keyHint") }),
              config.apiKeySet && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "decision-switch", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    checked: removeKey,
                    disabled: !configReady,
                    onChange: (event) => {
                      setRemoveKey(event.target.checked);
                      setDirty(true);
                    }
                  }
                ),
                t("removeKey")
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "decision-actions", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: busy || !configReady, type: "submit", children: t("save") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: busy || !configReady || dirty, type: "button", onClick: () => void probe(), children: t("probe") })
              ] })
            ] })
          ] }),
          message && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", className: "decision-message", children: message })
        ]
      }
    )
  ] });
}

// src/client/styles.ts
var css = `
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
function installStyles() {
  if (typeof document === "undefined" || document.querySelector('style[data-plugin="dsh-decision-layer"]')) return () => {
  };
  const element = document.createElement("style");
  element.dataset.plugin = "dsh-decision-layer";
  element.textContent = css;
  document.head.appendChild(element);
  return () => element.remove();
}

// src/client/index.tsx
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(installStyles);
  ctx.effect(() => ctx.locale.register("dsh-decision-layer", dictionaries));
  ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
    name: "conversation.input.left",
    id: "decision-layer-panel",
    order: 20,
    locale: "dsh-decision-layer",
    registrant: "dsh-decision-layer",
    inject: (sessionId) => ({ sessionId })
  }, DecisionPanel));
}

    return module.exports;
  }
});
