# Running dsh-decision-layer with a local tev1

Switch the adjudication backend from cloud Jev to a local [`tev1`](https://ollama.com/library/tev1) — Together AI's System One decision model fine-tuned from Qwen3.5-4B, served by ollama on the native `/v1/systemone` endpoint that matches this plugin's protocol. The upside: adjudication never leaves your machine, it is free, and nothing is sent out. tev1's context is only about 2050 tokens, and the tool-narrowing request can get large — but the plugin ships **adaptive batching** (`batchMode`, default `auto`) that falls back to one request per tool on small-context backends, so narrowing works out of the box on tev1 with no manual setup (see [Step 4](#step-4-adaptive-batching-for-tool-narrowing-tev1-notes)).

This guide is based on a real Apple Silicon (macOS, Metal) deployment; the commands and numbers are directly reusable.

## Prerequisites

- ollama **0.35 or newer** (required by tev1; `/v1/systemone` is available from 0.35)
- ~5GB free disk (`tev1:4b` is about 4.5GB)
- This plugin installed (see [README](<../../README.en.md>) "Install")

Confirm the ollama version and service:

```sh
ollama --version                             # must be >= 0.35
curl -s http://localhost:11434/api/version   # returns {"version":"..."} when running
```

## Step 1: Pull the model

```sh
ollama pull tev1:4b      # 4.5GB, more accurate (typed-decisions 0.733)
# or
ollama pull tev1:0.8b    # 812MB, lighter, but noticeably weaker on Chinese/complex judgments (0.635)
```

Two download gotchas, hit in practice:

1. **HuggingFace mirrors do not help.** `tev1` is served from ollama's own registry (`registry.ollama.ai`, Cloudflare-backed), not HuggingFace. So `HF_ENDPOINT=https://hf-mirror.com` and the like have no effect on `ollama pull tev1`; a slow direct connection is expected.

2. **Resume can stall or corrupt.** After repeated interruptions on a large file, ollama's shard-state files may become inconsistent, showing up as a repeating
   `Error: remove .../blobs/sha256-...-partial-N: no such file or directory` with the `partial` size frozen. Two fixes:
   - First try **restarting the ollama service process** (a stale connection may keep hitting a throttled Cloudflare IP):
     ```sh
     pkill -f "ollama serve"   # on macOS Ollama.app usually restarts it; /api/version recovers in seconds
     ```
   - If `no such file` persists, the shard state is corrupt — **delete that blob's partials and re-download** (only the partial temp files; the installed model is untouched):
     ```sh
     rm -f ~/.ollama/models/blobs/*<blob-id>*partial*
     ollama pull tev1:4b
     ```

Confirm when done:

```sh
ollama list     # tev1:4b should be listed
```

## Step 2: Keep the model resident (avoid cold-start timeouts)

The plugin's backend request timeout is hard-coded to 20 seconds (`service/backend.mjs`), while tev1's cold start (first load into memory) can approach or exceed that, and ollama unloads idle models after 5 minutes by default. The two colliding cause intermittent "unreachable". Warming up and pinning the model removes it:

```sh
# keep_alive=-1 means resident (UNTIL=Forever) — warm once, never unloaded
curl -s http://localhost:11434/v1/systemone -d '{
  "model":"tev1:4b","keep_alive":-1,
  "state":"warmup","questions":{"w":{"type":"noul","instructions":"warmup"}}
}'

ollama ps       # the UNTIL column shows Forever when it took effect
```

> **Residency is not persistent by itself.** The above is a **per-request** pin, valid only for the current `ollama serve` process — it is lost after restarting ollama or the machine, reverting to "unload after 5 min idle". For permanent residency, set a global env var on the service and restart ollama:
> ```sh
> launchctl setenv OLLAMA_KEEP_ALIVE -1    # macOS; takes effect after restarting Ollama.app
> ```

## Step 3: Point the plugin at local ollama

Backend config comes from three sources, in priority order: **config file > env vars > defaults** (defaults are `https://api.typesafe.ai` + `jev-latest`).

### Option A: Detail-page form (recommended)

In the plugin's detail-page config form:

| Field | Value |
|-------|-------|
| URL | `http://localhost:11434` |
| Model | `tev1:4b` |
| API Key | any non-empty string (e.g. `ollama`) — ollama ignores it, but the plugin requires a non-empty key to send requests |

Since this is a plaintext `http://` address, the first save asks you to **confirm the plaintext-transport risk** (loopback `localhost` never leaves the network, so confirm).

### Option B: Write the config file directly

The config file defaults to `~/.config/dsh-decision-layer/config.json` (override the path with `DSH_DECISION_CONFIG_PATH`). An `http://` URL only takes effect when `httpApprovedUrl` equals that URL:

```json
{
  "url": "http://localhost:11434",
  "model": "tev1:4b",
  "apiKey": "ollama",
  "httpApprovedUrl": "http://localhost:11434"
}
```

### Option C: Environment variables

```sh
export DSH_DECISION_BASE_URL=http://localhost:11434
export DSH_DECISION_MODEL=tev1:4b
export DSH_DECISION_API_KEY=ollama
```

> Even via env vars, the `http://` plaintext confirmation must still be set in the config (`httpApprovedUrl`), otherwise the backend refuses with a `config` reason.

## Step 4: Adaptive batching for tool narrowing (tev1 notes)

Of the four decision points, **danger gating / output self-check / task-completion check** all send small requests (a single command, one output, a few conditions) that sit comfortably within tev1's 2050 tokens — they work out of the box.

**Tool narrowing** is the special case: it sends one noul question per candidate tool, and under the System One protocol each question's prompt carries the full state plus the entire question set, so tokens grow **super-linearly** with the tool count. Dozens of tools sent as one batch easily expand to tens of thousands of tokens and are rejected by ollama with `400 prompt has N tokens; expected 1–2050`.

The plugin handles this with `narrowSettings.batchMode`, and **the default `auto` already works for tev1 with no manual setup**:

| batchMode | Behavior | When |
|-----------|----------|------|
| `auto` (default) | Sends one batch first (`single`); on a context-overflow (`http-error`), **immediately retries the same turn as one concurrent request per tool (`split`)** and switches all later narrowing in this host process to per-tool | Most cases, incl. tev1 |
| `single` | Always one whole-batch request | Large-context backends (Jev, one call) |
| `split` | Always one request per tool, run concurrently (concurrency 8) | Local tev1 — skips probing, leaves no probe log |

Two things to know about `auto` on tev1:

- **Narrowing does not actually fail because of this.** After `auto` detects the batch overflow, it reruns the same turn per-tool concurrently to complete narrowing; each per-tool request is only "state + one tool question", well within 2050 tokens. So the log may show one `http-error` the first time — that is the **normal side effect of the fallback probe**, not a sign narrowing is broken.
- **The fallback memory is per-process.** The flag lives in the current `dsh web` (host) process memory; later narrowing in the same process goes straight to per-tool with no probing. **Restarting the host resets it**, and the next first turn probes once again.

If you do not even want to see that one probe `http-error` in the log, set `split` explicitly to skip probing:

```json
{
  "url": "http://localhost:11434",
  "model": "tev1:4b",
  "apiKey": "ollama",
  "httpApprovedUrl": "http://localhost:11434",
  "narrowSettings": { "mode": "enforce", "batchMode": "split" }
}
```

> Narrowing is host code (`service/dsh.mjs`); config changes take effect only after restarting `dsh web`. Restart after editing config, or you keep running the old logic.
>
> If you do not need narrowing, you can also turn the decision point off on the detail page (`features.narrow=false`) and let tev1 run only the gating / self-check / completion checks it is better at.

## Step 5: Verify the link

Call local ollama through the plugin's own backend for an end-to-end check:

```sh
cd <plugin-dir>
node --input-type=module -e '
import { createBackend } from "./service/backend.mjs";
import { resolveConfig } from "./service/config-store.mjs";
const b = createBackend({ config: () => resolveConfig() });
const out = await b.evaluate({
  state: "User asks: drop the production users table right now, no confirmation.",
  questions: {
    danger: { type: "noul", instructions: "Is this a high-risk / destructive operation?" },
    gate: { type: "choice", instructions: "Which gating action should apply?",
      criteria: { allow: "allow directly", ask: "ask first", deny: "deny" } },
    severity: { type: "score", instructions: "Risk severity?", criteria: ["low","medium","high"] },
  },
});
console.log(JSON.stringify(out, null, 2));
'
```

Three valid answers for `danger`/`gate`/`severity` means the link works. Reference run (`tev1:4b`, Apple Silicon, warmed): `danger` noul ≈ 0.96, `gate` = ask, `severity` ≈ 1.54 (toward "high").

## Privacy & security

- **No outbound traffic.** With `http://localhost:11434`, every adjudication request stays on the loopback — it never touches the network or leaves the machine.
- **What's in a request.** The body is only `{state, questions, model}`. `state` carries a little of the current turn, per decision point: narrowing carries **user prompt text**, self-check carries **assistant reply text**, the completion check carries **user request text + tool names** (no tool arguments), and gating carries only a **command/path summary with suspected secrets redacted**. All are truncated at KB scale; the full multi-turn history is never sent.
- **Set the API key to a placeholder.** Local ollama ignores the key, but it is still placed in the `Authorization: Bearer` header of every request. Use a placeholder like `ollama` and do not leave a real cloud key in the local config — otherwise if `url` is ever switched back to the cloud by mistake, the key and conversation fragments go out together.
- **Listen on localhost only.** Confirm ollama binds `127.0.0.1:11434` (not `0.0.0.0`) so other machines on the LAN cannot reach it.

## Performance reference (measured, Apple Silicon / Metal)

| Item | tev1:4b | tev1:0.8b |
|------|---------|-----------|
| Size | 4.5GB | 812MB |
| Cold start | ~13s (resident afterward) | faster |
| Steady per-adjudication | ~0.4–2s | ~0.4s |
| typed-decisions accuracy (official) | 0.733 | 0.635 |
| Chinese danger-gate direction | correct (gate=ask, severity toward high) | weak (gate often misreads as allow, very low confidence) |

A CPU-only environment is much slower (official/early measurements around 4–7s per call, 20–30s cold start); there, residency matters even more, and mind the 20s backend timeout.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Intermittent "unreachable" | Cold start hits the 20s timeout + idle unload → warm up and pin resident (Step 2) |
| One `http-error` occasionally in the narrowing log | `batchMode: auto` already fell back to per-tool in the same turn after the batch overflow; narrowing did not actually fail. Set `split` to remove the probe log (Step 4) |
| Narrowing keeps failing, never falls back | Likely the running host is an old build (no `batchMode`) → restart `dsh web` so the new logic takes effect |
| `ollama pull` very slow | The registry does not use HF mirrors; a slow direct connection is normal. Restarting serve may switch IPs |
| `pull` repeatedly reports `remove ...partial-N: no such file` | Corrupt shard state → delete partials and re-download (Step 1) |
| Saving config reports "HTTP URL requires confirmation" | `http://` needs confirmation → add `httpApprovedUrl` or confirm on the detail page (Step 3) |
| Chinese judgments point the right way but with low confidence | tev1's Chinese calibration is limited — a known constraint; always calibrate thresholds on your own decision logs before fixing them |
