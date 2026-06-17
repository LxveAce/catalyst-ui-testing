import type { IpcMain } from 'electron';

export interface CompareResult {
  model: string;
  response: string;
  durationMs: number;
  error?: string;
}

const OLLAMA_BASE = 'http://localhost:11434';
const TIMEOUT_MS = 120_000;

async function generateOne(model: string, prompt: string): Promise<CompareResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const t0 = Date.now();

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: ac.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        model,
        response: '',
        durationMs: Date.now() - t0,
        error: `HTTP ${res.status}: ${body.slice(0, 200) || res.statusText}`,
      };
    }

    const data = (await res.json()) as { response?: string };
    return {
      model,
      response: data.response ?? '',
      durationMs: Date.now() - t0,
    };
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      model,
      response: '',
      durationMs: Date.now() - t0,
      error: isAbort
        ? `Timed out after ${TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function run(prompt: string, models: string[]): Promise<CompareResult[]> {
  return Promise.all(models.map((m) => generateOne(m, prompt)));
}

const MODEL_NAME_RE = /^[a-zA-Z0-9._:/-]+$/;
const MAX_MODELS = 4;
const MAX_MODEL_NAME_LEN = 256;

export function setupCompareIPC(ipcMain: IpcMain): void {
  ipcMain.handle('compare:run', async (_event, prompt: string, models: string[]) => {
    if (!prompt || typeof prompt !== 'string') {
      return [{ model: '', response: '', durationMs: 0, error: 'A prompt is required.' }];
    }
    if (!Array.isArray(models) || models.length < 2 || models.length > MAX_MODELS) {
      return [{ model: '', response: '', durationMs: 0, error: `Provide 2–${MAX_MODELS} models.` }];
    }
    for (const m of models) {
      if (typeof m !== 'string' || m.length === 0 || m.length > MAX_MODEL_NAME_LEN || !MODEL_NAME_RE.test(m)) {
        return [{ model: m ?? '', response: '', durationMs: 0, error: `Invalid model name: ${String(m).slice(0, 64)}` }];
      }
    }
    return run(prompt, models);
  });
}
