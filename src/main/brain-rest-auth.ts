import { app, safeStorage } from 'electron';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BrainRestStatus, BrainRestTestResult } from '../shared/types';

/**
 * BrainRestAuth — credential store for the (bring-your-own) Obsidian
 * **Local REST API** community plugin (coddingtonbear), so Catalyst's
 * MCP-capable models can drive a running Obsidian vault. Mirrors the GitHub-PAT
 * pattern: the API key is encrypted at rest via Electron `safeStorage` and the
 * raw key NEVER crosses back to the renderer — only `hasKey` + the base URL do.
 *
 * This is interop with the *user's own* Obsidian; Catalyst never ships or
 * automates the Obsidian binary (ToS). The key is optional — the Brain works
 * fully via the direct filesystem without it.
 */

const STORE_FILE = 'brain-rest-auth.json';
const DEFAULT_BASE_URL = 'https://127.0.0.1:27124';

interface Persisted {
  baseUrl: string;
  /** Base64 of safeStorage.encryptString(key); absent when no key set. */
  encryptedKey?: string;
}

export class BrainRestAuth {
  private static _instance: BrainRestAuth | null = null;
  static instance(): BrainRestAuth {
    if (!this._instance) this._instance = new BrainRestAuth();
    return this._instance;
  }

  private storePath(): string {
    return path.join(app.getPath('userData'), STORE_FILE);
  }

  private read(): Persisted {
    try {
      const raw = fs.readFileSync(this.storePath(), 'utf8');
      const p = JSON.parse(raw) as Persisted;
      return { baseUrl: typeof p.baseUrl === 'string' && p.baseUrl ? p.baseUrl : DEFAULT_BASE_URL, encryptedKey: typeof p.encryptedKey === 'string' ? p.encryptedKey : undefined };
    } catch {
      return { baseUrl: DEFAULT_BASE_URL };
    }
  }

  private write(p: Persisted): void {
    const target = this.storePath();
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const tmp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(p, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, target);
    } catch {
      // Non-fatal.
    }
  }

  status(): BrainRestStatus {
    const p = this.read();
    return {
      hasKey: !!p.encryptedKey,
      baseUrl: p.baseUrl,
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
    };
  }

  /** Persist the base URL and (optionally) the API key. Empty key clears it. */
  setKey(baseUrl: string, key: string): BrainRestStatus {
    const p = this.read();
    if (typeof baseUrl === 'string' && baseUrl.trim().length > 0 && baseUrl.length <= 2048) {
      p.baseUrl = baseUrl.trim();
    }
    const trimmed = typeof key === 'string' ? key.trim() : '';
    if (trimmed.length === 0) {
      delete p.encryptedKey;
    } else if (safeStorage.isEncryptionAvailable()) {
      p.encryptedKey = safeStorage.encryptString(trimmed).toString('base64');
    } else {
      // No OS keychain — refuse to persist a plaintext secret; keep baseUrl.
      delete p.encryptedKey;
    }
    this.write(p);
    return this.status();
  }

  clear(): BrainRestStatus {
    const p = this.read();
    delete p.encryptedKey;
    this.write(p);
    return this.status();
  }

  /** Internal — never exposed over IPC. */
  private getKey(): string | null {
    const p = this.read();
    if (!p.encryptedKey) return null;
    try {
      return safeStorage.decryptString(Buffer.from(p.encryptedKey, 'base64'));
    } catch {
      return null;
    }
  }

  /**
   * Best-effort connectivity test against the Local REST API root. The plugin
   * defaults to HTTPS with a SELF-SIGNED cert, which Node's fetch rejects — we
   * surface that as a specific, actionable hint rather than a raw error.
   */
  async test(): Promise<BrainRestTestResult> {
    const { baseUrl } = this.read();
    const key = this.getKey();
    if (!key) return { ok: false, status: null, error: 'no-key' };
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      return { ok: res.ok, status: res.status, error: res.ok ? null : `http-${res.status}` };
    } catch (e) {
      const msg = String((e as Error).message || e);
      // Self-signed cert is the overwhelmingly common failure for this plugin.
      if (/certificate|self.signed|TLS|SSL/i.test(msg)) {
        return { ok: false, status: null, error: 'self-signed-cert' };
      }
      return { ok: false, status: null, error: 'unreachable' };
    }
  }
}
