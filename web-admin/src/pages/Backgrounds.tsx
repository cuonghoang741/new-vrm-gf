import { useEffect, useState, type CSSProperties } from 'react';
import { supabase, mediaUrl } from '../lib/supabase';

type Row = {
  id: string; name: string | null; thumbnail: string | null; image: string | null;
  tier: string | number | null; video_url: string | null; is_dark: boolean | null;
  price_ruby: number | null; available: boolean | null; public: boolean | null;
};

export default function Backgrounds() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('backgrounds')
      .select('id, name, thumbnail, image, tier, video_url, is_dark, price_ruby, available, public')
      .order('name', { ascending: true });
    if (error) setErr(error.message);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function patch(id: string, fields: Partial<Row>) {
    setBusyId(id);
    const { error } = await supabase.from('backgrounds').update(fields).eq('id', id);
    if (error) setErr(error.message);
    else setRows((p) => p.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    setBusyId(null);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div><h2>Backgrounds ({rows.length})</h2><div className="subtitle">Bảng <code>backgrounds</code>.</div></div>
        <div className="actions"><button className="ghost" onClick={() => void load()} disabled={loading}>↻ Tải lại</button></div>
      </header>
      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
      {loading ? <div className="card"><div className="muted small">Loading…</div></div> : (
        <div className="card" style={{ padding: 0 }}>
          {rows.map((r) => {
            const img = mediaUrl(r.thumbnail ?? r.image);
            const dp = draftPrice[r.id];
            return (
              <div key={r.id} style={rowCss}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                  <span style={thumbCss}>{img ? <img src={img} alt="" style={imgCss} /> : '🖼️'}</span>
                  <div style={{ minWidth: 0 }}>
                    <div>{r.name ?? '(no name)'}{r.video_url ? ' 🎬' : ''}{r.is_dark ? ' 🌙' : ''}</div>
                    <div className="muted small">tier {String(r.tier ?? '—')}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="muted small">💎</span>
                  <input value={dp ?? String(r.price_ruby ?? 0)} onChange={(e) => setDraftPrice((d) => ({ ...d, [r.id]: e.target.value }))} inputMode="numeric" style={priceCss} />
                  <button className="ghost" disabled={busyId === r.id || dp === undefined || dp === String(r.price_ruby ?? 0)} onClick={() => void patch(r.id, { price_ruby: Number(dp) || 0 })}>Lưu giá</button>
                  <button className={r.public ? 'primary' : 'ghost'} disabled={busyId === r.id} onClick={() => void patch(r.id, { public: !(r.public === true) })} style={{ minWidth: 84 }}>{r.public ? 'Public' : 'Hidden'}</button>
                  <button className={r.available ? 'primary' : 'ghost'} disabled={busyId === r.id} onClick={() => void patch(r.id, { available: !(r.available === true) })} style={{ minWidth: 96 }}>{r.available ? 'Available' : 'Off'}</button>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="muted small" style={{ padding: 16 }}>Không có background.</div>}
        </div>
      )}
    </div>
  );
}

const rowCss: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border)' };
const thumbCss: CSSProperties = { width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elev-2)', border: '1px solid var(--border)' };
const imgCss: CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' };
const priceCss: CSSProperties = { width: 80, padding: '6px 8px', background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 };
