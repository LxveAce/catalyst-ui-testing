import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  BrainConfig,
  BrainDiffLine,
  BrainIndexStatus,
  BrainNote,
  BrainNoteSummary,
  BrainSearchHit,
} from '../../../shared/types';

/**
 * BrainPanel — the renderer surface for the Catalyst Brain (Obsidian-compatible
 * `.md` knowledge folder). Lets the user point Catalyst at a Brain folder, browse
 * + search notes, and read/edit them with a diff-before-write preview and
 * conflict-safe (hash-checked) saves.
 *
 * Single-column, view-switching layout (the right panel is narrow): a `list`
 * view (folder header + search + notes) and a `note` view (frontmatter + body
 * editor + diff + save/delete). "Brain" is deliberately NOT called a "vault".
 */

type View =
  | { kind: 'list' }
  | { kind: 'note'; relPath: string }
  | { kind: 'new' };

export function BrainPanel() {
  const [config, setConfig] = useState<BrainConfig | null>(null);
  const [notes, setNotes] = useState<BrainNoteSummary[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [notice, setNotice] = useState<string | null>(null);
  const [mirroring, setMirroring] = useState(false);
  // P3 — semantic search / RAG.
  const [sem, setSem] = useState('');
  const [semHits, setSemHits] = useState<BrainSearchHit[] | null>(null);
  const [semBusy, setSemBusy] = useState(false);
  const [building, setBuilding] = useState(false);
  const [indexInfo, setIndexInfo] = useState<BrainIndexStatus | null>(null);

  const refreshConfig = useCallback(async () => {
    try {
      const c = await window.electronAPI.brain.getConfig();
      setConfig(c);
      return c;
    } catch {
      setConfig({ folder: null, ready: false });
      return null;
    }
  }, []);

  const refreshNotes = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await window.electronAPI.brain.listNotes();
      setNotes(r.notes);
      setTruncated(r.truncated);
    } catch {
      setNotes([]);
      setTruncated(false);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const c = await refreshConfig();
      if (c?.ready) await refreshNotes();
    })();
  }, [refreshConfig, refreshNotes]);

  const pickFolder = useCallback(async () => {
    try {
      const c = await window.electronAPI.brain.pickFolder();
      setConfig(c);
      if (c.ready) {
        setView({ kind: 'list' });
        await refreshNotes();
      }
    } catch {
      setNotice('Could not open the folder picker.');
    }
  }, [refreshNotes]);

  const mirror = useCallback(async () => {
    setMirroring(true);
    try {
      const r = await window.electronAPI.brain.mirrorStreams();
      if (r.error) { setNotice(`Mirror failed: ${r.error}`); return; }
      const breakdown = Object.entries(r.bySource).map(([k, v]) => `${v} ${k}`).join(', ');
      setNotice(`Mirrored ${r.written} note${r.written === 1 ? '' : 's'} into _catalyst/${breakdown ? ` (${breakdown})` : ''}${r.failed ? ` · ${r.failed} failed` : ''}.`);
      await refreshNotes();
    } catch {
      setNotice('Mirror failed.');
    } finally {
      setMirroring(false);
    }
  }, [refreshNotes]);

  const refreshIndex = useCallback(async () => {
    try {
      setIndexInfo(await window.electronAPI.brain.indexStatus());
    } catch {
      setIndexInfo(null);
    }
  }, []);

  useEffect(() => { void refreshIndex(); }, [refreshIndex]);

  const buildIndex = useCallback(async () => {
    setBuilding(true);
    try {
      const r = await window.electronAPI.brain.indexRebuild();
      if (!r.ok) {
        setNotice(indexErrorMsg(r.error));
      } else {
        setNotice(`Index built: ${r.status?.chunks ?? 0} chunks from ${r.status?.notes ?? 0} notes (${r.status?.model}).`);
      }
      await refreshIndex();
    } catch {
      setNotice('Index build failed.');
    } finally {
      setBuilding(false);
    }
  }, [refreshIndex]);

  const semSearch = useCallback(async () => {
    if (!sem.trim()) { setSemHits(null); return; }
    setSemBusy(true);
    try {
      const r = await window.electronAPI.brain.indexQuery(sem.trim(), 12);
      if (!r.ok) { setSemHits(null); setNotice(indexErrorMsg(r.error)); return; }
      setSemHits(r.hits);
    } catch {
      setNotice('Search failed.');
    } finally {
      setSemBusy(false);
    }
  }, [sem]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) => n.relPath.toLowerCase().includes(q) || n.title.toLowerCase().includes(q)
    );
  }, [notes, query]);

  // --- not configured -------------------------------------------------------
  if (config && !config.ready) {
    return (
      <div style={{ animation: 'fadeIn 0.3s ease' }}>
        <Header onRefresh={() => void refreshConfig()} />
        <div style={emptyBox}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
            Point Catalyst at a <strong>Brain folder</strong> — any folder of
            Markdown notes (an Obsidian vault works as-is). Catalyst reads and
            writes the <code>.md</code> files directly; no Obsidian app required.
          </div>
          {config.folder && (
            <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 10 }}>
              Last folder is missing or unreadable: <code>{config.folder}</code>
            </div>
          )}
          <button onClick={() => void pickFolder()} style={primaryBtn}>
            Choose Brain folder…
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ animation: 'fadeIn 0.3s ease' }}>
        <Header onRefresh={() => void refreshConfig()} />
        <div style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 12 }}>Loading…</div>
      </div>
    );
  }

  // --- configured -----------------------------------------------------------
  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <Header onRefresh={() => void refreshConfig()} />

      <div style={folderRow}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Brain folder
          </div>
          <div
            title={config.folder ?? ''}
            style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {config.folder}
          </div>
        </div>
        <button
          onClick={async () => {
            const r = await window.electronAPI.brain.openInObsidian();
            if (!r.ok) setNotice('Couldn\'t open in Obsidian. Install Obsidian and add this folder as a vault first.');
          }}
          style={ghostBtn}
          title="Open this folder in Obsidian (obsidian:// — requires Obsidian installed with this folder added as a vault)"
        >
          Obsidian ↗
        </button>
        <button onClick={() => void pickFolder()} style={ghostBtn} title="Choose a different Brain folder">
          Change
        </button>
      </div>

      {view.kind === 'list' && (
        <button
          onClick={() => void mirror()}
          disabled={mirroring}
          style={{ ...ghostBtn, width: '100%', marginTop: 8, textAlign: 'center' }}
          title="Mirror Catalyst's journaling streams (LMM cycles, snippets, cost) into the Brain as schema-stamped notes under _catalyst/"
        >
          {mirroring ? 'Mirroring…' : '⟳ Mirror journaling streams → Brain'}
        </button>
      )}

      {view.kind === 'list' && (
        <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
              Semantic search
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {indexInfo?.built ? `${indexInfo.chunks} chunks · ${indexInfo.model}` : 'no index'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={sem}
              onChange={(e) => setSem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void semSearch(); }}
              placeholder="Ask the Brain (meaning, not keywords)…"
              style={searchInput}
            />
            <button onClick={() => void semSearch()} disabled={semBusy} style={semBusy ? primaryBtnDisabled : primaryBtnSm}>
              {semBusy ? '…' : 'Search'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <button onClick={() => void buildIndex()} disabled={building} style={ghostBtn} title="Embed all notes via an Ollama embedding model and build the vector index">
              {building ? 'Building index…' : indexInfo?.built ? 'Rebuild index' : 'Build index'}
            </button>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>via Ollama embeddings</span>
          </div>

          {semHits && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {semHits.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No matches.</div>
              )}
              {semHits.map((h, i) => (
                <button
                  key={`${h.relPath}-${h.chunkIndex}-${i}`}
                  onClick={() => setView({ kind: 'note', relPath: h.relPath })}
                  style={{ ...noteRow, alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  title={h.relPath}
                >
                  <div style={{ display: 'flex', width: '100%', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</span>
                    <span style={{ fontSize: 10, color: 'var(--accent-light)' }}>{(h.score * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, maxHeight: 44, overflow: 'hidden' }}>
                    {h.snippet}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {notice && (
        <div style={noticeBox} onClick={() => setNotice(null)} title="Dismiss">
          {notice}
        </div>
      )}

      {view.kind === 'list' && <RestApiSection setNotice={setNotice} />}

      {view.kind === 'note' ? (
        <NoteEditor
          relPath={view.relPath}
          onBack={() => { setView({ kind: 'list' }); void refreshNotes(); }}
          onDeleted={() => { setView({ kind: 'list' }); void refreshNotes(); }}
          onOpenNote={(rel) => setView({ kind: 'note', relPath: rel })}
          setNotice={setNotice}
        />
      ) : view.kind === 'new' ? (
        <NewNote
          onCancel={() => setView({ kind: 'list' })}
          onCreated={(rel) => { void refreshNotes(); setView({ kind: 'note', relPath: rel }); }}
          setNotice={setNotice}
        />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, padding: '10px 0', alignItems: 'center' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              style={searchInput}
            />
            <button onClick={() => setView({ kind: 'new' })} style={primaryBtnSm} title="Create a new note">
              + New
            </button>
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
            {loadingList ? 'Loading…' : `${filtered.length} note${filtered.length === 1 ? '' : 's'}`}
            {truncated && ' (showing first 5000)'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filtered.map((n) => (
              <button
                key={n.relPath}
                onClick={() => setView({ kind: 'note', relPath: n.relPath })}
                style={noteRow}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                title={n.relPath}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.relPath}
                  </div>
                </div>
              </button>
            ))}
            {!loadingList && filtered.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '12px 4px' }}>
                {notes.length === 0 ? 'No .md notes in this folder yet — create one.' : `No notes match "${query}".`}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- note editor -----------------------------------------------------------

function NoteEditor({
  relPath,
  onBack,
  onDeleted,
  onOpenNote,
  setNotice,
}: {
  relPath: string;
  onBack: () => void;
  onDeleted: () => void;
  onOpenNote: (relPath: string) => void;
  setNotice: (s: string | null) => void;
}) {
  const [note, setNote] = useState<BrainNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fm, setFm] = useState('');
  const [body, setBody] = useState('');
  const [hash, setHash] = useState<string | null>(null);
  const [diff, setDiff] = useState<BrainDiffLine[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [links, setLinks] = useState<{ backlinks: { relPath: string; title: string }[]; outgoing: { target: string; relPath: string | null }[] } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await window.electronAPI.brain.links(relPath);
        if (alive) setLinks(r.ok ? { backlinks: r.backlinks, outgoing: r.outgoing } : null);
      } catch {
        if (alive) setLinks(null);
      }
    })();
    return () => { alive = false; };
  }, [relPath]);

  const load = useCallback(async () => {
    setError(null);
    setDiff(null);
    try {
      const r = await window.electronAPI.brain.readNote(relPath);
      if ('error' in r) {
        setError(r.error);
        setNote(null);
        return;
      }
      setNote(r);
      setFm(r.frontmatterRaw ?? '');
      setBody(r.body);
      setHash(r.hash);
    } catch {
      setError('read-failed');
    }
  }, [relPath]);

  useEffect(() => { void load(); }, [load]);

  // Reconstruct full file content from the (possibly edited) frontmatter + body.
  const composed = useMemo(() => {
    const f = fm.trim();
    return f.length > 0 ? `---\n${fm.replace(/\n+$/, '')}\n---\n${body}` : body;
  }, [fm, body]);

  const dirty = note ? composed !== composeOriginal(note) : false;

  const preview = useCallback(async () => {
    try {
      const p = await window.electronAPI.brain.previewWrite(relPath, composed);
      if (p.error) { setNotice(`Cannot preview: ${p.error}`); return; }
      setDiff(p.diff);
    } catch {
      setNotice('Preview failed.');
    }
  }, [relPath, composed, setNotice]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const r = await window.electronAPI.brain.writeNote(relPath, composed, hash ?? undefined);
      if (!r.ok) {
        if (r.error === 'conflict') {
          setNotice('This note changed on disk since you opened it. Reload to see the new version (your edits are still here).');
        } else {
          setNotice(`Save failed: ${r.error}`);
        }
        return;
      }
      setHash(r.hash);
      setDiff(null);
      setNotice('Saved.');
      await load();
    } finally {
      setSaving(false);
    }
  }, [relPath, composed, hash, setNotice, load]);

  const doDelete = useCallback(async () => {
    try {
      const r = await window.electronAPI.brain.deleteNote(relPath);
      if (!r.ok) { setNotice(`Delete failed: ${r.error}`); return; }
      setNotice('Deleted.');
      onDeleted();
    } catch {
      setNotice('Delete failed.');
    }
  }, [relPath, setNotice, onDeleted]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
        <button onClick={onBack} style={ghostBtn} title="Back to the note list">← Notes</button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={relPath}>
          {relPath}
        </div>
        <button
          onClick={async () => {
            const r = await window.electronAPI.brain.openInObsidian(relPath);
            if (!r.ok) setNotice('Couldn\'t open in Obsidian (is it installed with this folder as a vault?).');
          }}
          style={ghostBtn}
          title="Open this note in Obsidian"
        >
          Obsidian ↗
        </button>
        <button onClick={() => void load()} style={ghostBtn} title="Reload from disk">↻</button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#fca5a5', padding: 12 }}>
          Couldn't open this note ({error}).
        </div>
      )}

      {note && (
        <>
          {(note.frontmatter.tags?.length || note.frontmatter.aliases?.length) ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {(note.frontmatter.tags ?? []).map((t) => (
                <span key={`t-${t}`} style={chip}>#{t}</span>
              ))}
              {(note.frontmatter.aliases ?? []).map((a) => (
                <span key={`a-${a}`} style={{ ...chip, opacity: 0.7 }}>{a}</span>
              ))}
            </div>
          ) : null}

          <Label>Frontmatter (YAML — preserved verbatim)</Label>
          <textarea
            value={fm}
            onChange={(e) => { setFm(e.target.value); setDiff(null); }}
            spellCheck={false}
            placeholder="(no frontmatter)"
            style={{ ...mono, minHeight: 64 }}
          />

          <Label>Body</Label>
          <textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setDiff(null); }}
            spellCheck={false}
            style={{ ...mono, minHeight: 220 }}
          />

          {(note.headings.length > 0 || note.links.length > 0) && (
            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-muted)', margin: '6px 0' }}>
              {note.headings.length > 0 && <span>{note.headings.length} heading{note.headings.length === 1 ? '' : 's'}</span>}
              {note.links.length > 0 && <span>{note.links.length} wikilink{note.links.length === 1 ? '' : 's'}</span>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, margin: '8px 0', flexWrap: 'wrap' }}>
            <button onClick={() => void preview()} disabled={!dirty} style={dirty ? ghostBtn : ghostBtnDisabled} title="Preview the exact changes before saving">
              Preview diff
            </button>
            <button onClick={() => void save()} disabled={!dirty || saving} style={dirty && !saving ? primaryBtnSm : primaryBtnDisabled}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <div style={{ flex: 1 }} />
            {confirmDelete ? (
              <>
                <span style={{ fontSize: 11, color: '#fca5a5', alignSelf: 'center' }}>Delete?</span>
                <button onClick={() => void doDelete()} style={dangerBtn}>Yes</button>
                <button onClick={() => setConfirmDelete(false)} style={ghostBtn}>No</button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} style={ghostBtnDanger} title="Delete this note">Delete</button>
            )}
          </div>

          {diff && <DiffView diff={diff} />}

          {links && (links.backlinks.length > 0 || links.outgoing.length > 0) && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              {links.backlinks.length > 0 && (
                <>
                  <Label>Linked from ({links.backlinks.length})</Label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
                    {links.backlinks.map((b) => (
                      <button key={b.relPath} onClick={() => onOpenNote(b.relPath)} style={linkRow} title={b.relPath}>
                        ← {b.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {links.outgoing.length > 0 && (
                <>
                  <Label>Links to ({links.outgoing.length})</Label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {links.outgoing.map((o) => (
                      o.relPath ? (
                        <button key={o.target} onClick={() => onOpenNote(o.relPath!)} style={chip} title={o.relPath}>
                          [[{o.target}]]
                        </button>
                      ) : (
                        <span key={o.target} style={{ ...chip, opacity: 0.5, background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-muted)' }} title="Unresolved — no matching note">
                          [[{o.target}]]?
                        </span>
                      )
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- new note --------------------------------------------------------------

function NewNote({
  onCancel,
  onCreated,
  setNotice,
}: {
  onCancel: () => void;
  onCreated: (relPath: string) => void;
  setNotice: (s: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const create = useCallback(async () => {
    let rel = name.trim();
    if (!rel) { setNotice('Enter a note name.'); return; }
    if (!rel.toLowerCase().endsWith('.md')) rel += '.md';
    setBusy(true);
    try {
      const content = body.length > 0 ? body : `# ${rel.replace(/\.md$/i, '').split('/').pop()}\n`;
      const r = await window.electronAPI.brain.createNote(rel, content);
      if (!r.ok || !r.relPath) {
        setNotice(r.error === 'already-exists' ? 'A note with that name already exists.' : `Create failed: ${r.error}`);
        return;
      }
      onCreated(r.relPath);
    } finally {
      setBusy(false);
    }
  }, [name, body, setNotice, onCreated]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
        <button onClick={onCancel} style={ghostBtn}>← Notes</button>
        <div style={{ fontSize: 12, fontWeight: 600 }}>New note</div>
      </div>
      <Label>Name (relative path, `.md` optional)</Label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="folder/My Note"
        style={{ ...mono, minHeight: 0, height: 32 }}
        spellCheck={false}
      />
      <Label>Body</Label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} style={{ ...mono, minHeight: 180 }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={() => void create()} disabled={busy} style={busy ? primaryBtnDisabled : primaryBtnSm}>
          {busy ? 'Creating…' : 'Create'}
        </button>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
    </div>
  );
}

// --- Local REST API (BYO Obsidian) -----------------------------------------

function RestApiSection({ setNotice }: { setNotice: (s: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://127.0.0.1:27124');
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await window.electronAPI.brain.restStatus();
      setHasKey(s.hasKey);
      setBaseUrl(s.baseUrl);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  return (
    <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ ...ghostBtn, width: '100%', textAlign: 'left', border: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
        title="Optional: connect to a running Obsidian via the Local REST API plugin so MCP-capable models can drive your vault"
      >
        <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
          Obsidian Local REST API (optional)
        </span>
        <span style={{ fontSize: 10, color: hasKey ? 'var(--accent-light)' : 'var(--text-muted)' }}>
          {hasKey ? 'key saved' : 'not set'} {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 6 }}>
            For the <code>coddingtonbear/obsidian-local-rest-api</code> plugin. The
            key is encrypted at rest (OS keychain) and never leaves the main
            process. The Brain works fully without this — it's only for driving a
            live Obsidian instance.
          </div>
          <Label>Base URL</Label>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} style={{ ...mono, minHeight: 0, height: 30 }} />
          <Label>API key</Label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={hasKey ? '•••••••• (saved — type to replace)' : 'paste the plugin API key'}
            spellCheck={false}
            style={{ ...mono, minHeight: 0, height: 30 }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                setBusy(true);
                try {
                  const s = await window.electronAPI.brain.restSet(baseUrl, key);
                  setHasKey(s.hasKey);
                  setKey('');
                  setNotice(s.hasKey ? 'Saved Local REST API key.' : (s.encryptionAvailable ? 'Saved base URL.' : 'OS keychain unavailable — key not stored.'));
                } finally { setBusy(false); }
              }}
              disabled={busy}
              style={busy ? primaryBtnDisabled : primaryBtnSm}
            >
              Save
            </button>
            <button
              onClick={async () => {
                const r = await window.electronAPI.brain.restTest();
                setNotice(
                  r.ok ? 'Connected to Obsidian Local REST API ✓'
                  : r.error === 'self-signed-cert' ? 'Reached it, but the plugin uses a self-signed HTTPS cert (expected). Treat as connectable; full requests need cert handling (future).'
                  : r.error === 'no-key' ? 'Save a key first.'
                  : 'Could not reach the Local REST API (is Obsidian running with the plugin enabled?).'
                );
              }}
              style={ghostBtn}
            >
              Test
            </button>
            {hasKey && (
              <button
                onClick={async () => { const s = await window.electronAPI.brain.restClear(); setHasKey(s.hasKey); setNotice('Cleared the saved key.'); }}
                style={ghostBtnDanger}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- bits ------------------------------------------------------------------

function Header({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--accent-gradient)' }} />
        Brain
      </h3>
      <button onClick={onRefresh} style={ghostBtn} title="Refresh">↻</button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '8px 0 3px' }}>
      {children}
    </div>
  );
}

function DiffView({ diff }: { diff: BrainDiffLine[] }) {
  const changed = diff.some((d) => d.type !== 'same');
  return (
    <div style={{ marginTop: 8 }}>
      <Label>{changed ? 'Diff (what will be written)' : 'No changes'}</Label>
      <div style={diffBox}>
        {diff.map((d, i) => (
          <div
            key={i}
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: d.type === 'add' ? '#86efac' : d.type === 'del' ? '#fca5a5' : 'var(--text-muted)',
              background: d.type === 'add' ? 'rgba(34,197,94,0.08)' : d.type === 'del' ? 'rgba(239,68,68,0.08)' : 'transparent',
            }}
          >
            {d.type === 'add' ? '+ ' : d.type === 'del' ? '- ' : '  '}{d.text || ' '}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Human-readable message for a RAG index error code. */
function indexErrorMsg(error: string | null): string {
  switch (error) {
    case 'no-brain-folder': return 'Choose a Brain folder first.';
    case 'ollama-unreachable': return 'Ollama isn\'t running. Start it (or launch a model) and try again.';
    case 'model-missing': return 'The embedding model isn\'t pulled. In a terminal: `ollama pull nomic-embed-text`.';
    case 'no-notes': return 'No notes to index yet.';
    case 'not-built': return 'Build the index first (Build index).';
    default: return 'Index operation failed.';
  }
}

/** Recompose a note's original file content for dirty-checking. */
function composeOriginal(note: BrainNote): string {
  return note.frontmatterRaw !== null
    ? `---\n${note.frontmatterRaw}\n---\n${note.body}`
    : note.body;
}

// --- styles ----------------------------------------------------------------

const emptyBox: React.CSSProperties = {
  marginTop: 14,
  padding: 16,
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
};
const folderRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 10,
  padding: '8px 10px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
};
const noteRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 8px',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
};
const searchInput: React.CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};
const mono: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 8,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace',
  fontSize: 12,
  lineHeight: 1.45,
  outline: 'none',
  resize: 'vertical',
};
const diffBox: React.CSSProperties = {
  maxHeight: 220,
  overflow: 'auto',
  padding: 8,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg-primary)',
  fontFamily: '"Cascadia Code", "Fira Code", monospace',
  fontSize: 11,
  lineHeight: 1.4,
};
const chip: React.CSSProperties = {
  fontSize: 10,
  padding: '1px 7px',
  borderRadius: 999,
  background: 'var(--accent-dim)',
  color: 'var(--accent-light)',
  border: '1px solid var(--border-active)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const linkRow: React.CSSProperties = {
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: 11,
  padding: '3px 4px',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'inherit',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const noticeBox: React.CSSProperties = {
  marginTop: 10,
  padding: '6px 10px',
  fontSize: 11,
  color: '#fcd34d',
  background: 'rgba(251,191,36,0.08)',
  border: '1px solid rgba(251,191,36,0.25)',
  borderRadius: 6,
  cursor: 'pointer',
};
const primaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--accent-gradient, #8b5cf6)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const primaryBtnSm: React.CSSProperties = { ...primaryBtn, padding: '6px 12px', fontWeight: 500 };
const primaryBtnDisabled: React.CSSProperties = { ...primaryBtnSm, opacity: 0.5, cursor: 'not-allowed' };
const ghostBtn: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const ghostBtnDisabled: React.CSSProperties = { ...ghostBtn, opacity: 0.5, cursor: 'not-allowed' };
const ghostBtnDanger: React.CSSProperties = { ...ghostBtn, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' };
const dangerBtn: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: 'none',
  background: '#ef4444',
  color: '#fff',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
