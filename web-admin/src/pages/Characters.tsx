// Trang NHÂN VẬT (port từ CMS Yuuki).
//
// Khác Yuuki vì schema/app TrueFeel:
//   - Thứ tự là cột TEXT `order` ("001", "002"…), app xếp theo chuỗi. Ghi lại
//     luôn đủ 3 chữ số — ghi "10" thì nó đứng trước "2". Dữ liệu cũ còn số trùng
//     (vd "011" ×3); kéo-thả một lần là đánh số lại sạch.
//   - App chỉ hiện nhân vật khi is_public VÀ available VÀ base_model_url là VRM
//     (không phải .png). Thẻ ghi rõ nhân vật có hiện không, và vì sao không.
//   - Không có "nhân vật mặc định sau onboarding": app TrueFeel ghép nhân vật
//     theo câu trả lời onboarding, không lấy người đứng đầu danh sách.
//   - Xoá nhân vật CASCADE sang lịch sử chat (conversation) và tiến độ của
//     người dùng (user_character) — một confirm là xong, như các trang khác.
//     Muốn nhân vật biến khỏi app mà giữ lịch sử thì tắt is_public/available.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mediaUrl } from '../lib/supabase';
import { deleteOne, errMsg, insertOne, parsePrice, selectAll, updateOne } from '../lib/db';
import { BackgroundPicker } from '../components/BackgroundPicker';
import VrmPreviewModal from '../components/VrmPreviewModal';
import VrmThumb from '../components/VrmThumb';
import type { Background, Character } from '../lib/types';

const pad = (n: number) => String(n).padStart(3, '0');

/** Vì sao app không hiện nhân vật này — rỗng nghĩa là đang hiện. */
function hiddenReasons(c: Character): string[] {
  const r: string[] = [];
  if (!c.is_public) r.push('is_public tắt');
  if (!c.available) r.push('available tắt');
  if (!c.base_model_url) r.push('thiếu base_model_url');
  else if (/\.png($|\?)/i.test(c.base_model_url)) r.push('model là ảnh .png');
  return r;
}

function sortChars(list: Character[]): Character[] {
  return [...list].sort(
    (a, b) => (a.order ?? '').localeCompare(b.order ?? '') || a.name.localeCompare(b.name),
  );
}

export default function Characters() {
  const [chars, setChars] = useState<Character[]>([]);
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [bgPickFor, setBgPickFor] = useState<Character | null>(null);
  const [previewing, setPreviewing] = useState<Character | null>(null);

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderSavedToast, setOrderSavedToast] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [c, b] = await Promise.all([
        selectAll<Character>('characters', '*', { column: 'order' }),
        selectAll<Background>('backgrounds', '*', { column: 'name' }),
      ]);
      setChars(sortChars(c));
      setBackgrounds(b);
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  const liveCount = useMemo(() => chars.filter((c) => hiddenReasons(c).length === 0).length, [chars]);

  /// Ghi một trường, cập nhật lạc quan, trả về như cũ nếu DB từ chối.
  async function quick(c: Character, fields: Partial<Character>) {
    setBusyId(c.id);
    const before = chars;
    setChars((p) => p.map((x) => (x.id === c.id ? { ...x, ...fields } : x)));
    try {
      await updateOne('characters', c.id, fields);
      setErr('');
    } catch (e) {
      setChars(before);
      setErr(errMsg(e));
    }
    setBusyId(null);
  }

  function setPrice(c: Character, raw: string) {
    const v = parsePrice(raw);
    if (v === null) {
      setErr(`Giá "${raw}" không hợp lệ — phải là số nguyên ≥ 0.`);
      return false;
    }
    if (v !== (c.price_ruby ?? 0)) void quick(c, { price_ruby: v });
    return true;
  }

  /// Ghi lại `order` cho những dòng có số mới khác số cũ. `ordered` là danh sách
  /// theo thứ tự MỚI nhưng vẫn giữ `order` CŨ — so mới≠cũ mới ra đúng dòng cần
  /// ghi (Yuuki từng lưu hụt vì truyền list đã đánh số lại, mới===cũ ở mọi dòng).
  async function saveOrder(ordered: Character[]) {
    const updates = ordered
      .map((c, i) => ({ c, next: pad(i + 1) }))
      .filter((u) => u.c.order !== u.next);
    setChars(ordered.map((c, i) => ({ ...c, order: pad(i + 1) })));
    if (updates.length === 0) return;
    setSavingOrder(true);
    try {
      for (const u of updates) await updateOne('characters', u.c.id, { order: u.next });
      setOrderSavedToast(true);
      setTimeout(() => setOrderSavedToast(false), 2000);
      setErr('');
    } catch (e) {
      setErr(`Lưu thứ tự lỗi: ${errMsg(e)}`);
      void load(); // có thể đã ghi được một phần — nạp lại cho khớp DB
    }
    setSavingOrder(false);
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= chars.length) return;
    const ordered = [...chars];
    [ordered[idx], ordered[j]] = [ordered[j], ordered[idx]];
    void saveOrder(ordered);
  }

  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }
    const ordered = [...chars];
    const [moved] = ordered.splice(draggedIdx, 1);
    ordered.splice(index, 0, moved);
    setDraggedIdx(null);
    setDragOverIdx(null);
    void saveOrder(ordered);
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setBusyId('__create__');
    try {
      // Tạo ở trạng thái ẨN: soi xong (model, ảnh, bản dịch) mới bật cho người dùng thật.
      const c = await insertOne<Character>('characters', {
        name, is_public: false, available: false, tier: 'free', order: pad(chars.length + 1),
      });
      setChars((p) => [...p, c]);
      setNewName('');
      setCreating(false);
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusyId(null);
  }

  async function remove(c: Character) {
    if (!confirm(`Xoá "${c.name}"? Lịch sử chat và tiến độ quan hệ của người dùng với nhân vật này mất theo. Không hoàn tác được.`)) return;
    setBusyId(c.id);
    try {
      await deleteOne('characters', c.id);
      setChars((p) => p.filter((x) => x.id !== c.id));
      setErr('');
    } catch (e) {
      // Quest / collection / thông báo đã lên lịch trỏ tới nhân vật này không
      // CASCADE, nên Postgres chặn bằng lỗi khoá ngoại — hiện nguyên văn.
      setErr(errMsg(e));
    }
    setBusyId(null);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2>Characters</h2>
          <div className="subtitle" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="stat-pill"><strong>{chars.length}</strong> total</span>
            <span className="stat-pill"><strong>{liveCount}</strong> đang hiện trong app</span>
            <span className="stat-pill" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>✋ Kéo thả thẻ để sắp xếp</span>
            {savingOrder && <span className="stat-pill" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>⏳ Đang lưu thứ tự…</span>}
            {orderSavedToast && <span className="stat-pill" style={{ background: 'rgba(74, 222, 128, 0.15)', color: 'var(--ok)' }}>✓ Đã lưu thứ tự</span>}
          </div>
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => void load()} disabled={loading}>{loading ? 'Đang tải…' : '↻ Tải lại'}</button>
          <button className="primary" onClick={() => setCreating((v) => !v)}>＋ Nhân vật mới</button>
        </div>
      </header>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

      {creating && (
        <div className="card">
          <h3>Nhân vật mới</h3>
          <div className="row">
            <label className="grow">
              <span>Tên</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} autoFocus />
            </label>
          </div>
          <div className="muted small">Tạo ở trạng thái ẩn. Điền model, ảnh, mô tả ở trang chi tiết rồi mới bật hiện.</div>
          <div className="actions">
            <button className="ghost" onClick={() => setCreating(false)}>Huỷ</button>
            <button className="primary" disabled={!newName.trim() || busyId === '__create__'} onClick={() => void create()}>Tạo</button>
          </div>
        </div>
      )}

      {loading && chars.length === 0 ? (
        <div className="loading">Loading…</div>
      ) : (
        <div className="grid">
          {chars.map((c, idx) => {
            const reasons = hiddenReasons(c);
            const live = reasons.length === 0;
            const busy = busyId === c.id;
            const img = mediaUrl(c.thumbnail_url ?? c.avatar);
            const bg = backgrounds.find((b) => b.id === c.background_default_id);
            const bgThumb = bg ? mediaUrl(bg.thumbnail ?? bg.image) : null;
            const isDragging = draggedIdx === idx;
            const isOver = dragOverIdx === idx && draggedIdx !== idx;
            return (
              <div
                key={c.id}
                className="char-card"
                draggable
                onDragStart={(e) => { setDraggedIdx(idx); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', `${idx}`); }}
                onDragOver={(e) => { e.preventDefault(); if (dragOverIdx !== idx) setDragOverIdx(idx); }}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
                style={{
                  cursor: 'grab', position: 'relative', userSelect: 'none',
                  opacity: isDragging ? 0.35 : busy ? 0.6 : 1,
                  transform: isOver ? 'scale(1.03)' : isDragging ? 'scale(0.97)' : 'none',
                  border: isOver ? '2px solid var(--accent)' : isDragging ? '2px dashed var(--accent)' : undefined,
                  boxShadow: isOver ? '0 0 16px rgba(255, 77, 141, 0.45)' : undefined,
                  transition: 'transform 150ms ease, box-shadow 150ms ease, opacity 150ms ease, border 150ms ease',
                }}
              >
                <span
                  title={`Thứ tự hiển thị (order = "${c.order ?? '—'}")`}
                  style={{
                    position: 'absolute', top: 8, left: 8, zIndex: 3, background: 'rgba(0,0,0,0.75)',
                    color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                >
                  ⠿ #{idx + 1}
                </span>

                <Link to={`/characters/${c.id}`} draggable={false} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {/* The model, not the catalogue art. A character whose
                      `base_model_url` is not a .vrm keeps its thumbnail. */}
                  <div className="char-avatar" style={{ filter: live ? undefined : 'grayscale(0.8)', overflow: 'hidden' }}>
                    <VrmThumb
                      modelUrl={c.base_model_url}
                      fallback={img}
                      alt={c.name}
                      style={{ width: '100%', height: '100%' }}
                    />
                    {!img && !c.base_model_url && <span>{c.name.slice(0, 1)}</span>}
                  </div>
                  <div className="char-body">
                    <div className="char-name">{c.name}</div>
                    <div className="char-flags">
                      {live ? (
                        <span className="flag" style={{ background: 'rgba(74,222,128,0.18)', color: 'var(--ok)' }}>📱 Đang hiện</span>
                      ) : (
                        <span className="flag muted" title={reasons.join(' · ')}>🚫 {reasons[0]}{reasons.length > 1 ? ` +${reasons.length - 1}` : ''}</span>
                      )}
                      {c.tier === 'pro' ? <span className="flag pro">PRO</span> : <span className="flag">Free</span>}
                      {(c.price_ruby ?? 0) > 0 && <span className="flag">💎{c.price_ruby}</span>}
                    </div>
                  </div>
                </Link>

                <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                  <button className={c.is_public ? 'primary small' : 'ghost small'} disabled={busy} style={{ flex: 1 }} title="is_public" onClick={() => void quick(c, { is_public: !c.is_public })}>
                    {c.is_public ? '👁 Public' : '🚫 Ẩn'}
                  </button>
                  <button className={c.available ? 'primary small' : 'ghost small'} disabled={busy} style={{ flex: 1 }} title="available" onClick={() => void quick(c, { available: !c.available })}>
                    {c.available ? '✅ Available' : '⏸ Off'}
                  </button>
                </div>

                <button
                  className="small"
                  disabled={busy}
                  onClick={() => void quick(c, { tier: c.tier === 'pro' ? 'free' : 'pro' })}
                  style={{
                    width: '100%', marginTop: 6, border: '1px solid var(--accent)',
                    background: c.tier === 'pro' ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'transparent',
                    color: c.tier === 'pro' ? '#fff' : 'var(--accent)',
                  }}
                >
                  {c.tier === 'pro' ? '👑 PRO' : '👑 Đặt PRO'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.8, whiteSpace: 'nowrap' }} title="Giá mở khoá bằng ruby (0 = không bán)">💎 Giá</span>
                  <input
                    key={`${c.id}-${c.price_ruby}`}
                    defaultValue={String(c.price_ruby ?? 0)}
                    inputMode="numeric"
                    disabled={busy}
                    style={{ width: '100%', padding: '4px 8px' }}
                    onBlur={(e) => { if (!setPrice(c, e.target.value)) e.target.value = String(c.price_ruby ?? 0); }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  {bgThumb ? (
                    <img src={bgThumb} alt="" title={bg?.name} style={{ width: 30, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', flex: '0 0 auto' }} />
                  ) : (
                    <div className="avatar-empty" title="Chưa đặt nền mặc định" style={{ width: 30, height: 44, borderRadius: 6, flex: '0 0 auto' }} />
                  )}
                  <button
                    className="ghost small"
                    disabled={busy}
                    onClick={() => setBgPickFor(c)}
                    title="Đổi nền mặc định"
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {bg?.name ?? '— Chưa đặt nền —'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button className="ghost small" disabled={idx === 0 || busy} title="Đưa lên trước" onClick={() => move(idx, -1)}>▲</button>
                  <button className="ghost small" disabled={idx === chars.length - 1 || busy} title="Đưa xuống sau" onClick={() => move(idx, 1)}>▼</button>
                  <button
                    className="ghost small"
                    disabled={!c.base_model_url || /\.png($|\?)/i.test(c.base_model_url)}
                    title="Xem model VRM"
                    onClick={() => setPreviewing(c)}
                  >
                    🧍
                  </button>
                  <Link className="ghost small" to={`/characters/${c.id}`} style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>Sửa</Link>
                  <button className="danger small" disabled={busy} title="Xoá nhân vật" onClick={() => void remove(c)}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {bgPickFor && (
        <BackgroundPicker
          value={bgPickFor.background_default_id}
          backgrounds={backgrounds}
          onPick={(id) => void quick(bgPickFor, { background_default_id: id })}
          onClose={() => setBgPickFor(null)}
        />
      )}

      {previewing && (
        <VrmPreviewModal url={mediaUrl(previewing.base_model_url)} title={previewing.name} onClose={() => setPreviewing(null)} />
      )}

    </div>
  );
}
