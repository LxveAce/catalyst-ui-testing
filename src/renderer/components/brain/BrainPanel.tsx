import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  BrainConfig,
  BrainDiffLine,
  BrainNote,
  BrainNoteSummary,
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

      {notice && (
        <div style={noticeBox} onClick={() => setNotice(null)} title="Dismiss">
          {notice}
        </div>
      )}

      {view.kind === 'note' ? (
        <NoteEditor
          relPath={view.relPath}
          onBack={() => { setView({ kind: 'list' }); void refreshNotes(); }}
          onDeleted={() => { setView({ kind: 'list' }); void refreshNotes(); }}
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
  setNotice,
}: {
  relPath: string;
  onBack: () => void;
  onDeleted: () => void;
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
