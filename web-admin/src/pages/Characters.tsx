import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mediaUrl } from '../lib/supabase';

export type CharacterRow = {
  id: string;
  name: string | null;
  description: string | null;
  thumbnail_url: string | null;
  avatar: string | null;
  tier: string | number | null;
  available: boolean | null;
  is_public: boolean | null;
};

const COLS = 'id, name, description, thumbnail_url, avatar, tier, available, is_public';

export default function Characters() {
  const [rows, setRows] = useState<CharacterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('characters')
      .select(COLS)
      .order('name', { ascending: true });
    if (error) setErr(error.message);
    setRows((data as CharacterRow[] | null) ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggle(c: CharacterRow, field: 'available' | 'is_public') {
    setBusyId(c.id);
    const next = !(c[field] === true);
    const { error } = await supabase.from('characters').update({ [field]: next }).eq('id', c.id);
    if (error) setErr(error.message);
    else setRows((p) => p.map((r) => (r.id === c.id ? { ...r, [field]: next } : r)));
    setBusyId(null);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2>Characters ({rows.length})</h2>
          <div className="subtitle">Danh sách nhân vật (bảng <code>characters</code>).</div>
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => void load()} disabled={loading}>↻ Tải lại</button>
        </div>
      </header>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div className="card"><div className="muted small">Loading…</div></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {rows.map((c) => {
            const img = mediaUrl(c.thumbnail_url ?? c.avatar);
            return (
              <div key={c.id} className="rc-row" style={rowStyle}>
                <Link to={`/characters/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, textDecoration: 'none', color: 'inherit', flex: 1 }}>
                  <span style={avatarBox}>
                    {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (c.name?.[0] ?? '?')}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15 }}>{c.name ?? '(no name)'}</div>
                    <div className="muted small">tier: {String(c.tier ?? '—')} · <code>{c.id.slice(0, 8)}</code></div>
                  </span>
                </Link>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={c.is_public ? 'primary' : 'ghost'} disabled={busyId === c.id} onClick={() => void toggle(c, 'is_public')} style={{ minWidth: 90 }}>
                    {c.is_public ? 'Public' : 'Hidden'}
                  </button>
                  <button className={c.available ? 'primary' : 'ghost'} disabled={busyId === c.id} onClick={() => void toggle(c, 'available')} style={{ minWidth: 96 }}>
                    {c.available ? 'Available' : 'Off'}
                  </button>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="muted small" style={{ padding: 16 }}>Không có nhân vật.</div>}
        </div>
      )}
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border)',
};
const avatarBox: CSSProperties = {
  width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
};
