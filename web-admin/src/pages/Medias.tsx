import { useEffect, useState } from 'react';
import { supabase, mediaUrl } from '../lib/supabase';

// Chưa introspect được cột chính xác (chưa có token) → select('*') và render
// linh hoạt: ảnh (cột url/image/thumbnail) + các trường còn lại. Toggle cờ
// available/public nếu bảng có.
type Row = Record<string, unknown>;

function urlOf(r: Row): string | null {
  for (const k of ['url', 'image', 'thumbnail', 'media_url', 'thumbnail_url']) {
    const v = r[k];
    if (typeof v === 'string' && v) return mediaUrl(v);
  }
  return null;
}
const FLAG_FIELDS = ['available', 'public', 'is_public'];

export default function Medias() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('medias').select('*').limit(300);
    if (error) setErr(error.message);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function patch(r: Row, field: string) {
    const id = r.id as string;
    setBusyId(id);
    const { error } = await supabase.from('medias').update({ [field]: !(r[field] === true) }).eq('id', id);
    if (error) setErr(error.message);
    else setRows((p) => p.map((x) => (x.id === id ? { ...x, [field]: !(x[field] === true) } : x)));
    setBusyId(null);
  }

  const flags = rows[0] ? FLAG_FIELDS.filter((f) => f in rows[0]) : [];

  return (
    <div className="page">
      <header className="page-header">
        <div><h2>Medias ({rows.length})</h2><div className="subtitle">Bảng <code>medias</code> (URL tuyệt đối, đa nguồn R2/CDN).</div></div>
        <div className="actions"><button className="ghost" onClick={() => void load()} disabled={loading}>↻ Tải lại</button></div>
      </header>
      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
      {loading ? <div className="card"><div className="muted small">Loading…</div></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {rows.map((r) => {
            const img = urlOf(r);
            const id = r.id as string;
            return (
              <div key={id} className="card" style={{ padding: 8 }}>
                <div style={{ aspectRatio: '3/4', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-elev-2)', border: '1px solid var(--border)', marginBottom: 6 }}>
                  {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="muted small" style={{ padding: 8 }}>no url</div>}
                </div>
                <div className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><code>{String(id).slice(0, 8)}</code></div>
                {flags.map((f) => (
                  <button key={f} className={r[f] === true ? 'primary small' : 'ghost small'} disabled={busyId === id} onClick={() => void patch(r, f)} style={{ width: '100%', marginTop: 4 }}>
                    {f}: {r[f] === true ? 'on' : 'off'}
                  </button>
                ))}
              </div>
            );
          })}
          {rows.length === 0 && <div className="muted small">Không có media.</div>}
        </div>
      )}
    </div>
  );
}
