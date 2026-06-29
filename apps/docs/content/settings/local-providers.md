---
title: Local providers
description: Run models locally with LM Studio, Ollama, and compatible servers.
---

Open **Settings → Local providers** to connect local or self-hosted model servers.

## Supported providers

| Provider | Description |
|----------|-------------|
| **LM Studio** | Local models via LM Studio server |
| **Ollama** | Models running in Ollama |
| **API for Cursor** | Cursor-compatible local API |
| **Custom** | Any OpenAI-compatible HTTP API |

## Setup flow

1. Start your local server (e.g. `ollama serve`)
2. Open **Settings → Local providers**
3. Select the provider type
4. Enter the server URL (default ports are suggested)
5. Click **Discover models**
6. Available models are written to your local `models.json`

## Using local models

After discovery, local models appear in the model switcher alongside cloud models.

## Privacy

Local providers keep inference on your machine. No data is sent to cloud APIs when using purely local models.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No models discovered | Verify server is running and URL is correct |
| Connection refused | Check firewall and port |
| Invalid API key | Some custom servers require a key in settings |

See [Troubleshooting](/reference/troubleshooting).

## Related

- [Models](/chat/models)
- [Secrets](/settings/secrets)
