// Trang BACKGROUNDS (port từ CMS Yuuki).
//
// Khác Yuuki ở ba chỗ, đều vì schema TrueFeel:
//   - Không có cột thứ tự → không có kéo-thả; app xếp theo created_at.
//   - App chỉ hiện background khi CẢ `available` LẪN `public` đều true
//     (BackgroundSheet). Nút 👁 trên thẻ vì vậy bật/tắt cả hai cùng lúc; form sửa
//     vẫn cho chỉnh riêng từng cờ.
//   - Chưa có đường upload lên R2 cho TrueFeel (không có credential), nên ảnh là
//     URL tuyệt đối dán vào — xem preview ngay trong form.

import { useEffect, useState } from 'react';
import { mediaUrl } from '../lib/supabase';
import { deleteOne, errMsg, insertOne, nullIfBlank, parsePrice, selectAll, updateOne } from '../lib/db';
import type { Background } from '../lib/types';
import { LevelBadge, LevelSelect, UnlockBadge, UnlockSelect } from '../components/UnlockType';
import { asLevel, asUnlock, unlockProblem, type UnlockType } from '../lib/unlock';

type Draft = {
  name: string;
  image: string;
  thumbnail: string;
  video_url: string;
  unlock_type: UnlockType;
  unlock_at_level: number;
  is_dark: boolean;
  price_ruby: string;
  public: boolean;
  available: boolean;
  description: string;
};

const EMPTY: Draft = {
  name: '', image: '', thumbnail: '', video_url: '', unlock_type: 'ads', unlock_at_level: 1, is_dark: true,
  price_ruby: '0', public: true, available: true, description: '',
};

const visible = (b: Background) => !!b.available && !!b.public;

function toDraft(b: Background): Draft {
  return {
    name: b.name, image: b.image ?? '', thumbnail: b.thumbnail ?? '', video_url: b.video_url ?? '',
    unlock_type: asUnlock(b.unlock_type), unlock_at_level: asLevel(b.unlock_at_level), is_dark: b.is_dark ?? true,
    price_ruby: String(b.price_ruby ?? 0), public: !!b.public, available: !!b.available,
    description: b.description ?? '',
  };
}

export default function Backgrounds() {
  const [rows, setRows] = useState<Background[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setRows(await selectAll<Background>('backgrounds', '*', { column: 'created_at' }));
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
    if (!draft.name.trim() || !draft.image.trim()) {
      setErr('Cần có tên và URL ảnh.');
      return;
    }
    const price = parsePrice(draft.price_ruby);
    if (price === null) {
      setErr(`Giá "${draft.price_ruby}" không hợp lệ — phải là số nguyên ≥ 0.`);
      return;
    }
    const problem = unlockProblem(draft.unlock_type, price);
    if (problem) {
      setErr(problem);
      return;
    }
    const row = {
      name: draft.name.trim(),
      image: draft.image.trim(),
      thumbnail: nullIfBlank(draft.thumbnail),
      video_url: nullIfBlank(draft.video_url),
      unlock_type: draft.unlock_type,
      unlock_at_level: draft.unlock_at_level,
      is_dark: draft.is_dark,
      price_ruby: price,
      public: draft.public,
      available: draft.available,
      description: nullIfBlank(draft.description),
    };
    setBusy(true);
    try {
      if (editingId) {
        await updateOne('backgrounds', editingId, row);
        setRows((p) => p.map((r) => (r.id === editingId ? { ...r, ...row } as Background : r)));
      } else {
        const created = await insertOne<Background>('backgrounds', row);
        setRows((p) => [...p, created]);
      }
      setDraft(EMPTY);
      setEditingId(null);
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(false);
  }

  async function quick(b: Background, fields: Partial<Background>) {
    setBusyId(b.id);
    try {
      await updateOne('backgrounds', b.id, fields);
      setRows((p) => p.map((r) => (r.id === b.id ? { ...r, ...fields } : r)));
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusyId(null);
  }

  async function remove(b: Background) {
    if (!confirm(`Xoá background "${b.name}"? Nhân vật nào đang dùng nó làm mặc định sẽ mất background.`)) return;
    setBusyId(b.id);
    try {
      await deleteOne('backgrounds', b.id);
      setRows((p) => p.filter((r) => r.id !== b.id));
      if (editingId === b.id) {
        setEditingId(null);
        setDraft(EMPTY);
      }
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusyId(null);
  }

  const preview = mediaUrl(draft.thumbnail || draft.image);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2>Backgrounds</h2>
          <div className="subtitle" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="stat-pill"><strong>{rows.length}</strong> total</span>
            <span className="stat-pill"><strong>{rows.filter(visible).length}</strong> đang hiện</span>
            <span className="stat-pill"><strong>{rows.filter((r) => ['default', 'ads'].includes(asUnlock(r.unlock_type))).length}</strong> free/ads</span>
            <span className="muted small">cảnh nền phía sau nhân vật</span>
          </div>
        </div>
        <button className="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'Đang tải…' : '↻ Tải lại'}
        </button>
      </header>

      <div className="card">
        <h3>{editingId ? 'Sửa background' : 'Thêm background'}</h3>
        <div className="row">
          <label className="grow">
            <span>Tên</span>
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Cherry Blossom Garden" />
          </label>
          <label>
            <span>Mở khoá</span>
            <UnlockSelect value={draft.unlock_type} onChange={(v) => set('unlock_type', v)} />
          </label>
          <label>
            <span>Giá 💎</span>
            <input value={draft.price_ruby} inputMode="numeric" onChange={(e) => set('price_ruby', e.target.value)} style={{ width: 90 }} />
          </label>
          <label>
            <span>Mở ở Lv</span>
            <LevelSelect value={draft.unlock_at_level} onChange={(v) => set('unlock_at_level', v)} />
          </label>
        </div>
        <div className="row">
          <label className="checkbox"><input type="checkbox" checked={draft.available} onChange={(e) => set('available', e.target.checked)} /><span>available</span></label>
          <label className="checkbox"><input type="checkbox" checked={draft.public} onChange={(e) => set('public', e.target.checked)} /><span>public</span></label>
          <label className="checkbox"><input type="checkbox" checked={draft.is_dark} onChange={(e) => set('is_dark', e.target.checked)} /><span>Nền tối (UI dùng chữ sáng)</span></label>
        </div>
        <label><span>URL ảnh (image) — bắt buộc</span><input value={draft.image} onChange={(e) => set('image', e.target.value)} placeholder="https://…" /></label>
        <label><span>URL thumbnail</span><input value={draft.thumbnail} onChange={(e) => set('thumbnail', e.target.value)} placeholder="https://…" /></label>
        <label><span>URL video (nền động, tuỳ chọn)</span><input value={draft.video_url} onChange={(e) => set('video_url', e.target.value)} placeholder="https://….mp4" /></label>
        <label><span>Mô tả</span><input value={draft.description} onChange={(e) => set('description', e.target.value)} /></label>

        <div className="row" style={{ alignItems: 'flex-start' }}>
          {preview ? (
            <img src={preview} alt="" style={{ width: 200, height: 130, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
          ) : (
            <div className="avatar-empty" style={{ width: 200, height: 130, borderRadius: 8 }}>No image</div>
          )}
          <span className="muted small grow">
            Dán URL tuyệt đối (R2 / CloudFront). Upload thẳng lên R2 như CMS Yuuki cần credential R2 của TrueFeel — chưa có.
          </span>
        </div>

        {err && <div className="error">{err}</div>}
        <div className="actions">
          {editingId && (
            <button className="ghost" onClick={() => { setEditingId(null); setDraft(EMPTY); }}>Huỷ</button>
          )}
          <button className="primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Đang lưu…' : editingId ? 'Cập nhật' : 'Thêm'}
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {rows.map((b) => {
          const url = mediaUrl(b.thumbnail ?? b.image);
          const on = visible(b);
          const isBusy = busyId === b.id;
          return (
            <div key={b.id} className="char-card" style={{ opacity: isBusy ? 0.5 : 1 }}>
              <div
                style={{
                  width: '100%', aspectRatio: '16/10', borderRadius: 10, backgroundColor: 'var(--bg-elev-2)',
                  backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: url ? `url(${url})` : undefined,
                  filter: on ? undefined : 'grayscale(1)',
                }}
              />
              <div className="char-body">
                <div className="char-name">{b.name}</div>
                <div className="char-flags">
                  {!on && <span className="flag muted">ẩn</span>}
                  <UnlockBadge type={asUnlock(b.unlock_type)} price={b.price_ruby} />
                  <LevelBadge level={asLevel(b.unlock_at_level)} />
                  {b.video_url && <span className="flag">🎬</span>}
                  {b.is_dark && <span className="flag">🌙</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button
                  className={on ? 'primary small' : 'ghost small'}
                  disabled={isBusy}
                  title={on ? 'Đang hiện trong app — bấm để ẩn' : 'Đang ẩn — bấm để hiện (bật cả available lẫn public)'}
                  onClick={() => void quick(b, { available: !on, public: !on })}
                >
                  {on ? '👁' : '🚫'}
                </button>
                <UnlockSelect
                  value={asUnlock(b.unlock_type)}
                  disabled={isBusy}
                  onChange={(v) => {
                    const problem = unlockProblem(v, b.price_ruby ?? 0);
                    if (problem) return setErr(`${b.name}: ${problem} Mở "Sửa" để đặt giá trước.`);
                    void quick(b, { unlock_type: v });
                  }}
                />
                <button
                  className="ghost small"
                  style={{ flex: 1 }}
                  disabled={isBusy}
                  onClick={() => { setEditingId(b.id); setDraft(toDraft(b)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                >
                  Sửa
                </button>
                <button className="danger small" disabled={isBusy} onClick={() => void remove(b)}>🗑</button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && !loading && (
          <div className="empty" style={{ gridColumn: '1 / -1' }}>Chưa có background nào.</div>
        )}
      </div>
    </div>
  );
}
