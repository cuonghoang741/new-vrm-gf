import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type Row = Record<string, unknown>;

// Field text/số cho phép sửa trực tiếp (khớp cột suy từ app new-vrm).
const TEXT_FIELDS = [
  'name', 'description', 'instruction', 'tier', 'thumbnail_url', 'avatar',
  'small_thumb_url', 'small_avatar', 'base_model_url', 'agent_elevenlabs_id',
  'background_default_id',
];
const BOOL_FIELDS = ['available', 'is_public'];

export default function CharacterEditor() {
  const { id } = useParams();
  const [row, setRow] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [translates, setTranslates] = useState<Row[]>([]);
  const [costumes, setCostumes] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [c, tr, co] = await Promise.all([
        supabase.from('characters').select('*').eq('id', id).maybeSingle(),
        supabase.from('character_translates').select('language_code, name, description').eq('character_id', id),
        supabase.from('character_costumes').select('id, costume_name, tier, price_ruby, available').eq('character_id', id),
      ]);
      if (c.error) setErr(c.error.message);
      setRow((c.data as Row) ?? null);
      setDraft((c.data as Row) ?? {});
      setTranslates((tr.data as Row[]) ?? []);
      setCostumes((co.data as Row[]) ?? []);
      setLoading(false);
    })();
  }, [id]);

  async function save() {
    if (!row) return;
    setSaving(true); setErr('');
    const patch: Row = {};
    for (const f of [...TEXT_FIELDS, ...BOOL_FIELDS]) {
      if (f in draft && draft[f] !== row[f]) patch[f] = draft[f];
    }
    if (Object.keys(patch).length === 0) { setSaving(false); return; }
    const { error } = await supabase.from('characters').update(patch).eq('id', id);
    if (error) setErr(error.message);
    else { setRow({ ...row, ...patch }); setSavedAt(new Date()); }
    setSaving(false);
  }

  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  if (loading) return <div className="page"><div className="card"><div className="muted small">Loading…</div></div></div>;
  if (!row) return <div className="page"><div className="error">Không tìm thấy nhân vật.</div></div>;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2>{String(row.name ?? '(no name)')}</h2>
          <div className="subtitle"><Link to="/">← Characters</Link> · <code>{String(id)}</code></div>
        </div>
        <div className="actions">
          {savedAt && <span className="muted small" style={{ color: 'var(--ok)' }}>✓ đã lưu {savedAt.toLocaleTimeString()}</span>}
          <button className="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </header>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Thông tin</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          {BOOL_FIELDS.map((f) => (
            <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={draft[f] === true} onChange={(e) => set(f, e.target.checked)} />
              <span>{f}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {TEXT_FIELDS.map((f) => {
            const multi = f === 'description' || f === 'instruction';
            return (
              <label key={f} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: multi ? '1 / -1' : undefined }}>
                <span className="muted small">{f}</span>
                {multi ? (
                  <textarea value={String(draft[f] ?? '')} onChange={(e) => set(f, e.target.value)} rows={f === 'instruction' ? 6 : 3} style={inputCss} />
                ) : (
                  <input value={String(draft[f] ?? '')} onChange={(e) => set(f, e.target.value)} style={inputCss} />
                )}
              </label>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Bản dịch ({translates.length}) — <code>character_translates</code></h3>
        {translates.length === 0 ? <div className="muted small">Chưa có bản dịch.</div> : translates.map((t, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <b>{String(t.language_code)}</b> — {String(t.name ?? '')}
            <div className="muted small">{String(t.description ?? '')}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Trang phục ({costumes.length}) — <Link to="/costumes">quản lý ở Costumes</Link></h3>
        {costumes.map((c) => (
          <div key={String(c.id)} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            {String(c.costume_name ?? '(no name)')} · tier {String(c.tier ?? '—')} · 💎{String(c.price_ruby ?? 0)} · {c.available ? 'available' : 'off'}
          </div>
        ))}
      </div>
    </div>
  );
}

const inputCss: CSSProperties = {
  padding: '8px 10px', background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)', fontSize: 13, fontFamily: 'ui-monospace, Menlo, monospace',
};
