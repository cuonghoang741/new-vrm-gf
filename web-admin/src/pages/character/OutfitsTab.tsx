// Tab TRANG PHỤC của một nhân vật — form đầy đủ (URL VRM, ảnh, video, giá…).
// Trang /costumes là chỗ nhìn bao quát + bật tắt nhanh; đây là chỗ sửa sâu.

import { useEffect, useState } from 'react';
import { mediaUrl, supabase } from '../../lib/supabase';
import { deleteOne, errMsg, insertOne, nullIfBlank, parsePrice, updateOne } from '../../lib/db';
import VrmPreviewModal from '../../components/VrmPreviewModal';
import type { Costume } from '../../lib/types';
import { UnlockBadge, UnlockSelect } from '../../components/UnlockType';
import { asUnlock, unlockProblem, type UnlockType } from '../../lib/unlock';

type Draft = {
  costume_name: string;
  url: string;
  thumbnail: string;
  model_url: string;
  video_url: string;
  unlock_type: UnlockType;
  price_ruby: string;
  available: boolean;
  description: string;
};

const EMPTY: Draft = {
  costume_name: '', url: '', thumbnail: '', model_url: '', video_url: '',
  unlock_type: 'ads', price_ruby: '0', available: false, description: '',
};

function toDraft(c: Costume): Draft {
  return {
    costume_name: c.costume_name, url: c.url ?? '', thumbnail: c.thumbnail ?? '', model_url: c.model_url ?? '',
    video_url: c.video_url ?? '', unlock_type: asUnlock(c.unlock_type), price_ruby: String(c.price_ruby ?? 0),
    available: !!c.available, description: c.description ?? '',
  };
}

export function OutfitsTab({
  characterId,
  defaultCostumeId,
  onDefaultChange,
}: {
  characterId: string;
  defaultCostumeId: string | null;
  onDefaultChange: (id: string | null) => void;
}) {
  const [rows, setRows] = useState<Costume[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string | null; title: string } | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from('character_costumes')
      .select('*')
      .eq('character_id', characterId)
      .order('created_at');
    if (error) setErr(error.message);
    setRows((data ?? []) as Costume[]);
  }
  useEffect(() => {
    void load();
  }, [characterId]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setErr('');
    if (!draft.costume_name.trim()) return setErr('Cần có tên trang phục.');
    // `url` là NOT NULL trong DB và là ảnh app dùng khi thiếu thumbnail.
    if (!draft.url.trim()) return setErr('Cần có URL ảnh (cột url, bắt buộc).');
    const price = parsePrice(draft.price_ruby);
    if (price === null) return setErr(`Giá "${draft.price_ruby}" không hợp lệ — phải là số nguyên ≥ 0.`);
    const problem = unlockProblem(draft.unlock_type, price);
    if (problem) return setErr(problem);
    const row = {
      character_id: characterId,
      costume_name: draft.costume_name.trim(),
      url: draft.url.trim(),
      thumbnail: nullIfBlank(draft.thumbnail),
      model_url: nullIfBlank(draft.model_url),
      video_url: nullIfBlank(draft.video_url),
      unlock_type: draft.unlock_type,
      price_ruby: price,
      available: draft.available,
      description: nullIfBlank(draft.description),
    };
    setBusy(true);
    try {
      if (editingId) await updateOne('character_costumes', editingId, row);
      else await insertOne<Costume>('character_costumes', row);
      setDraft(EMPTY);
      setEditingId(null);
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(false);
  }

  async function remove(c: Costume) {
    if (!confirm(`Xoá trang phục "${c.costume_name}"? Không hoàn tác được.`)) return;
    try {
      await deleteOne('character_costumes', c.id);
      if (defaultCostumeId === c.id) onDefaultChange(null);
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  async function toggle(c: Costume) {
    try {
      await updateOne('character_costumes', c.id, { available: !c.available });
      setRows((p) => p.map((r) => (r.id === c.id ? { ...r, available: !c.available } : r)));
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  const thumb = mediaUrl(draft.thumbnail || draft.url);

  return (
    <div>
      <div className="card">
        <h3>{editingId ? 'Sửa trang phục' : 'Thêm trang phục'}</h3>
        <div className="row">
          <label className="grow"><span>Tên</span><input value={draft.costume_name} onChange={(e) => set('costume_name', e.target.value)} /></label>
          <label>
            <span>Mở khoá</span>
            <UnlockSelect value={draft.unlock_type} onChange={(v) => set('unlock_type', v)} />
          </label>
          <label><span>Giá 💎</span><input value={draft.price_ruby} inputMode="numeric" onChange={(e) => set('price_ruby', e.target.value)} style={{ width: 90 }} /></label>
          <label className="checkbox"><input type="checkbox" checked={draft.available} onChange={(e) => set('available', e.target.checked)} /><span>available (hiện trong app)</span></label>
        </div>
        <label><span>URL model VRM</span><input value={draft.model_url} onChange={(e) => set('model_url', e.target.value)} placeholder="https://….vrm" /></label>
        <label><span>URL ảnh (url) — bắt buộc</span><input value={draft.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" /></label>
        <label><span>URL thumbnail</span><input value={draft.thumbnail} onChange={(e) => set('thumbnail', e.target.value)} placeholder="https://…" /></label>
        <label><span>URL video</span><input value={draft.video_url} onChange={(e) => set('video_url', e.target.value)} placeholder="https://….mp4" /></label>
        <label><span>Mô tả</span><input value={draft.description} onChange={(e) => set('description', e.target.value)} /></label>
        <div className="row" style={{ alignItems: 'center' }}>
          {thumb ? <img src={thumb} alt="" style={{ width: 90, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} /> : <div className="avatar-empty" style={{ width: 90, height: 120, borderRadius: 8 }}>No image</div>}
          <button className="ghost small" disabled={!draft.model_url.trim()} onClick={() => setPreview({ url: draft.model_url.trim(), title: draft.costume_name || 'Preview' })}>🧍 Xem VRM</button>
        </div>
        {err && <div className="error">{err}</div>}
        <div className="actions">
          {editingId && <button className="ghost" onClick={() => { setEditingId(null); setDraft(EMPTY); }}>Huỷ</button>}
          <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : editingId ? 'Cập nhật' : 'Thêm'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
        {rows.map((c) => {
          const img = mediaUrl(c.thumbnail ?? c.url);
          const isDefault = defaultCostumeId === c.id;
          return (
            <div key={c.id} style={{ border: `1px solid ${c.available ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elev-2)' }}>
              <div style={{ position: 'relative', aspectRatio: '3/4', backgroundImage: img ? `url(${img})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center top', filter: c.available ? undefined : 'grayscale(1)' }}>
                <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {isDefault && <span className="flag">mặc định</span>}
                  <UnlockBadge type={asUnlock(c.unlock_type)} price={c.price_ruby} />
                  {!c.model_url && <span className="flag nsfw">thiếu VRM</span>}
                </div>
              </div>
              <div style={{ padding: '6px 8px' }}>
                <div className="small" style={{ color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.costume_name}</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  <button className={c.available ? 'primary small' : 'ghost small'} onClick={() => void toggle(c)}>{c.available ? '👁' : '🚫'}</button>
                  <button className={isDefault ? 'primary small' : 'ghost small'} disabled={isDefault} title="Đặt làm mặc định" onClick={() => onDefaultChange(c.id)}>★</button>
                  <button className="ghost small" disabled={!c.model_url} onClick={() => setPreview({ url: c.model_url, title: c.costume_name })}>🧍</button>
                  <button className="ghost small" onClick={() => { setEditingId(c.id); setDraft(toDraft(c)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Sửa</button>
                  <button className="ghost small" style={{ marginLeft: 'auto' }} onClick={() => void remove(c)}>🗑</button>
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}>Nhân vật này chưa có trang phục nào.</div>}
      </div>

      {preview && <VrmPreviewModal url={mediaUrl(preview.url)} title={preview.title} onClose={() => setPreview(null)} />}
    </div>
  );
}
