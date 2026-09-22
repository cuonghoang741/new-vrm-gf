// Trang ĐIỆU NHẢY (bảng dances) — app đọc bảng này cho sheet Dance.
//
// file_url là URL tuyệt đối tới file FBX (rig Mixamo). File của các điệu nhảy
// kéo từ Yuuki nằm trong bucket public `dances` của TrueFeel
// (…/storage/v1/object/public/dances/fbx/…). Thứ tự hiện = sort_order.

import { useEffect, useState } from 'react';
import { deleteOne, errMsg, insertOne, nullIfBlank, parsePrice, selectAll, updateOne } from '../lib/db';
import type { Dance } from '../lib/types';
import { LevelBadge, LevelSelect, UnlockBadge, UnlockSelect } from '../components/UnlockType';
import { asLevel, asUnlock, unlockProblem, type UnlockType } from '../lib/unlock';

type Draft = {
  name: string;
  file_url: string;
  thumbnail_url: string;
  music_url: string;
  unlock_type: UnlockType;
  unlock_at_level: number;
  price_ruby: string;
  sort_order: string;
  available: boolean;
};

const EMPTY: Draft = {
  name: '', file_url: '', thumbnail_url: '', music_url: '', unlock_type: 'ads', unlock_at_level: 1, price_ruby: '0', sort_order: '', available: true,
};

function toDraft(d: Dance): Draft {
  return {
    name: d.name, file_url: d.file_url, thumbnail_url: d.thumbnail_url ?? '', music_url: d.music_url ?? '',
    unlock_type: asUnlock(d.unlock_type), unlock_at_level: asLevel(d.unlock_at_level), price_ruby: String(d.price_ruby ?? 0), sort_order: String(d.sort_order ?? 0),
    available: d.available,
  };
}

export default function Dances() {
  const [rows, setRows] = useState<Dance[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setRows(await selectAll<Dance>('dances', '*', { column: 'sort_order' }));
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setErr('');
    if (!draft.name.trim() || !/^https?:\/\//.test(draft.file_url.trim())) return setErr('Cần tên và URL FBX tuyệt đối (https://…).');
    const price = parsePrice(draft.price_ruby);
    if (price === null) return setErr('Giá phải là số nguyên ≥ 0.');
    const problem = unlockProblem(draft.unlock_type, price);
    if (problem) return setErr(problem);
    const order = draft.sort_order.trim() === '' ? (rows.at(-1)?.sort_order ?? 0) + 10 : Number(draft.sort_order);
    if (!Number.isInteger(order)) return setErr('Thứ tự phải là số nguyên.');
    const row = {
      name: draft.name.trim(),
      file_url: draft.file_url.trim(),
      thumbnail_url: nullIfBlank(draft.thumbnail_url),
      music_url: nullIfBlank(draft.music_url),
      unlock_type: draft.unlock_type,
      unlock_at_level: draft.unlock_at_level,
      price_ruby: price,
      sort_order: order,
      available: draft.available,
    };
    setBusy(true);
    try {
      if (editingId) await updateOne('dances', editingId, row);
      else await insertOne<Dance>('dances', row);
      setDraft(EMPTY);
      setEditingId(null);
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(false);
  }

  async function quick(d: Dance, fields: Partial<Dance>) {
    try {
      await updateOne('dances', d.id, fields);
      setRows((p) => p.map((r) => (r.id === d.id ? { ...r, ...fields } : r)));
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  async function remove(d: Dance) {
    if (!confirm(`Xoá điệu nhảy "${d.name}"? Người đã mở khoá sẽ mất nó.`)) return;
    try {
      await deleteOne('dances', d.id);
      setRows((p) => p.filter((r) => r.id !== d.id));
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  const count = (t: UnlockType) => rows.filter((r) => r.unlock_type === t).length;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2>Điệu nhảy</h2>
          <div className="subtitle" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="stat-pill"><strong>{rows.length}</strong> total</span>
            <span className="stat-pill">free <strong>{count('default')}</strong></span>
            <span className="stat-pill">ads <strong>{count('ads')}</strong></span>
            <span className="stat-pill">PRO <strong>{count('pro')}</strong></span>
            <span className="stat-pill">ruby <strong>{count('ruby')}</strong></span>
          </div>
        </div>
        <button className="ghost" onClick={() => void load()} disabled={loading}>{loading ? 'Đang tải…' : '↻ Tải lại'}</button>
      </header>

      <div className="card">
        <h3>{editingId ? 'Sửa điệu nhảy' : 'Thêm điệu nhảy'}</h3>
        <div className="row">
          <label className="grow"><span>Tên</span><input value={draft.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label><span>Mở khoá</span><UnlockSelect value={draft.unlock_type} onChange={(v) => set('unlock_type', v)} /></label>
          <label><span>Giá 💎</span><input value={draft.price_ruby} inputMode="numeric" onChange={(e) => set('price_ruby', e.target.value)} style={{ width: 80 }} /></label>
          <label><span>Mở ở Lv</span><LevelSelect value={draft.unlock_at_level} onChange={(v) => set('unlock_at_level', v)} /></label>
          <label><span>Thứ tự</span><input value={draft.sort_order} inputMode="numeric" placeholder="tự động" onChange={(e) => set('sort_order', e.target.value)} style={{ width: 80 }} /></label>
          <label className="checkbox"><input type="checkbox" checked={draft.available} onChange={(e) => set('available', e.target.checked)} /><span>hiện trong app</span></label>
        </div>
        <label><span>URL file FBX (rig Mixamo) — bắt buộc</span><input value={draft.file_url} onChange={(e) => set('file_url', e.target.value)} placeholder="https://….fbx" /></label>
        <label><span>URL ảnh thumbnail (dọc 9:14)</span><input value={draft.thumbnail_url} onChange={(e) => set('thumbnail_url', e.target.value)} placeholder="https://….jpg" /></label>
        <label><span>URL nhạc (tuỳ chọn)</span><input value={draft.music_url} onChange={(e) => set('music_url', e.target.value)} placeholder="https://….mp3" /></label>
        {err && <div className="error">{err}</div>}
        <div className="actions">
          {editingId && <button className="ghost" onClick={() => { setEditingId(null); setDraft(EMPTY); }}>Huỷ</button>}
          <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : editingId ? 'Cập nhật' : 'Thêm'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {rows.map((d) => (
          <div key={d.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elev-2)', opacity: d.available ? 1 : 0.5 }}>
            <div style={{ aspectRatio: '9/14', background: d.thumbnail_url ? `center/cover url(${d.thumbnail_url})` : 'linear-gradient(135deg,#FFB6D9,#FF4D8D)', position: 'relative' }}>
              {!d.thumbnail_url && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 34 }}>💃</span>}
              <div style={{ position: 'absolute', top: 6, left: 6 }}><UnlockBadge type={asUnlock(d.unlock_type)} price={d.price_ruby} />
                  <LevelBadge level={asLevel(d.unlock_at_level)} /></div>
            </div>
            <div style={{ padding: '6px 8px' }}>
              <div className="small" style={{ color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.sort_order} · {d.name}</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                <button className={d.available ? 'primary small' : 'ghost small'} onClick={() => void quick(d, { available: !d.available })}>{d.available ? '👁' : '🚫'}</button>
                <UnlockSelect
                  value={asUnlock(d.unlock_type)}
                  onChange={(v) => {
                    const problem = unlockProblem(v, d.price_ruby);
                    if (problem) return setErr(`${d.name}: ${problem}`);
                    void quick(d, { unlock_type: v });
                  }}
                />
                <a className="ghost small" href={d.file_url} target="_blank" rel="noreferrer" title="Tải file FBX">FBX</a>
                <button className="ghost small" onClick={() => { setEditingId(d.id); setDraft(toDraft(d)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Sửa</button>
                <button className="ghost small" style={{ marginLeft: 'auto' }} onClick={() => void remove(d)}>🗑</button>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && !loading && <div className="empty" style={{ gridColumn: '1 / -1' }}>Chưa có điệu nhảy nào.</div>}
      </div>
    </div>
  );
}
