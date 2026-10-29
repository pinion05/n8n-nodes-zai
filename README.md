# n8n-nodes-zai

n8n node to call **OpenAI-compatible LLM APIs directly** from a workflow — no agent, no tools, just a pure LLM call. Built for **Z.ai GLM coding plans** but works with any OpenAI-compatible gateway (local freellmapi, OpenRouter, vLLM, …) via the **Custom baseUrl** endpoint.

## Endpoints

| Endpoint | Base URL |
|---|---|
| Z.ai Coding Plan | `https://api.z.ai/api/coding/paas/v4` |
| Z.ai Normal Plan | `https://api.z.ai/api/paas/v4` |
| **Custom** (any OpenAI-compatible) | your baseUrl, e.g. `http://127.0.0.1:3001/v1` |

## Parameters

| Param | Notes |
|---|---|
| Model | dynamic dropdown (`GET /models` of the selected endpoint) — expressions allow arbitrary ids |
| System / Prompt | system + user messages |
| Thinking | `auto` (omit) · `enabled` · `disabled` (GLM `thinking.type`) |
| Temperature / Max Tokens | sent when > 0 |
| Timeout (초) | default 120 |
| options.concurrency | parallel per-item calls (bounded pool, default 1) |
| options.jsonMode | `response_format: json_object` — output text is parsed to an object |

## Credential

Uses the built-in **Header Auth** credential: `Authorization: Bearer <key>`.

## Output

```json
{ "ok": true, "text": "...", "model": "glm-5.3", "usage": { ... }, "finishReason": "stop" }
```

Failures never throw the workflow — they return `{ ok: false, error: "..." }`, matching the clean-failure pattern of [n8n-nodes-pi](https://github.com/pinion05/n8n-nodes-pi).

## Install (community node)

```bash
npm install n8n-nodes-zai
```

…once published to npm; meanwhile: `Settings → Community Nodes → Install from GitHub`: `pinion05/n8n-nodes-zai`.

## License

MIT
