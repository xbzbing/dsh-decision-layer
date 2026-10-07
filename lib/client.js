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
  AnalysisView: () => AnalysisView,
  ConfigForm: () => ConfigForm,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/i18n.ts
var dictionaries = {
  zh: {
    summary: "\u5371\u9669\u8C03\u7528\u95E8\u63A7\u3001\u4EA7\u51FA\u81EA\u68C0\u4E0E\u9632\u5FAA\u73AF\uFF0C\u7531\u53EF\u63D2\u62D4\u88C1\u51B3\u6A21\u578B\u9A71\u52A8\u3002",
    button: "\u51B3\u7B56\u5C42",
    title: "\u51B3\u7B56\u5C42",
    close: "\u5173\u95ED",
    metrics: "\u81EA\u52A8\u88C1\u51B3\u7EDF\u8BA1",
    triggerDecisions: "\u51B3\u7B56",
    empty: "\u5C1A\u65E0\u81EA\u52A8\u88C1\u51B3\u3002\u624B\u52A8\u88C1\u51B3\u4E0D\u8BA1\u5165\u8FD9\u91CC\u3002",
    attempts: "\u8BC4\u4F30\u6B21\u6570",
    failures: "\u5931\u8D25\u56DE\u9000",
    suggestions: "\u6A21\u578B\u5EFA\u8BAE\uFF08\u653E\u884C / \u8BE2\u95EE / \u62D2\u7EDD\uFF09",
    actual: "\u5B9E\u9645\u5BBF\u4E3B\u7ED3\u679C\uFF08\u653E\u884C / \u62D2\u7EDD\uFF09",
    checkAttempts: "\u81EA\u68C0\u8BC4\u4F30\u6B21\u6570",
    checkLow: "\u4F4E\u5206",
    checkOk: "\u901A\u8FC7",
    settings: "\u4F1A\u8BDD\u8BBE\u7F6E",
    cardGate: "\u5371\u9669\u95E8\u63A7",
    cardCheck: "\u4EA7\u51FA\u81EA\u68C0",
    cardNarrow: "\u5DE5\u5177\u6536\u7A84",
    cardComplete: "\u5B8C\u6210\u6838\u5BF9",
    cardTimes: " \u6B21",
    allow: "\u653E\u884C",
    ask: "\u8BE2\u95EE",
    deny: "\u62D2\u7EDD",
    actualShort: "\u5B9E\u9645\u7ED3\u679C",
    narrowAppliedLabel: "\u6536\u7A84",
    narrowDroppedLabel: "\u6458\u9664\u5DE5\u5177",
    narrowDropped: "\u6458\u9664",
    narrowKept: "\u672A\u6536\u7A84",
    narrowKeptCount: "\u4FDD\u7559",
    narrowMore: " \u7B49 {count} \u4E2A",
    narrowObserve: "\u4EC5\u89C2\u5BDF",
    narrowEnforce: "\u5DF2\u751F\u6548",
    checkPassRate: "\u901A\u8FC7\u7387",
    narrowApplyRate: "\u6536\u7A84\u7387",
    rateNa: "\u2014",
    enabled: "\u672C\u4F1A\u8BDD\u5185\u542F\u7528\u81EA\u52A8\u4ECB\u5165",
    backendStatus: "\u540E\u7AEF\u8FDE\u63A5",
    statusChecking: "\u68C0\u6D4B\u4E2D\u2026",
    statusIdle: "\u672A\u68C0\u6D4B",
    statusOk: "\u6B63\u5E38",
    statusDown: "\u4E0D\u53EF\u7528",
    recheck: "\u91CD\u65B0\u68C0\u6D4B",
    log: "\u51B3\u7B56\u65E5\u5FD7",
    logEmpty: "\u672C\u4F1A\u8BDD\u5C1A\u65E0\u51B3\u7B56\u8BB0\u5F55\u3002",
    logGate: "\u95E8\u63A7",
    logCheck: "\u81EA\u68C0",
    logNarrow: "\u6536\u7A84",
    logComplete: "\u5B8C\u6210\u6838\u5BF9",
    logSuggested: "\u6A21\u578B\u5EFA\u8BAE",
    logEvalFailed: "\u8BC4\u4F30\u5931\u8D25",
    logScore: "\u5F97\u5206",
    logConnection: "\u8FDE\u63A5",
    logConfidence: "\u7F6E\u4FE1\u5EA6",
    logScoreHint: "\u5F97\u5206\u4E3A\u5404\u6863\u4F4D\u6309\u6982\u7387\u52A0\u6743\u7684\u7ED3\u679C\uFF0C\u53EF\u80FD\u662F\u5C0F\u6570\uFF08\u5982 1.4\uFF09\uFF0C\u6EE1\u5206\u4E3A\u9876\u6863\u53F7 2\u3002",
    logCheckHint: "\u6BCF\u56DE\u5408\u7ED3\u675F\u540E\uFF0C\u628A\u8FD9\u8F6E AI \u7684\u6700\u7EC8\u56DE\u590D\u4EA4\u7ED9\u88C1\u51B3\u6A21\u578B\uFF0C\u6309\u300C\u4E25\u91CD\u9057\u6F0F/\u81EA\u76F8\u77DB\u76FE \u2192 \u6709\u5C0F\u9057\u6F0F \u2192 \u5B8C\u6574\u51C6\u786E\u300D\u4E09\u6863\u6253\u4E00\u4E2A 0\u20132 \u7684\u8D28\u91CF\u5206\uFF0C\u7528\u6765\u53D1\u73B0\u9057\u6F0F\u6216\u77DB\u76FE\u3002",
    logNarrowHint: "\u6BCF\u56DE\u5408\u5F00\u59CB\u65F6\uFF0C\u628A\u8FD9\u8F6E\u4EFB\u52A1\u4E0E\u5F53\u524D\u53EF\u7528\u5DE5\u5177\u9010\u4E2A\u4EA4\u7ED9\u88C1\u51B3\u6A21\u578B\u5224\u65AD\u76F8\u5173\u6027\uFF08noul\uFF09\uFF0C\u6458\u6389\u660E\u663E\u7528\u4E0D\u4E0A\u7684\u5DE5\u5177\uFF0C\u53EA\u5728\u5F53\u524D\u5BBF\u4E3B\u5DF2\u5141\u8BB8\u7684\u96C6\u5408\u5185\u53D6\u4EA4\u96C6\u3001\u7EDD\u4E0D\u6269\u6743\uFF1B\u300C\u4EC5\u89C2\u5BDF\u300D\u53EA\u8BB0\u5F55\u5EFA\u8BAE\uFF0C\u300C\u5DF2\u751F\u6548\u300D\u624D\u771F\u6B63\u5BF9\u672C\u56DE\u5408\u9650\u5236\u5DE5\u5177\u3002",
    actionDeny: "\u5DF2\u62D2\u7EDD",
    actionAsk: "\u8F6C\u4EA4\u5BA1\u6279",
    actionPass: "\u672A\u5E72\u9884",
    gatePassThrough: "\u672A\u5E72\u9884\uFF08\u6309\u539F\u8DEF\u5F84\u6267\u884C\uFF09",
    checkResultLow: "\u5F97\u5206\u504F\u4F4E",
    checkResultOk: "\u901A\u8FC7",
    checkResultLowNoisy: "\u5F97\u5206\u504F\u4F4E\uFF08\u4F4E\u7F6E\u4FE1\uFF09",
    checkNoiseTag: "\u566A\u58F0\uFF0C\u53EF\u5FFD\u7565",
    checkNoiseHint: "\u6A21\u578B\u5BF9\u8FD9\u6B21\u6253\u5206\u51E0\u4E4E\u6CA1\u6709\u628A\u63E1\uFF08\u7F6E\u4FE1\u5EA6\u6781\u4F4E\uFF09\uFF0C\u8FD9\u6761\u4F4E\u5206\u4E0D\u8BA1\u5165\u8D28\u91CF\u8D8B\u52BF\u3001\u4E5F\u4E0D\u89E6\u53D1\u4EFB\u4F55\u8865\u5B8C\uFF0C\u89C6\u4F5C\u566A\u58F0\u5FFD\u7565\u5373\u53EF\u3002\u771F\u6B63\u503C\u5F97\u5173\u6CE8\u7684\u662F\u8FDE\u7EED\u591A\u6B21\u9AD8\u7F6E\u4FE1\u7684\u4F4E\u5206\u3002",
    reasonUnavailable: "\u540E\u7AEF\u4E0D\u53EF\u8FBE",
    reasonHttpError: "\u540E\u7AEF\u8FD4\u56DE\u9519\u8BEF",
    reasonInvalidResponse: "\u54CD\u5E94\u683C\u5F0F\u4E0D\u7B26",
    reasonLowConfidence: "\u7F6E\u4FE1\u5EA6\u4E0D\u8DB3",
    reasonConfig: "\u914D\u7F6E\u65E0\u6548",
    reasonTooMany: "\u5019\u9009\u8FC7\u591A",
    reasonTooManyCount: "\u5019\u9009 {count} \u4E2A\u504F\u591A",
    reasonLowKeep: "\u4FDD\u7559\u8FC7\u5C11\uFF0C\u672A\u751F\u6548",
    selfCheck: "\u4EA7\u51FA\u81EA\u68C0",
    advancedSwitches: "\u4ECB\u5165\u5F00\u5173",
    advancedParams: "\u6536\u7A84\u53C2\u6570",
    selfCheckSteer: "\u5F97\u5206\u504F\u4F4E\u65F6\u81EA\u52A8\u8865\u4E00\u8F6E",
    selfCheckHint: "\u6BCF\u56DE\u5408\u7ED3\u675F\u7ED9\u6700\u7EC8\u56DE\u590D\u6253\u5206\uFF080\u20132\uFF0C\u6309\u5404\u6863\u4F4D\u6982\u7387\u52A0\u6743\uFF0C\u53EF\u80FD\u662F\u5C0F\u6570\u5982 1.4\uFF09\u3002\u5173\u95ED\uFF1A\u53EA\u628A\u4F4E\u5206\u8BB0\u8FDB\u65E5\u5FD7\u548C\u7EDF\u8BA1\uFF0C\u4E0D\u6253\u65AD\u5BF9\u8BDD\u3002\u5F00\u542F\uFF1A\u5F97\u5206\u504F\u4F4E\uFF08\u22641\uFF09\u4E14\u6A21\u578B\u6709\u628A\u63E1\u65F6\uFF0C\u81EA\u52A8\u4EE5\u4F60\u7684\u540D\u4E49\u8FFD\u52A0\u4E00\u6761\u63D0\u793A\uFF0C\u8BA9 AI \u590D\u6838\u6709\u65E0\u9057\u6F0F\u6216\u77DB\u76FE\u5E76\u8865\u5B8C\uFF1B\u7F6E\u4FE1\u5EA6\u504F\u4F4E\u7684\u6253\u5206\u53EA\u8BB0\u5F55\u3001\u4E0D\u6253\u65AD\uFF0C\u540C\u4E00\u56DE\u5408\u6700\u591A\u8865\u4E00\u6B21\u3002",
    narrow: "\u5DE5\u5177\u6536\u7A84",
    narrowObserveLabel: "\u4EC5\u89C2\u5BDF\uFF08\u4E0D\u771F\u6B63\u9650\u5236\u5DE5\u5177\uFF09",
    narrowHint: "\u6BCF\u56DE\u5408\u5F00\u59CB\u65F6\uFF0C\u7528\u88C1\u51B3\u6A21\u578B\u5224\u65AD\u5F53\u524D\u53EF\u9009\u5DE5\u5177\u4E0E\u8FD9\u8F6E\u4EFB\u52A1\u7684\u76F8\u5173\u6027\uFF0C\u6458\u6389\u7528\u4E0D\u4E0A\u7684\uFF1B\u8BFB\u5199\u3001\u7F16\u8F91\u3001Shell\u3001\u68C0\u7D22\u3001\u5F85\u529E\u7B49\u6838\u5FC3\u5DE5\u5177\u59CB\u7EC8\u4FDD\u7559\u3001\u4E0D\u53C2\u4E0E\u5224\u5B9A\u3002\u9ED8\u8BA4\u771F\u6B63\u751F\u6548\uFF1A\u672C\u56DE\u5408\u53EA\u4FDD\u7559\u5224\u4E3A\u76F8\u5173\u7684\u5DE5\u5177\uFF0C\u4E14\u53EA\u5728\u5BBF\u4E3B\u5DF2\u5141\u8BB8\u7684\u8303\u56F4\u5185\u53D6\u4EA4\u96C6\u3001\u4E0D\u6269\u6743\u3002\u5F00\u542F\u300C\u4EC5\u89C2\u5BDF\u300D\u540E\u53EA\u628A\u53EF\u6458\u6389\u7684\u5DE5\u5177\u8BB0\u8FDB\u65E5\u5FD7\u548C\u7EDF\u8BA1\uFF0C\u4E0D\u6539\u52A8\u5DE5\u5177\u96C6\u3002\u4E09\u91CD\u4FDD\u62A4\uFF1A\u6838\u5FC3\u5DE5\u5177\u59CB\u7EC8\u4FDD\u7559\uFF1B\u53EF\u9009\u5DE5\u5177\u8D85\u8FC7 20 \u4E2A\u65F6\u81EA\u52A8\u53EA\u89C2\u5BDF\u4E0D\u9650\u5236\uFF1B\u4FDD\u7559\u4E0B\u6765\u4E0D\u8DB3 5 \u4E2A\u65F6\u89C6\u4E3A\u5224\u5B9A\u4E0D\u53EF\u4FE1\u3001\u8DF3\u8FC7\u3002",
    narrowKeepLabel: "\u59CB\u7EC8\u4FDD\u7559\u7684\u5DE5\u5177\u524D\u7F00",
    narrowKeepHint: "\u540D\u5B57\u4EE5\u8FD9\u4E9B\u524D\u7F00\u5F00\u5934\u7684\u5DE5\u5177\u6C38\u8FDC\u4FDD\u7559\u3001\u4E0D\u53C2\u4E0E\u76F8\u5173\u6027\u5224\u5B9A\uFF0C\u9002\u5408\u8BB0\u5FC6/\u68C0\u7D22\u8FD9\u7C7B\u300C\u5E38\u9A7B\u3001\u6309\u9700\u89E6\u53D1\u300D\u7684\u5DE5\u5177\uFF08\u9ED8\u8BA4\u542B mcp__openviking\u3001team_task_\uFF09\u3002\u7528\u82F1\u6587\u9017\u53F7\u6216\u6362\u884C\u5206\u9694\u591A\u4E2A\u524D\u7F00\uFF1B\u7559\u7A7A\u5219\u4E0D\u989D\u5916\u4FDD\u7559\u3002",
    narrowMaxLabel: "\u5019\u9009\u5DE5\u5177\u4E0A\u9650",
    narrowMaxHint: "\u4E00\u56DE\u5408\u91CC\u53C2\u4E0E\u5224\u5B9A\u7684\u300C\u53EF\u9009\u5DE5\u5177\u300D\u8D85\u8FC7\u8FD9\u4E2A\u6570\uFF08\u9ED8\u8BA4 20\uFF09\uFF0C\u5C31\u81EA\u52A8\u964D\u7EA7\u4E3A\u4EC5\u89C2\u5BDF\u3001\u4E0D\u771F\u6B63\u6536\u7A84\uFF0C\u907F\u514D\u4E00\u6B21\u585E\u592A\u591A\u5DE5\u5177\u8BA9\u6A21\u578B\u8BEF\u6458\u3002\u53D6\u503C 1\u2013200\uFF0C\u8C03\u5927\u66F4\u503E\u5411\u771F\u6B63\u6536\u7A84\u3002\u6838\u5FC3\u5DE5\u5177\u4E0E\u4FDD\u7559\u524D\u7F00\u547D\u4E2D\u7684\u5DE5\u5177\u4E0D\u8BA1\u5165\u3002",
    narrowThresholdLabel: "\u6458\u9664\u9608\u503C",
    narrowThresholdHint: "\u76F8\u5173\u6027\u6982\u7387\u4F4E\u4E8E\u8FD9\u4E2A\u503C\u624D\u6458\u6389\u5DE5\u5177\uFF08\u9ED8\u8BA4 0.3\uFF09\u3002\u6982\u7387\u63A5\u8FD1 0.5 \u8868\u793A\u6A21\u578B\u62FF\u4E0D\u51C6\u3001\u5E76\u975E\u300C\u4E2D\u7B49\u76F8\u5173\u300D\uFF0C\u6B64\u65F6\u4FDD\u7559\u66F4\u7A33\u59A5\uFF1B\u8C03\u4F4E\u66F4\u4FDD\u5B88\uFF08\u5C11\u6458\u3001\u5B81\u53EF\u591A\u7559\uFF09\uFF0C\u8C03\u9AD8\u66F4\u6FC0\u8FDB\uFF08\u591A\u6458\uFF09\u3002\u53D6\u503C 0\u20131\u3002",
    features: "\u51B3\u7B56\u70B9\u5F00\u5173",
    basicFeatures: "\u57FA\u7840\u529F\u80FD",
    advancedConfig: "\u9AD8\u7EA7\u914D\u7F6E",
    featureGate: "\u5371\u9669\u95E8\u63A7",
    featureGateHint: "\u5173\u95ED\u540E\u4E0D\u518D\u5BF9\u7834\u574F\u6027\u5DE5\u5177\u8C03\u7528\u505A\u62E6\u622A\u8BC4\u4F30\uFF0C\u8C03\u7528\u53EA\u53D7\u5BBF\u4E3B\u539F\u751F\u6743\u9650\u7EA6\u675F\u3002",
    featureCheck: "\u4EA7\u51FA\u81EA\u68C0",
    featureCheckHint: "\u5173\u95ED\u540E\u4E0D\u518D\u5728\u56DE\u5408\u7ED3\u675F\u65F6\u7ED9\u6700\u7EC8\u56DE\u590D\u6253\u5206\u3002",
    featureNarrow: "\u5DE5\u5177\u6536\u7A84",
    featureNarrowHint: "\u5173\u95ED\u540E\u4E0D\u518D\u5728\u56DE\u5408\u5F00\u59CB\u65F6\u8BC4\u4F30\u5DE5\u5177\u76F8\u5173\u6027\u3002\u9632\u5FAA\u73AF\u4E3A\u786E\u5B9A\u6027\u672C\u5730\u4FDD\u62A4\uFF0C\u59CB\u7EC8\u751F\u6548\uFF0C\u4E0D\u5728\u6B64\u5F00\u5173\u8303\u56F4\u3002",
    featureComplete: "\u4EFB\u52A1\u5B8C\u6210\u6838\u5BF9",
    featureCompleteHint: "\u5173\u95ED\u540E\u4E0D\u518D\u5728\u56DE\u5408\u7ED3\u675F\u65F6\u9010\u9879\u6838\u5BF9\u7528\u6237\u660E\u786E\u5217\u51FA\u7684\u4EA4\u4ED8\u6761\u4EF6\u3002",
    trendWarnHint: "\u672C\u4F1A\u8BDD\u6700\u8FD1\u8FDE\u7EED\u51E0\u8F6E\u4EA7\u51FA\u8D28\u91CF\u504F\u4F4E\uFF08\u9AD8\u7F6E\u4FE1\uFF09\u3002\u53EF\u80FD\u662F\u4EFB\u52A1\u96BE\u5EA6\u4E0A\u5347\u6216\u6A21\u578B\u72B6\u6001\u6CE2\u52A8\uFF0C\u5EFA\u8BAE\u5C1D\u8BD5\u8C03\u6574 prompt \u6216\u66F4\u6362\u6A21\u578B\u3002",
    trendSevereHint: "\u672C\u4F1A\u8BDD\u4EA7\u51FA\u8D28\u91CF\u6301\u7EED\u504F\u4F4E\uFF08\u9AD8\u7F6E\u4FE1\uFF09\u3002\u5EFA\u8BAE\u8C03\u6574 prompt \u6216\u66F4\u6362\u6A21\u578B\uFF0C\u6216\u91CD\u5F00\u4F1A\u8BDD\u3002",
    rateGroup: "\u6807\u6CE8\u8FD9\u6B21\u5224\u65AD",
    rateGood: "\u5224\u5BF9\u4E86",
    rateBad: "\u5224\u9519\u4E86",
    rateUnsure: "\u8BF4\u4E0D\u51C6",
    rateSummary: "\u5DF2\u6807\u6CE8 {rated} \u6761\uFF08\u5224\u5BF9 {good} / \u5224\u9519 {bad} / \u8BF4\u4E0D\u51C6 {unsure}\uFF09",
    annotateFailed: "\u6807\u6CE8\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
    completeSteer: "\u6709\u672A\u6EE1\u8DB3\u6761\u4EF6\u65F6\u81EA\u52A8\u8865\u4E00\u8F6E",
    completeHint: "\u56DE\u5408\u7ED3\u675F\u65F6\uFF0C\u5BF9\u7528\u6237\u660E\u786E\u5217\u51FA\u7684\u591A\u4E2A\u4EA4\u4ED8\u6761\u4EF6\uFF08\u7F16\u53F7 / \u9879\u76EE\u7B26\u53F7 / \u591A\u547D\u4EE4\uFF09\u9010\u9879\u5224\u5B9A\u300C\u5DF2\u6EE1\u8DB3 / \u672A\u6EE1\u8DB3 / \u8BC1\u636E\u4E0D\u8DB3\u300D\uFF0C\u4EE5\u5DE5\u5177\u8BC1\u636E\u4E3A\u51C6\u3001\u56DE\u590D\u81EA\u79F0\u5B8C\u6210\u4E0D\u7B97\u8BC1\u636E\u3002\u5173\u95ED\uFF1A\u53EA\u628A\u7ED3\u679C\u8BB0\u8FDB\u65E5\u5FD7\u548C\u7EDF\u8BA1\uFF0C\u4E0D\u6253\u65AD\u5BF9\u8BDD\u3002\u5F00\u542F\uFF1A\u786E\u6709\u6761\u4EF6\u88AB\u5224\u300C\u672A\u6EE1\u8DB3\u300D\u4E14\u6A21\u578B\u6709\u628A\u63E1\u65F6\uFF0C\u81EA\u52A8\u4EE5\u4F60\u7684\u540D\u4E49\u8FFD\u52A0\u4E00\u6761\u63D0\u793A\u8BA9 AI \u590D\u6838\u8865\u5B8C\uFF1B\u300C\u8BC1\u636E\u4E0D\u8DB3\u300D\u4E0D\u89E6\u53D1\u8865\u5B8C\uFF0C\u540C\u4E00\u56DE\u5408\u6700\u591A\u8865\u4E00\u6B21\u3002",
    completeResultOk: "\u6761\u4EF6\u9F50\u5907",
    completeResultUnsatisfied: "\u6709\u672A\u6EE1\u8DB3",
    completeConditions: "\u6761\u4EF6",
    completeSatisfied: "\u6EE1\u8DB3",
    completeUnsatisfied: "\u672A\u6EE1\u8DB3",
    completeInsufficient: "\u8BC1\u636E\u4E0D\u8DB3",
    completeSteered: "\u5DF2\u8865\u4E00\u8F6E",
    backend: "\u88C1\u51B3\u540E\u7AEF",
    url: "\u670D\u52A1\u5730\u5740",
    model: "\u6A21\u578B",
    key: "API Key",
    keyHintSaved: "\u5DF2\u4FDD\u5B58\u4E00\u4E2A Key\u3002\u7559\u7A7A\u5E76\u4FDD\u5B58\uFF1D\u6CBF\u7528\u5B83\uFF08\u4E0D\u6539\u52A8\uFF09\uFF1B\u586B\u65B0\u503C\u5E76\u4FDD\u5B58\uFF1D\u8986\u76D6\u5B83\u3002",
    keyHintEmpty: "\u5C1A\u672A\u4FDD\u5B58 Key\u3002\u7559\u7A7A\u5219\u4F7F\u7528\u73AF\u5883\u53D8\u91CF\u91CC\u7684 Key\uFF1B\u586B\u5165\u5219\u4FDD\u5B58\u5230\u672C\u673A\u3002",
    removeKey: "\u5220\u9664\u5DF2\u4FDD\u5B58\u7684 Key",
    removeKeyHint: "\u628A\u672C\u63D2\u4EF6\u4FDD\u5B58\u5728\u672C\u673A\u7684 Key \u6C38\u4E45\u5220\u9664\uFF0C\u4E4B\u540E\u81EA\u52A8\u56DE\u843D\u5230\u73AF\u5883\u53D8\u91CF\u91CC\u7684 Key\uFF1B\u4E0D\u5F71\u54CD\u4F60\u5728\u522B\u5904\u914D\u7F6E\u7684\u51ED\u636E\u3002",
    removeKeyButton: "\u5220\u9664",
    removeKeyConfirm: "\u786E\u5B9A\u5220\u9664\u672C\u673A\u4FDD\u5B58\u7684 API Key\uFF1F\u5220\u9664\u540E\u5C06\u56DE\u843D\u5230\u73AF\u5883\u53D8\u91CF\u7684 Key\u3002",
    removeKeyDone: "\u5DF2\u5220\u9664\u4FDD\u5B58\u7684 Key",
    save: "\u4FDD\u5B58\u914D\u7F6E",
    saveAdvanced: "\u4FDD\u5B58\u9AD8\u7EA7\u914D\u7F6E",
    probe: "\u6D4B\u8BD5\u8FDE\u63A5",
    saved: "\u914D\u7F6E\u5DF2\u4FDD\u5B58",
    connected: "\u8FDE\u63A5\u6210\u529F",
    unavailable: "\u8FDE\u63A5\u4E0D\u53EF\u7528",
    error: "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
    loading: "\u6B63\u5728\u8BFB\u53D6\u4F1A\u8BDD\u72B6\u6001",
    destination: "\u88C1\u51B3\u65F6\u4F1A\u5411\u4EE5\u4E0B\u540E\u7AEF\u53D1\u9001\u5FC5\u8981\u7684\u8BC4\u4F30\u4E0A\u4E0B\u6587\uFF1A",
    httpWarning: "\u6B64\u5730\u5740\u4F7F\u7528\u672A\u52A0\u5BC6\u7684 HTTP\u3002\u786E\u8BA4\u540E\uFF0CAPI Key \u4E0E\u8BC4\u4F30\u4E0A\u4E0B\u6587\u5C06\u4EE5\u660E\u6587\u53D1\u9001\u81F3\u8BE5\u5730\u5740\u3002",
    analysisTab: "\u51B3\u7B56\u5206\u6790",
    analysisTitle: "\u51B3\u7B56\u5206\u6790",
    analysisIntro: "\u57FA\u4E8E\u672C\u4F1A\u8BDD\u5DF2\u843D\u76D8\u7684\u51B3\u7B56\u65E5\u5FD7\u505A\u53EA\u8BFB\u805A\u5408\u4E0E\u4EBA\u5DE5\u6807\u6CE8\uFF0C\u4E0D\u6539\u53D8\u4EFB\u4F55 agent \u884C\u4E3A\u3002",
    analysisProfile: "\u8FC7\u7A0B\u753B\u50CF",
    analysisMeanScore: "\u5E73\u5747\u5206",
    analysisTrend: "\u8D28\u91CF\u8D8B\u52BF\u56DE\u6D4B",
    analysisTrendWarn: "\u544A\u8B66\u89E6\u53D1",
    analysisTrendSevere: "\u4E25\u91CD\u89E6\u53D1",
    analysisTrendMaxRun: "\u6700\u957F\u8FDE\u7EED\u4F4E\u5206",
    analysisTrendNote: "\u7528\u5F53\u524D\u9608\u503C\u628A\u672C\u4F1A\u8BDD\u7684\u81EA\u68C0\u5206\u6570\u6309\u65F6\u95F4\u91CD\u653E\uFF0C\u7EDF\u8BA1\u544A\u8B66\u672C\u4F1A\u300C\u4F1A\u300D\u89E6\u53D1\u51E0\u6B21\uFF0C\u7528\u4E8E\u6821\u51C6\u9608\u503C\uFF0C\u4E0D\u662F\u5B9E\u65F6\u4FE1\u53F7\u3002",
    analysisAccuracy: "\u5224\u65AD\u51C6\u786E\u5EA6",
    analysisAccuracyEmpty: "\u5C1A\u672A\u6807\u6CE8\u4EFB\u4F55\u51B3\u7B56\u3002\u5728\u4E0B\u65B9\u51B3\u7B56\u5217\u8868\u9010\u6761\u6807\u6CE8\u300C\u5224\u5BF9 / \u5224\u9519 / \u8BF4\u4E0D\u51C6\u300D\u540E\uFF0C\u8FD9\u91CC\u7ED9\u51FA\u6C47\u603B\u3002",
    analysisLogNote: "\u6807\u6CE8\u5728\u6B64\u4E0E\u4ECB\u5165\u9762\u677F\u540C\u6E90\uFF1A\u4EFB\u4E00\u5904\u6807\u6CE8\u90FD\u5199\u5165\u540C\u4E00\u4EFD\u65E5\u5FD7\u3001\u6309\u51B3\u7B56 id \u5173\u8054\u3001\u53D6\u6700\u65B0\u3002",
    analysisLogTruncated: "\u672C\u4F1A\u8BDD\u6682\u65E0\u53EF\u5C55\u793A\u7684\u51B3\u7B56\u8BB0\u5F55\u3002",
    pagerPrev: "\u4E0A\u4E00\u9875",
    pagerNext: "\u4E0B\u4E00\u9875",
    pagerStatus: "\u7B2C {page}/{pages} \u9875 \xB7 \u5171 {total} \u6761"
  },
  en: {
    summary: "A danger-call gate, output self-check, and loop guard driven by a pluggable adjudication model.",
    button: "Decision layer",
    title: "Decision layer",
    close: "Close",
    metrics: "Automatic decisions",
    triggerDecisions: "decisions",
    empty: "No automatic decisions yet. Manual verdicts are not counted here.",
    attempts: "Evaluations",
    failures: "Fallback failures",
    suggestions: "Model suggestions (allow / ask / deny)",
    actual: "Actual host outcomes (allow / deny)",
    checkAttempts: "Self-check evaluations",
    checkLow: "Low",
    checkOk: "Passed",
    settings: "Session settings",
    cardGate: "Danger gate",
    cardCheck: "Output self-check",
    cardNarrow: "Tool narrowing",
    cardComplete: "Task completion",
    cardTimes: "",
    allow: "Allow",
    ask: "Ask",
    deny: "Deny",
    actualShort: "Actual",
    narrowAppliedLabel: "Narrowed",
    narrowDroppedLabel: "Tools dropped",
    narrowDropped: "dropped",
    narrowKept: "kept all",
    narrowKeptCount: "kept",
    narrowMore: " and {count} in total",
    narrowObserve: "observe",
    narrowEnforce: "enforced",
    checkPassRate: "Pass rate",
    narrowApplyRate: "Narrow rate",
    rateNa: "\u2014",
    enabled: "Enable automatic interventions in this session",
    backendStatus: "Backend",
    statusChecking: "Checking\u2026",
    statusIdle: "Not checked",
    statusOk: "Connected",
    statusDown: "Unavailable",
    recheck: "Recheck",
    log: "Decision log",
    logEmpty: "No decisions recorded for this session yet.",
    logGate: "Gate",
    logCheck: "Self-check",
    logNarrow: "Narrow",
    logComplete: "Completion",
    logSuggested: "model suggested",
    logEvalFailed: "evaluation failed",
    logScore: "score",
    logConnection: "connection",
    logConfidence: "confidence",
    logScoreHint: "The score is a probability-weighted mean across the levels, so it can be fractional (e.g. 1.4); the top score is the highest level number, 2.",
    logCheckHint: "After each turn, the AI\u2019s final reply for that turn is sent to the adjudication model, which grades its quality on three levels (severe omission/contradiction \u2192 minor gaps \u2192 complete and accurate) as a 0\u20132 score, to catch omissions or contradictions.",
    logNarrowHint: "At the start of each turn, the current task and each available tool are sent to the adjudication model (a noul per tool) to judge relevance, dropping tools clearly not needed. It only intersects the host-allowed set and never expands it; observe merely logs the suggestion, enforced actually restricts the tools for this turn.",
    actionDeny: "denied",
    actionAsk: "sent to approval",
    actionPass: "no intervention",
    gatePassThrough: "no intervention (proceeded on its original path)",
    checkResultLow: "low score",
    checkResultOk: "passed",
    checkResultLowNoisy: "low score (low confidence)",
    checkNoiseTag: "noise, ignore",
    checkNoiseHint: "The model had almost no confidence in this score (near-zero confidence). This low score does not count toward the quality trend and triggers no re-prompt \u2014 treat it as noise. What matters is several consecutive high-confidence low scores.",
    reasonUnavailable: "backend unreachable",
    reasonHttpError: "backend returned an error",
    reasonInvalidResponse: "unexpected response shape",
    reasonLowConfidence: "low confidence",
    reasonConfig: "invalid configuration",
    reasonTooMany: "too many candidates",
    reasonTooManyCount: "{count} candidates is too many",
    reasonLowKeep: "too few kept, not enforced",
    selfCheck: "Output self-check",
    advancedSwitches: "Intervention switches",
    advancedParams: "Narrowing parameters",
    selfCheckSteer: "Auto re-prompt on a low score",
    selfCheckHint: "Each turn ends by scoring the final reply (0\u20132, a probability-weighted mean across the levels, so it can be fractional like 1.4). Off: low scores are only logged, the conversation is not interrupted. On: when the score is low (\u22641) and the model is confident enough, one prompt is appended on your behalf asking the AI to review for gaps or contradictions and finish the work; low-confidence scores are only logged, never interrupt, and at most one prompt per turn.",
    narrow: "Tool narrowing",
    narrowObserveLabel: "Observe only (do not restrict tools)",
    narrowHint: "At the start of each turn, the adjudication model judges how relevant each optional tool is to the task and drops the ones not needed; core tools (read, write, edit, shell, search, todos) are always kept and never judged. Enforced by default: only the relevant tools are kept for this turn, intersected with the host-allowed set and never expanded. Turn on Observe only to just log the tools that could be dropped, without changing the tool set. Three safeguards: core tools always kept; more than 20 optional tools falls back to observe only; fewer than 5 tools remaining is treated as untrustworthy and skipped.",
    narrowKeepLabel: "Always-kept tool prefixes",
    narrowKeepHint: "Tools whose names start with any of these prefixes are always kept and never judged for relevance \u2014 good for resident, on-demand tools like memory/retrieval (defaults to mcp__openviking and team_task_). Separate prefixes with commas or newlines; leave empty to keep nothing extra.",
    narrowMaxLabel: "Candidate tool cap",
    narrowMaxHint: "When more than this many optional tools are judged in one turn (default 20), narrowing downgrades to observe only instead of actually restricting, so a large surface is never mass-pruned. Range 1\u2013200; a higher value leans toward actually narrowing. Core tools and keep-prefix matches do not count.",
    narrowThresholdLabel: "Drop threshold",
    narrowThresholdHint: 'A tool is dropped only when its relevance probability is below this value (default 0.3). A probability near 0.5 means the model is unsure, not "moderately relevant", so keeping is safer there; lower is more conservative (drops fewer), higher is more aggressive. Range 0\u20131.',
    features: "Decision points",
    basicFeatures: "Basic features",
    advancedConfig: "Advanced settings",
    featureGate: "Danger gate",
    featureGateHint: "When off, destructive tool calls are no longer evaluated for interception and are only bound by the host permission rules.",
    featureCheck: "Output self-check",
    featureCheckHint: "When off, the final reply is no longer scored at the end of a turn.",
    featureNarrow: "Tool narrowing",
    featureNarrowHint: "When off, tool relevance is no longer evaluated at the start of a turn. The loop guard is a deterministic local safeguard that is always on and not covered by this switch.",
    featureComplete: "Task completion check",
    featureCompleteHint: "When off, the explicit deliverable conditions the user listed are no longer checked at turn end.",
    trendWarnHint: "Output quality has been low for a few consecutive turns this session (high confidence). It may be rising task difficulty or model drift \u2014 consider adjusting the prompt or switching models.",
    trendSevereHint: "Output quality has stayed low this session (high confidence). Consider adjusting the prompt, switching models, or starting a new session.",
    rateGroup: "Rate this decision",
    rateGood: "Correct",
    rateBad: "Wrong",
    rateUnsure: "Unsure",
    rateSummary: "Rated {rated} ({good} correct / {bad} wrong / {unsure} unsure)",
    annotateFailed: "Could not save the rating. Please retry.",
    completeSteer: "Auto re-prompt on an unmet condition",
    completeHint: "At turn end, each explicit deliverable condition the user listed (numbered / bulleted / multi-command) is judged satisfied / unsatisfied / insufficient evidence, with tool evidence as the source of truth \u2014 a reply claiming completion is not evidence. Off: results are only logged, the conversation is not interrupted. On: when a condition is confidently judged unsatisfied, one prompt is appended on your behalf asking the AI to review and finish it; insufficient evidence never triggers a re-prompt, and at most one per turn.",
    completeResultOk: "conditions met",
    completeResultUnsatisfied: "unmet found",
    completeConditions: "conditions",
    completeSatisfied: "met",
    completeUnsatisfied: "unmet",
    completeInsufficient: "insufficient",
    completeSteered: "re-prompted",
    backend: "Decision backend",
    url: "Server URL",
    model: "Model",
    key: "API key",
    keyHintSaved: "A key is saved. Leave blank and save to keep it; enter a new value and save to overwrite it.",
    keyHintEmpty: "No key saved yet. Leave blank to use an environment credential, or enter one to save it locally.",
    removeKey: "Delete saved API key",
    removeKeyHint: "Permanently deletes the key this plugin stored locally, then falls back to the environment credential; credentials configured elsewhere are untouched.",
    removeKeyButton: "Delete",
    removeKeyConfirm: "Delete the locally saved API key? It will fall back to the environment credential.",
    removeKeyDone: "Saved key deleted",
    save: "Save configuration",
    saveAdvanced: "Save advanced settings",
    probe: "Test connection",
    saved: "Configuration saved",
    connected: "Connected",
    unavailable: "Connection unavailable",
    error: "Request failed. Please retry.",
    loading: "Loading session settings",
    destination: "Decisions send the necessary evaluation context to this backend:",
    httpWarning: "This address uses unencrypted HTTP. Your API key and evaluation context will be sent in plaintext to this address.",
    analysisTab: "Decision analysis",
    analysisTitle: "Decision analysis",
    analysisIntro: "A read-only aggregate and manual annotation over this session\u2019s persisted decision log. It changes no agent behavior.",
    analysisProfile: "Process profile",
    analysisMeanScore: "Mean score",
    analysisTrend: "Quality-trend backtest",
    analysisTrendWarn: "Warn fires",
    analysisTrendSevere: "Severe fires",
    analysisTrendMaxRun: "Longest low run",
    analysisTrendNote: "Replays this session\u2019s self-check scores in time order under the current thresholds to count how often the alarm would fire \u2014 a calibration aid, not a live signal.",
    analysisAccuracy: "Decision accuracy",
    analysisAccuracyEmpty: "No decisions rated yet. Rate rows below as correct / wrong / unsure and a summary appears here.",
    analysisLogNote: "Ratings here share one source with the intervention panel: a rating on either surface writes to the same log, keyed by decision id, latest wins.",
    analysisLogTruncated: "No decision rows to show for this session.",
    pagerPrev: "Prev",
    pagerNext: "Next",
    pagerStatus: "Page {page}/{pages} \xB7 {total} total"
  }
};

// src/client/panel.tsx
var import_react2 = require("react");

// src/client/api.ts
var API_BASE = "/plugins/dsh-decision-layer/api";
async function request(path, init) {
  const response = await fetch(`${API_BASE}/${path}`, init);
  const body = await response.json();
  if (!response.ok || !body.ok || body.value === void 0) throw new Error(body.error || "Request failed");
  return body.value;
}

// src/client/decision-log.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var time = (at) => new Date(at).toLocaleTimeString();
function reasonText(t, reason) {
  return reason === "unavailable" || reason === "unreachable" ? t("reasonUnavailable") : reason === "http-error" ? t("reasonHttpError") : reason === "invalid-response" ? t("reasonInvalidResponse") : reason === "low-confidence" ? t("reasonLowConfidence") : reason === "too-many-candidates" ? t("reasonTooMany") : reason === "low-keep" ? t("reasonLowKeep") : reason === "config" ? t("reasonConfig") : reason;
}
function actionText(t, action) {
  return action === "deny" ? t("actionDeny") : action === "ask" ? t("actionAsk") : action === "pass" ? t("actionPass") : action;
}
function failDetail(t, entry) {
  const reason = reasonText(t, entry.reason);
  if (entry.reason === "low-confidence" && typeof entry.confidence === "number") return `${reason}\uFF08${t("logConfidence")} ${entry.confidence}\uFF09`;
  return reason;
}
function renderGate({ t }, entry) {
  const tool = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { className: "decision-log-tool", children: entry.tool ?? "\u2014" });
  if (entry.outcome === "error") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    t("logGate"),
    " \xB7 ",
    tool,
    " ",
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
      t("gatePassThrough"),
      entry.reason ? ` \xB7 ${failDetail(t, entry)}` : ""
    ] })
  ] });
  if (entry.outcome === "deny") {
    const suggestion2 = entry.suggestion && entry.suggestion !== "deny" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
      " \xB7 ",
      t("logSuggested"),
      " ",
      actionText(t, entry.suggestion)
    ] }) : null;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      t("logGate"),
      " \xB7 ",
      tool,
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-verdict", children: [
        "\u2192 ",
        t("actionDeny")
      ] }),
      suggestion2
    ] });
  }
  const suggestion = entry.suggestion ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
    " \xB7 ",
    t("logSuggested"),
    " ",
    actionText(t, entry.suggestion)
  ] }) : null;
  const lowConf = entry.reason === "low-confidence" && typeof entry.confidence === "number" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
    " \xB7 ",
    t("reasonLowConfidence"),
    " ",
    entry.confidence
  ] }) : null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    t("logGate"),
    " \xB7 ",
    tool,
    " ",
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "decision-log-verdict", children: t("gatePassThrough") }),
    suggestion,
    lowConf
  ] });
}
function renderCheck({ t }, entry) {
  const label = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { title: t("logCheckHint"), children: t("logCheck") });
  if (entry.outcome === "error") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    label,
    " ",
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
      t("logEvalFailed"),
      entry.reason ? ` \xB7 ${failDetail(t, entry)}` : ""
    ] })
  ] });
  const noisy = entry.outcome === "low" && entry.lowConfidence === true;
  const result = entry.outcome === "low" ? noisy ? t("checkResultLowNoisy") : t("checkResultLow") : t("checkResultOk");
  const verdict = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: noisy ? "decision-log-muted-verdict" : "decision-log-verdict", children: result });
  const score = entry.score !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", title: t("logScoreHint"), children: [
    " \xB7 ",
    t("logScore"),
    " ",
    entry.score,
    "/2"
  ] }) : null;
  const conf = typeof entry.confidence === "number" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
    " \xB7 ",
    t("logConfidence"),
    " ",
    entry.confidence
  ] }) : null;
  const hint = noisy ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", title: t("checkNoiseHint"), children: [
    " \xB7 ",
    t("checkNoiseTag")
  ] }) : null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    label,
    " \xB7 ",
    verdict,
    score,
    conf,
    hint
  ] });
}
function renderNarrow({ t }, entry) {
  const label = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { title: t("logNarrowHint"), children: t("logNarrow") });
  if (entry.outcome === "error") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    label,
    " ",
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
      t("logEvalFailed"),
      entry.reason ? ` \xB7 ${failDetail(t, entry)}` : ""
    ] })
  ] });
  const dropped = entry.dropped ?? 0;
  const kept = typeof entry.kept === "number" ? entry.kept : void 0;
  const guardText = entry.reason === "too-many-candidates" ? typeof entry.candidates === "number" ? t("reasonTooManyCount", { count: entry.candidates }) : t("reasonTooMany") : entry.reason === "low-keep" ? t("reasonLowKeep") : void 0;
  const guard = guardText ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
    " \xB7 ",
    guardText
  ] }) : null;
  const modeTag = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
    " \xB7 ",
    entry.mode === "enforce" ? t("narrowEnforce") : t("narrowObserve")
  ] });
  if (dropped === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      label,
      " \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "decision-log-verdict", children: t("narrowKept") }),
      kept !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
        " \xB7 ",
        t("narrowKeptCount"),
        " ",
        kept
      ] }) : null,
      guard,
      modeTag
    ] });
  }
  const names = Array.isArray(entry.tools) && entry.tools.length > 0 ? entry.tools.join("\u3001") : void 0;
  const overflow = names && Array.isArray(entry.tools) && entry.tools.length < dropped ? t("narrowMore", { count: dropped }) : "";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    label,
    " \xB7 ",
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-verdict", children: [
      t("narrowDropped"),
      " ",
      dropped,
      kept !== void 0 ? ` / ${t("narrowKeptCount")} ${kept}` : ""
    ] }),
    names ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
      " \xB7 ",
      names,
      overflow
    ] }) : null,
    guard,
    modeTag
  ] });
}
function renderComplete({ t }, entry) {
  const label = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("logComplete") });
  if (entry.outcome === "error") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    label,
    " ",
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
      t("logEvalFailed"),
      entry.reason ? ` \xB7 ${failDetail(t, entry)}` : ""
    ] })
  ] });
  const result = entry.outcome === "unsatisfied" ? t("completeResultUnsatisfied") : t("completeResultOk");
  const parts = [];
  if (typeof entry.satisfied === "number") parts.push(`${t("completeSatisfied")} ${entry.satisfied}`);
  if (typeof entry.unsatisfied === "number" && entry.unsatisfied > 0) parts.push(`${t("completeUnsatisfied")} ${entry.unsatisfied}`);
  if (typeof entry.insufficient === "number" && entry.insufficient > 0) parts.push(`${t("completeInsufficient")} ${entry.insufficient}`);
  const tally = parts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
    " \xB7 ",
    parts.join(" / ")
  ] }) : null;
  const steer = entry.steered ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
    " \xB7 ",
    t("completeSteered")
  ] }) : null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    label,
    " \xB7 ",
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "decision-log-verdict", children: result }),
    typeof entry.conditions === "number" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-log-detail", children: [
      " \xB7 ",
      t("completeConditions"),
      " ",
      entry.conditions
    ] }) : null,
    tally,
    steer
  ] });
}
function outcomeTagOf(entry) {
  if (entry.kind === "narrow") return entry.outcome === "error" ? "error" : "ok";
  if (entry.kind === "complete") return entry.outcome === "error" ? "error" : entry.outcome === "unsatisfied" ? "warn" : "ok";
  if (entry.outcome === "deny") return "deny";
  if (entry.outcome === "error") return "error";
  if (entry.outcome === "low") return entry.kind === "check" && entry.lowConfidence === true ? "muted" : "warn";
  return "ok";
}
function renderBody(props, entry) {
  return entry.kind === "gate" ? renderGate(props, entry) : entry.kind === "narrow" ? renderNarrow(props, entry) : entry.kind === "complete" ? renderComplete(props, entry) : renderCheck(props, entry);
}
function RatingButtons({ id, t, ratings, onRate }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "decision-rate", role: "group", "aria-label": t("rateGroup"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: `decision-rate-btn${ratings[id] === "good" ? " decision-rate-on decision-rate-good" : ""}`, "aria-label": t("rateGood"), title: t("rateGood"), "aria-pressed": ratings[id] === "good", onClick: () => onRate(id, "good"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5 7.2 8.1 2.4c.6-.9 2-.5 2 .6V6h3.2c.9 0 1.5.8 1.3 1.6l-1.1 4.6c-.2.8-.9 1.3-1.7 1.3H5V7.2Z", stroke: "currentColor", "stroke-width": "1.2", "stroke-linejoin": "round" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5 7.2H2.6v6.3H5", stroke: "currentColor", "stroke-width": "1.2", "stroke-linejoin": "round" })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: `decision-rate-btn${ratings[id] === "bad" ? " decision-rate-on decision-rate-bad" : ""}`, "aria-label": t("rateBad"), title: t("rateBad"), "aria-pressed": ratings[id] === "bad", onClick: () => onRate(id, "bad"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M11 8.8 7.9 13.6c-.6.9-2 .5-2-.6V10H2.7c-.9 0-1.5-.8-1.3-1.6l1.1-4.6C2.7 3 3.4 2.5 4.2 2.5H11v6.3Z", stroke: "currentColor", "stroke-width": "1.2", "stroke-linejoin": "round" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M11 8.8h2.4V2.5H11", stroke: "currentColor", "stroke-width": "1.2", "stroke-linejoin": "round" })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: `decision-rate-btn${ratings[id] === "unsure" ? " decision-rate-on decision-rate-unsure" : ""}`, "aria-label": t("rateUnsure"), title: t("rateUnsure"), "aria-pressed": ratings[id] === "unsure", onClick: () => onRate(id, "unsure"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "8", cy: "8", r: "6.2", stroke: "currentColor", "stroke-width": "1.2" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6.3 6.2c0-1 .8-1.7 1.7-1.7s1.7.7 1.7 1.6c0 1.3-1.6 1.4-1.7 2.6", stroke: "currentColor", "stroke-width": "1.2", "stroke-linecap": "round", "stroke-linejoin": "round" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "8", cy: "11.4", r: ".8", fill: "currentColor" })
    ] }) })
  ] });
}
function DecisionLogList({ entries, ratings, onRate, t, newestFirst = true }) {
  const rows = newestFirst ? entries.slice().reverse() : entries.slice();
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", { className: "decision-log", children: rows.map((entry, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: `decision-log-item decision-log-${outcomeTagOf(entry)}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "decision-log-time", children: time(entry.at) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "decision-log-body", children: renderBody({ t }, entry) }),
    entry.id && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RatingButtons, { id: entry.id, t, ratings, onRate })
  ] }, entry.id ?? `${entry.at}-${index}`)) });
}

// src/client/cards.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function CardHead({ title, total, unit, rate }) {
  const totalSpan = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "decision-card-total", children: [
    total,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: unit })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { className: "decision-card-head", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "decision-card-title", children: title }),
    rate ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "decision-card-head-metrics", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "decision-card-rate-inline", children: [
        rate.label,
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: rate.value })
      ] }),
      totalSpan
    ] }) : totalSpan
  ] });
}
function Stat({ label, value, pct, tone }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "decision-stat", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `decision-stat-num${tone ? ` decision-stat-${tone}` : ""}`, children: value }),
    typeof pct === "number" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "decision-stat-pct", children: [
      pct,
      "%"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "decision-stat-label", children: label })
  ] });
}
var share = (n, total) => total > 0 ? Math.round(n / total * 100) : null;

// src/client/use-annotations.ts
var import_react = require("react");
function useAnnotations(sessionId, onFail) {
  const [ratings, setRatings] = (0, import_react.useState)({});
  const seed = (0, import_react.useCallback)((analysis) => {
    setRatings(analysis?.ratings ?? {});
  }, []);
  const annotate = (0, import_react.useCallback)(async (id, rating) => {
    let previous;
    setRatings((prev) => {
      previous = prev[id];
      return { ...prev, [id]: rating };
    });
    try {
      await request("annotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, target: id, rating })
      });
    } catch {
      onFail();
      setRatings((prev) => {
        const next = { ...prev };
        if (previous === void 0) delete next[id];
        else next[id] = previous;
        return next;
      });
    }
  }, [sessionId, onFail]);
  return { ratings, seed, annotate };
}

// src/client/panel.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function DecisionPanel(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SessionPanel, { ...props }, props.sessionId);
}
function Bar({ allow, ask, deny }) {
  const total = allow + ask + deny;
  if (total === 0) return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "decision-bar decision-bar-empty", "aria-hidden": "true" });
  const pct = (n) => `${n / total * 100}%`;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "decision-bar", "aria-hidden": "true", children: [
    allow > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "decision-bar-allow", style: { width: pct(allow) } }),
    ask > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "decision-bar-ask", style: { width: pct(ask) } }),
    deny > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "decision-bar-deny", style: { width: pct(deny) } })
  ] });
}
function SessionPanel({ sessionId, t }) {
  const dialog = (0, import_react2.useRef)(null);
  const trigger = (0, import_react2.useRef)(null);
  const mounted = (0, import_react2.useRef)(true);
  (0, import_react2.useEffect)(() => () => {
    mounted.current = false;
  }, []);
  const [open, setOpen] = (0, import_react2.useState)(false);
  const [enabled, setEnabled] = (0, import_react2.useState)(null);
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [metrics, setMetrics] = (0, import_react2.useState)(null);
  const [log, setLog] = (0, import_react2.useState)([]);
  const [status, setStatus] = (0, import_react2.useState)("idle");
  const [message, setMessage] = (0, import_react2.useState)("");
  const { ratings, seed, annotate } = useAnnotations(sessionId, () => setMessage(t("annotateFailed")));
  (0, import_react2.useEffect)(() => {
    let live = true;
    void request(`session?sessionId=${encodeURIComponent(sessionId)}`).then((value) => {
      if (live) setEnabled(value.enabled);
    }).catch(() => {
      if (live) setMessage(t("error"));
    });
    void request(`metrics?sessionId=${encodeURIComponent(sessionId)}`).then((value) => {
      if (live) setMetrics(value);
    }).catch(() => {
    });
    return () => {
      live = false;
    };
  }, [sessionId, t]);
  const checkStatus = () => {
    setStatus("checking");
    void request("probe", { method: "POST" }).then((value) => {
      if (mounted.current) setStatus(value.connected ? "ok" : "down");
    }).catch(() => {
      if (mounted.current) setStatus("down");
    });
  };
  (0, import_react2.useEffect)(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    let alive = true;
    setMessage("");
    void request(`metrics?sessionId=${encodeURIComponent(sessionId)}`).then((value) => {
      if (alive) setMetrics(value);
    }).catch(() => {
    });
    void request(`log?sessionId=${encodeURIComponent(sessionId)}`).then((value) => {
      if (alive) setLog(value.entries);
    }).catch(() => {
    });
    void request(`logs?sessionId=${encodeURIComponent(sessionId)}`).then((value) => {
      if (alive) seed(value);
    }).catch(() => {
    });
    return () => {
      alive = false;
      element.close();
    };
  }, [open, sessionId, seed]);
  const updateEnabled = async (next) => {
    setBusy(true);
    try {
      const value = await request("session", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, enabled: next })
      });
      setEnabled(value.enabled);
    } catch {
      setMessage(t("error"));
    } finally {
      setBusy(false);
    }
  };
  const statusLabel = status === "ok" ? t("statusOk") : status === "down" ? t("statusDown") : status === "checking" ? t("statusChecking") : t("statusIdle");
  const attempts = metrics?.attempts ?? 0;
  const severity = metrics?.check?.trend?.severity ?? "normal";
  const trendTitle = severity === "severe" ? t("trendSevereHint") : severity === "warn" ? t("trendWarnHint") : void 0;
  const checkValid = metrics?.check ? metrics.check.attempts - metrics.check.failures : 0;
  const checkPassRate = metrics?.check && checkValid > 0 ? Math.round((checkValid - metrics.check.low) / checkValid * 100) : null;
  const narrowValid = metrics?.narrow ? metrics.narrow.attempts - metrics.narrow.failures : 0;
  const narrowApplyRate = metrics?.narrow && narrowValid > 0 ? Math.round(metrics.narrow.applied / narrowValid * 100) : null;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { ref: trigger, className: `decision-trigger decision-trend-${severity}`, type: "button", "aria-haspopup": "dialog", "aria-expanded": open, "aria-busy": enabled === null, "aria-label": t("button"), title: trendTitle, onClick: () => setOpen(true), children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { className: "decision-trigger-icon", width: "15", height: "15", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: "8", cy: "8", r: "6.4", stroke: "currentColor", "stroke-width": "1.3" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M8 4.6 11.3 11H4.7L8 4.6Z", fill: "currentColor", stroke: "none" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "decision-trigger-text", children: [
        t("triggerDecisions"),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: attempts })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "dialog",
      {
        ref: dialog,
        className: "decision-dialog",
        "aria-labelledby": "decision-panel-title",
        onKeyDown: (event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            event.preventDefault();
            dialog.current?.close();
          }
        },
        onCancel: (event) => {
          event.preventDefault();
          dialog.current?.close();
        },
        onClick: (event) => {
          if (event.target === dialog.current) dialog.current?.close();
        },
        onClose: () => {
          setOpen(false);
          trigger.current?.focus();
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "decision-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { id: "decision-panel-title", children: t("title") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: () => {
              dialog.current?.close();
            }, "aria-label": t("close"), children: "\xD7" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "decision-body", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { children: [
              enabled === null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "status", children: t("loading") }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "decision-toggle", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "decision-toggle-text", children: t("enabled") }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "decision-toggle-box", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                    "input",
                    {
                      className: "decision-toggle-input",
                      type: "checkbox",
                      checked: enabled === true,
                      disabled: busy || enabled === null,
                      onChange: (event) => void updateEnabled(event.target.checked)
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "decision-toggle-track", "aria-hidden": "true" })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "decision-status", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `decision-status-dot decision-status-${status}`, "aria-hidden": "true" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "decision-status-label", children: [
                  t("backendStatus"),
                  "\uFF1A",
                  statusLabel
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "decision-status-recheck", disabled: status === "checking", onClick: () => checkStatus(), children: t("recheck") })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { children: t("metrics") }),
              !metrics?.gate && !metrics?.check && !metrics?.narrow && !metrics?.complete ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "decision-empty", role: "status", children: t("empty") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "decision-cards", children: [
                metrics.gate && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("article", { className: "decision-card decision-card-wide", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("header", { className: "decision-card-head", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "decision-card-title", children: t("cardGate") }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "decision-card-total", children: [
                      metrics.gate.attempts,
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: t("cardTimes") })
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Bar, { allow: metrics.gate.allow, ask: metrics.gate.ask, deny: metrics.gate.deny }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("ul", { className: "decision-legend", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "decision-legend-dot decision-dot-allow", "aria-hidden": "true" }),
                      t("allow"),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: metrics.gate.allow })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "decision-legend-dot decision-dot-ask", "aria-hidden": "true" }),
                      t("ask"),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: metrics.gate.ask })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "decision-legend-dot decision-dot-deny", "aria-hidden": "true" }),
                      t("deny"),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: metrics.gate.deny })
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("footer", { className: "decision-card-foot", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
                      t("actualShort"),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("b", { children: [
                        metrics.gate.actual.allow,
                        " / ",
                        metrics.gate.actual.deny
                      ] })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
                      t("failures"),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: metrics.gate.failures })
                    ] })
                  ] })
                ] }),
                metrics.check && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("article", { className: "decision-card", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                    CardHead,
                    {
                      title: t("cardCheck"),
                      total: metrics.check.attempts,
                      unit: t("cardTimes"),
                      rate: { label: t("checkPassRate"), value: checkPassRate === null ? t("rateNa") : `${checkPassRate}%` }
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "decision-card-stats", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Stat, { label: t("checkLow"), value: metrics.check.low, tone: "warn" }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Stat, { label: t("checkOk"), value: metrics.check.attempts - metrics.check.low - metrics.check.failures }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Stat, { label: t("failures"), value: metrics.check.failures, tone: "muted" })
                  ] })
                ] }),
                metrics.narrow && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("article", { className: "decision-card", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                    CardHead,
                    {
                      title: t("cardNarrow"),
                      total: metrics.narrow.attempts,
                      unit: t("cardTimes"),
                      rate: { label: t("narrowApplyRate"), value: narrowApplyRate === null ? t("rateNa") : `${narrowApplyRate}%` }
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "decision-card-stats", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Stat, { label: t("narrowAppliedLabel"), value: metrics.narrow.applied }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Stat, { label: t("narrowDroppedLabel"), value: metrics.narrow.dropped }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Stat, { label: t("failures"), value: metrics.narrow.failures, tone: "muted" })
                  ] })
                ] }),
                metrics.complete && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("article", { className: "decision-card", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                    CardHead,
                    {
                      title: t("cardComplete"),
                      total: metrics.complete.attempts,
                      unit: t("cardTimes"),
                      rate: { label: t("failures"), value: `${metrics.complete.failures}` }
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "decision-card-stats", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Stat, { label: t("completeSatisfied"), value: metrics.complete.satisfied }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Stat, { label: t("completeUnsatisfied"), value: metrics.complete.unsatisfied, tone: "warn" }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Stat, { label: t("completeInsufficient"), value: metrics.complete.insufficient, tone: "muted" })
                  ] })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { children: t("log") }),
              log.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "decision-empty", role: "status", children: t("logEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DecisionLogList, { entries: log, ratings, onRate: (id, rating) => void annotate(id, rating), t })
            ] }),
            message && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "status", className: "decision-message decision-message-warn", children: message })
          ] })
        ]
      }
    )
  ] });
}

// src/client/analysis-view.tsx
var import_react3 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var LOG_PAGE_SIZE = 100;
function AnalysisView({ sessionId, t }) {
  const [analysis, setAnalysis] = (0, import_react3.useState)(null);
  const [rows, setRows] = (0, import_react3.useState)(null);
  const [logPage, setLogPage] = (0, import_react3.useState)(1);
  const [loaded, setLoaded] = (0, import_react3.useState)(false);
  const [message, setMessage] = (0, import_react3.useState)("");
  const { ratings, seed, annotate } = useAnnotations(sessionId, () => setMessage(t("annotateFailed")));
  (0, import_react3.useEffect)(() => {
    let alive = true;
    setMessage("");
    setLoaded(false);
    setLogPage(1);
    setRows(null);
    void request(`logs?sessionId=${encodeURIComponent(sessionId)}`).then((value) => {
      if (alive) {
        setAnalysis(value);
        seed(value);
      }
    }).catch(() => {
    }).finally(() => {
      if (alive) setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [sessionId, seed]);
  (0, import_react3.useEffect)(() => {
    let alive = true;
    void request(`logrows?sessionId=${encodeURIComponent(sessionId)}&page=${logPage}&pageSize=${LOG_PAGE_SIZE}`).then((value) => {
      if (alive) setRows(value);
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, [sessionId, logPage]);
  const profile = analysis?.profile;
  const backtest = analysis?.trendBacktest;
  const annotations = analysis?.annotations;
  const meanScore = profile && profile.check.scoreCount > 0 ? Math.round(profile.check.scoreSum / profile.check.scoreCount * 10) / 10 : null;
  const completeTotal = profile ? profile.complete.satisfied + profile.complete.unsatisfied + profile.complete.insufficient : 0;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "decision-analysis", role: "region", "aria-label": t("analysisTitle"), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "decision-analysis-inner", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { className: "decision-analysis-title", children: t("analysisTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "decision-muted decision-analysis-intro", children: t("analysisIntro") }),
    loaded && (!analysis || analysis.totalDecisions === 0) ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "decision-empty", role: "status", children: t("logEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
      profile && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: "decision-analysis-section", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: t("analysisProfile") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "decision-analysis-cards", children: [
          profile.gate.attempts > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("article", { className: "decision-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(CardHead, { title: t("cardGate"), total: profile.gate.attempts, unit: t("cardTimes") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "decision-card-stats", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("deny"), value: profile.gate.deny, pct: share(profile.gate.deny, profile.gate.attempts), tone: "warn" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("allow"), value: profile.gate.allow, pct: share(profile.gate.allow, profile.gate.attempts) }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("ask"), value: profile.gate.ask, pct: share(profile.gate.ask, profile.gate.attempts) }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("failures"), value: profile.gate.error, pct: share(profile.gate.error, profile.gate.attempts), tone: "muted" })
            ] })
          ] }),
          profile.check.attempts > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("article", { className: "decision-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(CardHead, { title: t("cardCheck"), total: profile.check.attempts, unit: t("cardTimes") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "decision-card-stats", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("checkLow"), value: profile.check.low, pct: share(profile.check.low, profile.check.attempts), tone: "warn" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("checkOk"), value: profile.check.ok, pct: share(profile.check.ok, profile.check.attempts) }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("analysisMeanScore"), value: meanScore === null ? t("rateNa") : `${meanScore}/2` }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("failures"), value: profile.check.error, pct: share(profile.check.error, profile.check.attempts), tone: "muted" })
            ] })
          ] }),
          profile.narrow.attempts > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("article", { className: "decision-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(CardHead, { title: t("cardNarrow"), total: profile.narrow.attempts, unit: t("cardTimes") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "decision-card-stats", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("narrowAppliedLabel"), value: profile.narrow.applied, pct: share(profile.narrow.applied, profile.narrow.attempts) }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("narrowDroppedLabel"), value: profile.narrow.droppedSum }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("failures"), value: profile.narrow.error, pct: share(profile.narrow.error, profile.narrow.attempts), tone: "muted" })
            ] })
          ] }),
          profile.complete.attempts > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("article", { className: "decision-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(CardHead, { title: t("cardComplete"), total: profile.complete.attempts, unit: t("cardTimes") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "decision-card-stats", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("completeSatisfied"), value: profile.complete.satisfied, pct: share(profile.complete.satisfied, completeTotal) }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("completeUnsatisfied"), value: profile.complete.unsatisfied, pct: share(profile.complete.unsatisfied, completeTotal), tone: "warn" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("completeInsufficient"), value: profile.complete.insufficient, pct: share(profile.complete.insufficient, completeTotal), tone: "muted" })
            ] })
          ] })
        ] })
      ] }),
      backtest && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: "decision-analysis-section", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: t("analysisTrend") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "decision-card-stats decision-analysis-trend", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("analysisTrendWarn"), value: backtest.warnHits }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("analysisTrendSevere"), value: backtest.severeHits, tone: "warn" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Stat, { label: t("analysisTrendMaxRun"), value: backtest.maxRun })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "decision-muted decision-analysis-note", children: t("analysisTrendNote") })
      ] }),
      annotations && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: "decision-analysis-section", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: t("analysisAccuracy") }),
        annotations.rated === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "decision-muted", children: t("analysisAccuracyEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "decision-muted decision-rate-summary", children: t("rateSummary", { rated: annotations.rated, good: annotations.good, bad: annotations.bad, unsure: annotations.unsure }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: "decision-analysis-section", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: t("log") }),
        !rows || rows.total === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "decision-empty", role: "status", children: t("analysisLogTruncated") }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(DecisionLogList, { entries: rows.entries, ratings, onRate: (id, rating) => void annotate(id, rating), t, newestFirst: false }),
          rows.pages > 1 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("nav", { className: "decision-pager", "aria-label": t("log"), children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", disabled: rows.page <= 1, onClick: () => setLogPage((page) => Math.max(1, page - 1)), children: t("pagerPrev") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "decision-pager-status", children: t("pagerStatus", { page: rows.page, pages: rows.pages, total: rows.total }) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", disabled: rows.page >= rows.pages, onClick: () => setLogPage((page) => page + 1), children: t("pagerNext") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "decision-muted decision-analysis-note", children: t("analysisLogNote") })
        ] })
      ] })
    ] }),
    message && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "status", className: "decision-message decision-message-warn", children: message })
  ] }) });
}

// src/client/config-form.tsx
var import_react4 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
var api = "/plugins/dsh-decision-layer/api";
async function request2(path, fetchFn, init) {
  const response = await fetchFn(`${api}/${path}`, init);
  const body = await response.json();
  if (!response.ok || !body.ok || body.value === void 0) throw new Error(body.error || "Request failed");
  return body.value;
}
var DEFAULT_KEEP_PREFIXES = ["mcp__openviking", "team_task_"];
var DEFAULT_MAX_CANDIDATES = 20;
var DEFAULT_THRESHOLD = 0.3;
var parsePrefixes = (text) => Array.from(new Set(text.split(/[,\r\n]+/).map((line) => line.trim()).filter(Boolean)));
var prefixesText = (settings) => (settings?.keepPrefixes ?? DEFAULT_KEEP_PREFIXES).join("\n");
var maxCandidatesOf = (settings) => settings?.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
var thresholdOf = (settings) => settings?.threshold ?? DEFAULT_THRESHOLD;
function HeadIcon({ name }) {
  const glyphs = {
    features: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("rect", { x: "2", y: "3", width: "12", height: "4.2", rx: "2.1", stroke: "currentColor", "stroke-width": "1.3" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "11.9", cy: "5.1", r: "1.25", fill: "currentColor" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("rect", { x: "2", y: "8.8", width: "12", height: "4.2", rx: "2.1", stroke: "currentColor", "stroke-width": "1.3" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "4.1", cy: "10.9", r: "1.25", fill: "currentColor" })
    ] }),
    advanced: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M2.5 5h11M2.5 11h11", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "10.5", cy: "5", r: "1.9", fill: "var(--dsw-alias-bg-layer-2,#fff)", stroke: "currentColor", "stroke-width": "1.3" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "5.5", cy: "11", r: "1.9", fill: "var(--dsw-alias-bg-layer-2,#fff)", stroke: "currentColor", "stroke-width": "1.3" })
    ] }),
    backend: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("rect", { x: "2.3", y: "2.6", width: "11.4", height: "4.6", rx: "1.1", stroke: "currentColor", "stroke-width": "1.3" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("rect", { x: "2.3", y: "8.8", width: "11.4", height: "4.6", rx: "1.1", stroke: "currentColor", "stroke-width": "1.3" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "5", cy: "4.9", r: ".7", fill: "currentColor" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "5", cy: "11.1", r: ".7", fill: "currentColor" })
    ] })
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: `decision-head-icon decision-head-icon-${name}`, "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "none", children: glyphs[name] }) });
}
function Toggle({ label, checked, disabled, onChange }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "decision-toggle", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "decision-toggle-text", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "decision-toggle-box", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "input",
        {
          className: "decision-toggle-input",
          type: "checkbox",
          checked,
          disabled,
          onChange: (event) => onChange(event.target.checked)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "decision-toggle-track", "aria-hidden": "true" })
    ] })
  ] });
}
function ConfigForm({ t, fetchFn = fetch }) {
  const [config, setConfig] = (0, import_react4.useState)({ url: "", model: "", apiKeySet: false, httpApprovedUrl: "", effectiveUrl: "https://api.typesafe.ai" });
  const [checkMode, setCheckMode] = (0, import_react4.useState)("observe");
  const [narrowMode, setNarrowMode] = (0, import_react4.useState)("enforce");
  const [keepPrefixes, setKeepPrefixes] = (0, import_react4.useState)(DEFAULT_KEEP_PREFIXES.join("\n"));
  const [maxCandidates, setMaxCandidates] = (0, import_react4.useState)(String(DEFAULT_MAX_CANDIDATES));
  const [threshold, setThreshold] = (0, import_react4.useState)(String(DEFAULT_THRESHOLD));
  const [gateOn, setGateOn] = (0, import_react4.useState)(true);
  const [checkOn, setCheckOn] = (0, import_react4.useState)(true);
  const [narrowOn, setNarrowOn] = (0, import_react4.useState)(true);
  const [completeOn, setCompleteOn] = (0, import_react4.useState)(true);
  const [completeMode, setCompleteMode] = (0, import_react4.useState)("observe");
  const [key, setKey] = (0, import_react4.useState)("");
  const [busy, setBusy] = (0, import_react4.useState)(false);
  const [advancedDirty, setAdvancedDirty] = (0, import_react4.useState)(false);
  const [backendDirty, setBackendDirty] = (0, import_react4.useState)(false);
  const [ready, setReady] = (0, import_react4.useState)(false);
  const [message, setMessage] = (0, import_react4.useState)(null);
  const [probeResult, setProbeResult] = (0, import_react4.useState)(null);
  const applyFeatures = (features) => {
    setGateOn(features?.gate !== false);
    setCheckOn(features?.check !== false);
    setNarrowOn(features?.narrow !== false);
    setCompleteOn(features?.complete !== false);
  };
  const applyBackend = (value) => {
    setConfig(value);
  };
  const applyAdvanced = (value) => {
    setCheckMode(value.checkSettings?.mode ?? "observe");
    setNarrowMode(value.narrowSettings?.mode ?? "enforce");
    setCompleteMode(value.completeSettings?.mode ?? "observe");
    setKeepPrefixes(prefixesText(value.narrowSettings));
    setMaxCandidates(String(maxCandidatesOf(value.narrowSettings)));
    setThreshold(String(thresholdOf(value.narrowSettings)));
  };
  const applyConfig = (value) => {
    applyBackend(value);
    applyAdvanced(value);
    applyFeatures(value.features);
  };
  (0, import_react4.useEffect)(() => {
    let live = true;
    setMessage(null);
    setReady(false);
    void request2("config", fetchFn).then((value) => {
      if (live) {
        applyConfig(value);
        setAdvancedDirty(false);
        setBackendDirty(false);
        setReady(true);
      }
    }).catch(() => {
      if (live) setMessage({ text: t("error"), ok: false });
    });
    return () => {
      live = false;
    };
  }, [t, fetchFn]);
  const toggleFeature = async (features, revert) => {
    setBusy(true);
    try {
      const value = await request2("config", fetchFn, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ features })
      });
      applyFeatures(value.features);
    } catch {
      revert();
      setMessage({ text: t("error"), ok: false });
    } finally {
      setBusy(false);
    }
  };
  const featureState = () => ({ gate: gateOn, check: checkOn, narrow: narrowOn, complete: completeOn });
  const saveAdvanced = async (event) => {
    event.preventDefault();
    const parsedCap = Number.parseInt(maxCandidates, 10);
    const cap = Number.isFinite(parsedCap) ? Math.min(200, Math.max(1, parsedCap)) : DEFAULT_MAX_CANDIDATES;
    const parsedThreshold = Number.parseFloat(threshold);
    const thresh = Number.isFinite(parsedThreshold) ? Math.min(1, Math.max(0, parsedThreshold)) : DEFAULT_THRESHOLD;
    setBusy(true);
    try {
      const value = await request2("config", fetchFn, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          checkSettings: { mode: checkMode },
          narrowSettings: { mode: narrowMode, keepPrefixes: parsePrefixes(keepPrefixes), maxCandidates: cap, threshold: thresh },
          completeSettings: { mode: completeMode }
        })
      });
      applyAdvanced(value);
      setAdvancedDirty(false);
      setMessage({ text: t("saved"), ok: true });
    } catch {
      setMessage({ text: t("error"), ok: false });
    } finally {
      setBusy(false);
    }
  };
  const saveBackend = async (event) => {
    event.preventDefault();
    const url = config.url.trim();
    const needsHttpConsent = url.startsWith("http://") && url !== config.httpApprovedUrl;
    if (needsHttpConsent && !window.confirm(`${t("httpWarning")}
${url}`)) return;
    setBusy(true);
    try {
      const value = await request2("config", fetchFn, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          model: config.model,
          ...key ? { apiKey: key } : {},
          ...needsHttpConsent ? { confirmHttpUrl: url } : {}
        })
      });
      applyBackend(value);
      setKey("");
      setBackendDirty(false);
      setMessage({ text: t("saved"), ok: true });
    } catch {
      setMessage({ text: t("error"), ok: false });
    } finally {
      setBusy(false);
    }
  };
  const probe = async () => {
    setBusy(true);
    setProbeResult(null);
    try {
      const value = await request2("probe", fetchFn, { method: "POST" });
      setProbeResult({ text: t(value.connected ? "connected" : "unavailable"), ok: value.connected });
    } catch {
      setProbeResult({ text: t("error"), ok: false });
    } finally {
      setBusy(false);
    }
  };
  const removeSavedKey = async () => {
    if (!window.confirm(t("removeKeyConfirm"))) return;
    setBusy(true);
    try {
      const value = await request2("config", fetchFn, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "" })
      });
      setConfig(value);
      setKey("");
      setMessage({ text: t("removeKeyDone"), ok: true });
    } catch {
      setMessage({ text: t("error"), ok: false });
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "decision-config", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { className: "decision-collapse", open: true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("summary", { className: "decision-collapse-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("h3", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(HeadIcon, { name: "features" }),
          t("basicFeatures")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "decision-collapse-icon", "aria-hidden": "true" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "decision-collapse-body", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          Toggle,
          {
            label: t("featureGate"),
            checked: gateOn,
            disabled: !ready || busy,
            onChange: (next) => {
              setGateOn(next);
              void toggleFeature({ ...featureState(), gate: next }, () => setGateOn(!next));
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "decision-muted", children: t("featureGateHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          Toggle,
          {
            label: t("featureCheck"),
            checked: checkOn,
            disabled: !ready || busy,
            onChange: (next) => {
              setCheckOn(next);
              void toggleFeature({ ...featureState(), check: next }, () => setCheckOn(!next));
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "decision-muted", children: t("featureCheckHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          Toggle,
          {
            label: t("featureNarrow"),
            checked: narrowOn,
            disabled: !ready || busy,
            onChange: (next) => {
              setNarrowOn(next);
              void toggleFeature({ ...featureState(), narrow: next }, () => setNarrowOn(!next));
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "decision-muted", children: t("featureNarrowHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          Toggle,
          {
            label: t("featureComplete"),
            checked: completeOn,
            disabled: !ready || busy,
            onChange: (next) => {
              setCompleteOn(next);
              void toggleFeature({ ...featureState(), complete: next }, () => setCompleteOn(!next));
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "decision-muted", children: t("featureCompleteHint") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { className: "decision-collapse", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("summary", { className: "decision-collapse-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("h3", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(HeadIcon, { name: "advanced" }),
          t("advancedConfig")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "decision-collapse-icon", "aria-hidden": "true" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("form", { className: "decision-collapse-body", onSubmit: (event) => void saveAdvanced(event), children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "decision-advanced-grid", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "decision-field-block", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "decision-subhead", children: t("advancedSwitches") }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              Toggle,
              {
                label: t("selfCheckSteer"),
                checked: checkMode === "steer",
                disabled: !ready || !checkOn,
                onChange: (next) => {
                  setCheckMode(next ? "steer" : "observe");
                  setAdvancedDirty(true);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "decision-muted", children: t("selfCheckHint") }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              Toggle,
              {
                label: t("narrowObserveLabel"),
                checked: narrowMode === "observe",
                disabled: !ready || !narrowOn,
                onChange: (next) => {
                  setNarrowMode(next ? "observe" : "enforce");
                  setAdvancedDirty(true);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "decision-muted", children: t("narrowHint") }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              Toggle,
              {
                label: t("completeSteer"),
                checked: completeMode === "steer",
                disabled: !ready || !completeOn,
                onChange: (next) => {
                  setCompleteMode(next ? "steer" : "observe");
                  setAdvancedDirty(true);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "decision-muted", children: t("completeHint") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "decision-field-block", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "decision-subhead", children: t("advancedParams") }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "decision-field", children: [
              t("narrowKeepLabel"),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "textarea",
                {
                  className: "decision-prefixes",
                  rows: 3,
                  value: keepPrefixes,
                  disabled: !ready || !narrowOn,
                  placeholder: "mcp__openviking",
                  onChange: (event) => {
                    setKeepPrefixes(event.target.value);
                    setAdvancedDirty(true);
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("small", { className: "decision-muted", children: t("narrowKeepHint") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "decision-field decision-field-inline", children: [
              t("narrowMaxLabel"),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "input",
                {
                  className: "decision-narrow-cap",
                  type: "number",
                  min: 1,
                  max: 200,
                  step: 1,
                  value: maxCandidates,
                  disabled: !ready || !narrowOn,
                  placeholder: "20",
                  onChange: (event) => {
                    setMaxCandidates(event.target.value);
                    setAdvancedDirty(true);
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("small", { className: "decision-muted", children: t("narrowMaxHint") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "decision-field decision-field-inline", children: [
              t("narrowThresholdLabel"),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "input",
                {
                  className: "decision-narrow-cap",
                  type: "number",
                  min: 0,
                  max: 1,
                  step: 0.05,
                  value: threshold,
                  disabled: !ready || !narrowOn,
                  placeholder: "0.3",
                  onChange: (event) => {
                    setThreshold(event.target.value);
                    setAdvancedDirty(true);
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("small", { className: "decision-muted", children: t("narrowThresholdHint") })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "decision-actions", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { disabled: busy || !ready || !advancedDirty, type: "submit", children: t("saveAdvanced") }) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("h3", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(HeadIcon, { name: "backend" }),
        t("backend")
      ] }),
      ready && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "decision-muted decision-destination", children: [
        t("destination"),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { children: config.effectiveUrl })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("form", { onSubmit: (event) => void saveBackend(event), children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "decision-field", children: [
          t("url"),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              type: "url",
              value: config.url,
              disabled: !ready,
              placeholder: "https://api.typesafe.ai",
              onChange: (event) => {
                setConfig({ ...config, url: event.target.value });
                setBackendDirty(true);
                setProbeResult(null);
              }
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "decision-field", children: [
          t("model"),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              value: config.model,
              disabled: !ready,
              placeholder: "jev-latest",
              onChange: (event) => {
                setConfig({ ...config, model: event.target.value });
                setBackendDirty(true);
                setProbeResult(null);
              }
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "decision-field", children: [
          t("key"),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              type: "password",
              autoComplete: "off",
              value: key,
              disabled: !ready,
              placeholder: config.apiKeySet ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "",
              onChange: (event) => {
                setKey(event.target.value);
                setBackendDirty(true);
                setProbeResult(null);
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("small", { className: "decision-muted", children: config.apiKeySet ? t("keyHintSaved") : t("keyHintEmpty") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "decision-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { disabled: busy || !ready, type: "submit", children: t("save") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "decision-secondary", disabled: busy || !ready || backendDirty, type: "button", onClick: () => void probe(), children: t("probe") }),
          probeResult && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { role: "status", className: `decision-probe-result${probeResult.ok ? " decision-message-ok" : " decision-message-warn"}`, children: probeResult.text })
        ] })
      ] }),
      config.apiKeySet && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "decision-danger-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "decision-danger-text", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "decision-danger-title", children: t("removeKey") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("small", { className: "decision-muted", children: t("removeKeyHint") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "decision-danger-button", disabled: busy || !ready, onClick: () => void removeSavedKey(), children: t("removeKeyButton") })
      ] })
    ] }),
    message && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "status", className: `decision-message${message.ok ? " decision-message-ok" : " decision-message-warn"}`, children: message.text })
  ] });
}

// src/client/styles.ts
var css = `
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
.decision-card-stats{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:.6rem;align-items:stretch}
.decision-stat{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:.2rem;padding:.5rem .3rem;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#f6f8fa)}
.decision-stat-num{font-size:1.35rem;font-weight:700;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,#202124)}
.decision-stat-pct{font-size:.74rem;font-weight:600;line-height:1;color:var(--dsw-alias-label-tertiary,#77818b);font-variant-numeric:tabular-nums}
.decision-stat-warn{color:#c98a1e}
.decision-stat-muted{color:var(--dsw-alias-label-tertiary,#9aa5b1)}
.decision-stat-label{font-size:.72rem;line-height:1.25;text-align:center;color:var(--dsw-alias-label-secondary,#59636e)}
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
.decision-analysis-trend{max-width:26rem}
.decision-analysis-note{margin:.5rem 0 0}
/* The analysis tab's decision log shares the page scroll (no inner scrollbar);
   the modal panel's .decision-log keeps its own capped scroll via the base rule. */
.decision-analysis .decision-log{max-height:none;overflow:visible}
.decision-pager{display:flex;align-items:center;justify-content:center;gap:.8rem;margin-top:.8rem}
.decision-pager button{border:1px solid var(--dsw-alias-border-l2,#ccd3da);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#59636e);padding:.3rem .85rem;font:inherit;font-size:.8rem;cursor:pointer}
.decision-pager button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1,#f2f4f6);color:var(--dsw-alias-label-primary,#202124)}
.decision-pager button:disabled{opacity:.45;cursor:default}
.decision-pager-status{font-size:.8rem;color:var(--dsw-alias-label-secondary,#59636e);font-variant-numeric:tabular-nums}
@media (prefers-color-scheme:dark){
  .decision-analysis{color:var(--dsw-alias-label-primary,#e6eaee)}
}
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
var import_jsx_runtime6 = require("react/jsx-runtime");
var inject = ["slots", "locale"];
function apply(ctx) {
  const t = ctx.locale.bind("dsh-decision-layer");
  ctx.effect(installStyles);
  ctx.effect(() => ctx.locale.register("dsh-decision-layer", dictionaries));
  ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
    name: "conversation.composer.dock",
    id: "decision-layer-panel",
    order: 20,
    locale: "dsh-decision-layer",
    registrant: "dsh-decision-layer",
    inject: (sessionId) => ({ sessionId })
  }, DecisionPanel));
  ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view",
    id: "decision-layer-analysis",
    order: 40,
    locale: "dsh-decision-layer",
    registrant: "dsh-decision-layer",
    label: () => t("analysisTab"),
    inject: (sessionId) => ({ sessionId })
  }, AnalysisView));
  ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register(
    { name: "plugins.bundle.config", key: "dsh-decision-layer", locale: "dsh-decision-layer" },
    (props) => props.view === "summary" ? props.t("summary") : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ConfigForm, { t: props.t })
  ));
}

    return module.exports;
  }
});
