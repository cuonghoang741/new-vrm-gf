// Tab MEDIA của một nhân vật: thêm media bằng URL, bật/tắt, xoá.
// Duyệt lớn, lọc, bật tắt hàng loạt, lightbox thì ở trang /medias.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mediaUrl, supabase } from '../../lib/supabase';
import { deleteOne, errMsg, insertOne, nullIfBlank, updateOne } from '../../lib/db';
import type { MediaRow } from '../../lib/types';

type Draft = { url: string; thumbnail: string; media_type: 'photo' | 'video'; tier: 'free' | 'pro'; available: boolean; name: string };
const EMPTY: Draft = { url: '', thumbnail: '', media_type: 'photo', tier: 'pro', available: false, name: '' };

export function MediaTab({ characterId }: { characterId: string }) {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from('medias')
      .select('*')
      .eq('character_id', characterId)
      .order('created_at', { ascending: false });
    if (error) setErr(error.message);
    setRows((data ?? []) as MediaRow[]);
  }
  useEffect(() => {
    void load();
  }, [characterId]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function add() {
    setErr('');
    if (!draft.url.trim()) return setErr('Cần có URL.');
    setBusy(true);
    try {
      await insertOne<MediaRow>('medias', {
        character_id: characterId,
        url: draft.url.trim(),
        thumbnail: nullIfBlank(draft.thumbnail),
        media_type: draft.media_type,
        tier: draft.tier,
        available: draft.available,
        name: nullIfBlank(draft.name),
        content_type: 'normal',
      });
      setDraft(EMPTY);
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(false);
  }

  async function patch(r: MediaRow, fields: Partial<MediaRow>) {
    try {
      await updateOne('medias', r.id, fields);
      setRows((p) => p.map((x) => (x.id === r.id ? { ...x, ...fields } : x)));
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  async function remove(r: MediaRow) {
    if (!confirm('Xoá media này? Không hoàn tác được.')) return;
    try {
      await deleteOne('medias', r.id);
      setRows((p) => p.filter((x) => x.id !== r.id));
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  const photos = rows.filter((r) => r.media_type === 'photo').length;

  return (
    <div>
      <div className="card">
        <h3>Thêm media</h3>
        <div className="row">
          <label>
            <span>Loại</span>
            <select value={draft.media_type} onChange={(e) => set('media_type', e.target.value as Draft['media_type'])}>
              <option value="photo">photo</option>
              <option value="video">video</option>
            </select>
          </label>
          <label>
            <span>Tier</span>
            <select value={draft.tier} onChange={(e) => set('tier', e.target.value as Draft['tier'])}>
              <option value="free">free</option>
              <option value="pro">pro</option>
            </select>
          </label>
          <label className="grow"><span>Tên / chú thích</span><input value={draft.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className="checkbox"><input type="checkbox" checked={draft.available} onChange={(e) => set('available', e.target.checked)} /><span>available</span></label>
        </div>
        <label><span>URL {draft.media_type === 'video' ? 'video' : 'ảnh'} — bắt buộc</span><input value={draft.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" /></label>
        <label><span>URL thumbnail {draft.media_type === 'video' ? '(nên có cho video)' : ''}</span><input value={draft.thumbnail} onChange={(e) => set('thumbnail', e.target.value)} placeholder="https://…" /></label>
        {err && <div className="error">{err}</div>}
        <div className="actions"><button className="primary" disabled={busy} onClick={() => void add()}>{busy ? 'Đang thêm…' : 'Thêm'}</button></div>
      </div>

      <div className="muted small" style={{ marginBottom: 8 }}>
        {photos} ảnh · {rows.length - photos} video · <Link to="/medias">duyệt / lọc / bật tắt hàng loạt ở trang Media ↗</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {rows.map((r) => {
          const src = mediaUrl(r.thumbnail ?? (r.media_type === 'photo' ? r.url : null));
          return (
            <div key={r.id} style={{ border: `1px solid ${r.tier === 'free' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elev-2)' }}>
              <a href={r.url} target="_blank" rel="noreferrer" style={{ display: 'block', position: 'relative', aspectRatio: '3/4', backgroundImage: src ? `url(${src})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', opacity: r.available ? 1 : 0.45 }}>
                {!src && <span className="muted" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🎬</span>}
                {r.media_type === 'video' && <span className="flag" style={{ position: 'absolute', top: 6, left: 6 }}>🎬</span>}
              </a>
              <div style={{ padding: '6px 8px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button className={r.tier === 'free' ? 'primary small' : 'ghost small'} onClick={() => void patch(r, { tier: r.tier === 'free' ? 'pro' : 'free' })}>{r.tier === 'free' ? '🔓' : '🔒'}</button>
                <button className={r.available ? 'primary small' : 'ghost small'} onClick={() => void patch(r, { available: !r.available })}>{r.available ? '👁' : '🚫'}</button>
                <button className="ghost small" style={{ marginLeft: 'auto' }} onClick={() => void remove(r)}>🗑</button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}>Chưa có media nào.</div>}
      </div>
    </div>
  );
}
