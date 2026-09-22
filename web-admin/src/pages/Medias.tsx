// Trang THƯ VIỆN MEDIA của toàn bộ nhân vật (port từ CMS Yuuki).
//
// Map sang schema TrueFeel (`medias`):
//   Yuuki kind image/video  → media_type photo/video
//   Yuuki is_free           → tier = 'free'   (app: PRO media bị khoá trong chat)
//   Yuuki is_public         → available       (app chỉ lấy available = true)
//   Yuuki should_hide       → should_hide     (cờ GỐC: nhóm "nhạy cảm")
//   Yuuki caption           → name
// Không có NSFW / nguồn user-tạo như Yuuki — TrueFeel không có cột tương ứng.
//
// Nạp TOÀN BỘ bảng theo trang (selectAll): bản trước chỉ lấy 300 dòng trong khi
// bảng có 317, 17 dòng cuối không bao giờ hiện ra.

import { useEffect, useMemo, useState } from 'react';
import { mediaUrl } from '../lib/supabase';
import { deleteOne, errMsg, parsePrice, selectAll, updateIds, updateOne } from '../lib/db';
import type { Character, MediaRow } from '../lib/types';

type Filter = 'all' | 'free' | 'locked' | 'hidden' | 'sensitive';
type Kind = 'photo' | 'video';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Tất cả',
  free: 'Miễn phí',
  locked: 'Khoá (PRO)',
  hidden: 'Đang ẩn (available)',
  sensitive: '🔞 Nhạy cảm (should_hide)',
};

const isFree = (r: MediaRow) => r.tier === 'free';

/** Giá ruby của một media. Trống/0 nghĩa là không bán bằng ruby. */
function MediaPrice({ row, busy, onPatch }: { row: MediaRow; busy: boolean; onPatch: (fields: Partial<MediaRow>) => void }) {
  const [v, setV] = useState(String(row.price_ruby ?? 0));
  useEffect(() => setV(String(row.price_ruby ?? 0)), [row.price_ruby]);
  const commit = () => {
    const n = parsePrice(v);
    if (n === null) {
      setV(String(row.price_ruby ?? 0));
      return;
    }
    if (n !== (row.price_ruby ?? 0)) onPatch({ price_ruby: n });
  };
  const free = (row.tier ?? 'pro') === 'free';
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
      <span style={{ fontSize: 12, opacity: 0.7 }} title="Giá mở khoá bằng ruby (0 = không bán)">💎</span>
      <input
        value={v}
        inputMode="numeric"
        disabled={busy}
        style={{ width: 70 }}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setV(String(row.price_ruby ?? 0));
        }}
      />
      <span className="muted small">
        {free
          ? (row.price_ruby ?? 0) > 0 ? 'mua bằng ruby' : 'xem ads để mở'
          : (row.price_ruby ?? 0) > 0 ? 'PRO rồi mua ruby' : 'chỉ PRO'}
      </span>
    </div>
  );
}

export default function Medias() {
  const [chars, setChars] = useState<Character[]>([]);
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [charId, setCharId] = useState('');
  const [kind, setKind] = useState<Kind>('photo');
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  /// Vị trí media đang mở trong lightbox, theo danh sách ĐANG hiển thị.
  const [lightbox, setLightbox] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [c, m] = await Promise.all([
        selectAll<Character>('characters', '*', { column: 'order' }),
        selectAll<MediaRow>('medias', '*', { column: 'created_at', ascending: false }),
      ]);
      setChars(c);
      setRows(m);
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  /// Tổng / miễn phí theo nhân vật, chỉ tính ẢNH — video không tham gia chuyện free.
  const stats = useMemo(() => {
    const acc: Record<string, { total: number; free: number }> = {};
    for (const r of rows) {
      if (r.media_type !== 'photo' || !r.character_id) continue;
      const s = (acc[r.character_id] ??= { total: 0, free: 0 });
      s.total++;
      if (isFree(r)) s.free++;
    }
    return acc;
  }, [rows]);

  const shown = useMemo(() => {
    let list = rows.filter((r) => (r.media_type ?? 'photo') === kind);
    if (charId) list = list.filter((r) => r.character_id === charId);
    if (filter === 'free') list = list.filter(isFree);
    if (filter === 'locked') list = list.filter((r) => !isFree(r));
    if (filter === 'hidden') list = list.filter((r) => !r.available);
    if (filter === 'sensitive') list = list.filter((r) => r.should_hide);
    return list;
  }, [rows, charId, filter, kind]);

  async function patch(id: string, fields: Partial<MediaRow>) {
    setBusyId(id);
    try {
      await updateOne('medias', id, fields);
      setRows((p) => p.map((r) => (r.id === id ? { ...r, ...fields } : r)));
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusyId(null);
  }

  async function remove(r: MediaRow) {
    const name = chars.find((c) => c.id === r.character_id)?.name ?? '';
    if (!confirm(`Xoá media này của ${name}? Không hoàn tác được.`)) return;
    setBusyId(r.id);
    try {
      await deleteOne('medias', r.id);
      setRows((p) => p.filter((x) => x.id !== r.id));
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusyId(null);
    // Chỉ xoá dòng trong DB, KHÔNG xoá file trên R2.
  }

  /// Bốc ngẫu nhiên `count` ảnh miễn phí cho một nhân vật; phần còn lại thành PRO.
  async function rerollFree(cid: string, count: number) {
    const mine = rows.filter((r) => r.character_id === cid && r.media_type === 'photo');
    if (mine.length === 0) return;
    const picked = new Set([...mine].sort(() => Math.random() - 0.5).slice(0, Math.max(0, count)).map((r) => r.id));
    const toPro = mine.filter((r) => !picked.has(r.id)).map((r) => r.id);
    setBusyId(cid);
    try {
      await updateIds('medias', toPro, { tier: 'pro' });
      await updateIds('medias', [...picked], { tier: 'free' });
      setRows((p) =>
        p.map((r) => (r.character_id === cid && r.media_type === 'photo' ? { ...r, tier: picked.has(r.id) ? 'free' : 'pro' } : r)),
      );
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
      void load(); // có thể đã ghi được một nửa — nạp lại cho khớp DB thật
    }
    setBusyId(null);
  }

  /// Ẩn/hiện toàn bộ media ĐANG HIỆN TRÊN MÀN — tôn trọng mọi bộ lọc đang bật.
  async function toggleAllShown(next: boolean) {
    const ids = shown.map((r) => r.id);
    if (ids.length === 0) return;
    await bulkSetAvailable(ids, next);
  }

  /// Công tắc TỔNG cho nhóm nhạy cảm (should_hide) trên TOÀN BỘ bảng.
  async function toggleSensitive(next: boolean) {
    const ids = rows.filter((r) => r.should_hide).map((r) => r.id);
    if (ids.length === 0) return;
    await bulkSetAvailable(ids, next);
  }

  async function bulkSetAvailable(ids: string[], next: boolean) {
    setBusyId('__bulk__');
    const set = new Set(ids);
    try {
      await updateIds('medias', ids, { available: next });
      setRows((p) => p.map((r) => (set.has(r.id) ? { ...r, available: next } : r)));
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
      void load();
    }
    setBusyId(null);
  }

  const currentChar = chars.find((c) => c.id === charId);

  // Esc đóng, mũi tên chuyển.
  useEffect(() => {
    if (lightbox === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? null : Math.min(i + 1, shown.length - 1)));
      if (e.key === 'ArrowLeft') setLightbox((i) => (i === null ? null : Math.max(i - 1, 0)));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, shown.length]);

  // Đổi nhân vật / bộ lọc / loại thì chỉ số lightbox cũ trỏ sai chỗ — đóng luôn.
  const pickChar = (id: string) => { setCharId(id); setLightbox(null); };
  const pickFilter = (f: Filter) => { setFilter(f); setLightbox(null); };
  const pickKind = (k: Kind) => { setKind(k); setLightbox(null); };

  const noun = kind === 'photo' ? 'ảnh' : 'video';

  return (
    <div>
      <header className="page-header">
        <div>
          <h2>Media</h2>
          <div className="subtitle">
            <span className="stat-pill"><strong>{rows.length}</strong> media</span>{' '}
            <span className="stat-pill"><strong>{rows.filter(isFree).length}</strong> miễn phí</span>{' '}
            <span className="stat-pill"><strong>{rows.filter((r) => r.available).length}</strong> đang hiện</span>
          </div>
        </div>
        <button className="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'Đang tải…' : '↻ Tải lại'}
        </button>
      </header>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

      <div
        style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px',
          marginBottom: 14, background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 8,
        }}
      >
        <span className="muted small">🔞 Media nhạy cảm (toàn app, {rows.filter((r) => r.should_hide).length} mục):</span>
        <button className="ghost small" disabled={busyId !== null} onClick={() => void toggleSensitive(false)}>🚫 Ẩn tất cả nhạy cảm</button>
        <button className="ghost small" disabled={busyId !== null} onClick={() => void toggleSensitive(true)}>👁 Hiện tất cả nhạy cảm</button>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 240, flexShrink: 0, maxHeight: '70vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 6 }}>
          <button className={charId === '' ? 'primary small' : 'ghost small'} style={{ width: '100%', marginBottom: 4 }} onClick={() => pickChar('')}>
            Tất cả nhân vật
          </button>
          {chars.map((c) => {
            const st = stats[c.id] ?? { total: 0, free: 0 };
            return (
              <button
                key={c.id}
                className={charId === c.id ? 'primary small' : 'ghost small'}
                style={{ width: '100%', marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}
                onClick={() => pickChar(c.id)}
                title="ảnh miễn phí / tổng ảnh"
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ opacity: 0.8 }}>{st.free}/{st.total}</span>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {(['photo', 'video'] as Kind[]).map((k) => (
                <button key={k} className={kind === k ? 'primary small' : 'ghost small'} onClick={() => pickKind(k)}>
                  {k === 'photo' ? '🖼 Ảnh' : '🎬 Video'}
                </button>
              ))}
              <span className="muted small" style={{ marginLeft: 4 }}>{shown.length} {noun}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
                <button key={f} className={filter === f ? 'primary small' : 'ghost small'} onClick={() => pickFilter(f)}>
                  {FILTER_LABEL[f]}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-elev-2)', borderRadius: 8 }}>
              <span className="muted small">
                {currentChar ? `Cho ${currentChar.name}` : 'Cho danh sách đang lọc'} ({shown.length} {noun}):
              </span>
              <button className="ghost small" disabled={busyId !== null || shown.length === 0} onClick={() => void toggleAllShown(false)}>🚫 Ẩn tất cả</button>
              <button className="ghost small" disabled={busyId !== null || shown.length === 0} onClick={() => void toggleAllShown(true)}>👁 Hiện tất cả</button>
              {currentChar && kind === 'photo' && (
                <button
                  className="ghost small"
                  disabled={busyId !== null}
                  onClick={() => {
                    const ans = window.prompt(
                      `Bốc ngẫu nhiên bao nhiêu ảnh miễn phí cho ${currentChar.name}?\n(đặt lại toàn bộ ảnh free của nhân vật này; 0 = bỏ free hết)`,
                      '3',
                    );
                    if (ans == null) return;
                    const n = parseInt(ans, 10);
                    if (Number.isNaN(n) || n < 0) return;
                    void rerollFree(currentChar.id, n);
                  }}
                >
                  🎲 Bốc N ảnh miễn phí
                </button>
              )}
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="empty">{loading ? 'Đang tải…' : `Không có ${noun} nào khớp bộ lọc.`}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
              {shown.map((r, idx) => {
                const src = mediaUrl(r.thumbnail ?? (r.media_type === 'photo' ? r.url : null));
                const name = chars.find((c) => c.id === r.character_id)?.name ?? '—';
                const busy = busyId === r.id;
                const free = isFree(r);
                return (
                  <div key={r.id} style={{ border: `1px solid ${free ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elev-2)', opacity: busy ? 0.5 : 1 }}>
                    <div
                      onClick={() => setLightbox(idx)}
                      style={{
                        position: 'relative', width: '100%', aspectRatio: '3/4', backgroundColor: 'var(--bg)',
                        backgroundImage: src ? `url(${src})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center',
                        cursor: 'zoom-in', opacity: r.available ? 1 : 0.45,
                      }}
                    >
                      {!src && <div className="muted" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🎬</div>}
                      {!r.available && <span className="flag muted" style={{ position: 'absolute', top: 6, left: 6 }}>🚫 ẨN</span>}
                      {r.should_hide && <span className="flag nsfw" style={{ position: 'absolute', top: 6, right: 6 }}>🔞</span>}
                    </div>
                    <div style={{ padding: '6px 8px' }}>
                      {!charId && <div className="small" style={{ color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>}
                      <div className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name ?? ''}>{r.name ?? '—'}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        <button className={free ? 'primary small' : 'ghost small'} disabled={busy} title="Mở được không cần PRO" onClick={() => void patch(r.id, { tier: free ? 'pro' : 'free' })}>
                          {free ? '🔓 Free' : '🔒'}
                        </button>
                        <button className={!r.available ? 'primary small' : 'ghost small'} disabled={busy} title={r.available ? 'Đang hiện trong app — bấm để ẩn' : 'Đang ẩn — bấm để hiện'} onClick={() => void patch(r.id, { available: !r.available })}>
                          {r.available ? '👁' : '🚫'}
                        </button>
                        <button className={r.should_hide ? 'primary small' : 'ghost small'} disabled={busy} title="Thêm/bỏ khỏi nhóm nhạy cảm" onClick={() => void patch(r.id, { should_hide: !r.should_hide })}>
                          🔞
                        </button>
                        <button className="ghost small" disabled={busy} style={{ marginLeft: 'auto' }} title="Xoá khỏi thư viện" onClick={() => void remove(r)}>🗑</button>
                      </div>
                      {/* Giá ruby: free + giá > 0 = mua bằng ruby; free + 0 =
                          xem ads; PRO + giá = có PRO rồi vẫn phải mua. */}
                      <MediaPrice row={r} busy={busy} onPatch={(f) => void patch(r.id, f)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {lightbox !== null && shown[lightbox] && (
        <Lightbox
          row={shown[lightbox]}
          charName={chars.find((c) => c.id === shown[lightbox].character_id)?.name ?? '—'}
          index={lightbox}
          total={shown.length}
          busy={busyId === shown[lightbox].id}
          onClose={() => setLightbox(null)}
          onPrev={lightbox > 0 ? () => setLightbox(lightbox - 1) : undefined}
          onNext={lightbox < shown.length - 1 ? () => setLightbox(lightbox + 1) : undefined}
          onToggleFree={() => void patch(shown[lightbox].id, { tier: isFree(shown[lightbox]) ? 'pro' : 'free' })}
          onToggleAvailable={() => void patch(shown[lightbox].id, { available: !shown[lightbox].available })}
          onToggleShouldHide={() => void patch(shown[lightbox].id, { should_hide: !shown[lightbox].should_hide })}
          onDelete={async () => {
            await remove(shown[lightbox]);
            // Mục vừa xoá biến khỏi `shown` — chỉ số hiện tại đã trỏ sang mục kế.
            setLightbox((i) => (i === null ? null : Math.min(i, shown.length - 2)));
          }}
        />
      )}
    </div>
  );
}

/// Xem cỡ lớn — bản gốc, không phải thumbnail. Video thì phát được luôn (Yuuki
/// chỉ có ảnh; ở TrueFeel gần nửa thư viện là video).
function Lightbox({
  row, charName, index, total, busy,
  onClose, onPrev, onNext, onToggleFree, onToggleAvailable, onToggleShouldHide, onDelete,
}: {
  row: MediaRow;
  charName: string;
  index: number;
  total: number;
  busy: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onToggleFree: () => void;
  onToggleAvailable: () => void;
  onToggleShouldHide: () => void;
  onDelete: () => void;
}) {
  const free = isFree(row);
  const isVideo = row.media_type === 'video';
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 900 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{charName}</div>
          <div className="muted small">{row.name ?? '—'}</div>
        </div>
        <span className="muted small" style={{ marginLeft: 'auto' }}>{index + 1}/{total}</span>
        <button className="ghost small" onClick={onClose}>Đóng ✕</button>
      </div>

      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 0, flex: 1 }}>
        <button className="ghost" disabled={!onPrev} onClick={onPrev} style={{ opacity: onPrev ? 1 : 0.25 }}>‹</button>
        {isVideo ? (
          <video
            key={row.id}
            src={row.url}
            poster={row.thumbnail ?? undefined}
            controls
            autoPlay
            muted
            loop
            style={{ maxWidth: 'min(86vw, 900px)', maxHeight: '72vh', borderRadius: 10, border: `2px solid ${free ? 'var(--accent)' : 'transparent'}` }}
          />
        ) : (
          <img
            src={row.url}
            alt={row.name ?? ''}
            style={{ maxWidth: 'min(86vw, 900px)', maxHeight: '72vh', objectFit: 'contain', borderRadius: 10, border: `2px solid ${free ? 'var(--accent)' : 'transparent'}` }}
          />
        )}
        <button className="ghost" disabled={!onNext} onClick={onNext} style={{ opacity: onNext ? 1 : 0.25 }}>›</button>
      </div>

      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className={free ? 'primary small' : 'ghost small'} disabled={busy} onClick={onToggleFree}>{free ? '🔓 Miễn phí' : '🔒 PRO'}</button>
        <button className={!row.available ? 'primary small' : 'ghost small'} disabled={busy} onClick={onToggleAvailable}>{row.available ? '👁 Đang hiện' : '🚫 Đang ẩn'}</button>
        <button className={row.should_hide ? 'primary small' : 'ghost small'} disabled={busy} onClick={onToggleShouldHide}>{row.should_hide ? '🔞 Nhạy cảm' : '🔞 Đánh dấu nhạy cảm'}</button>
        <a className="ghost small" href={row.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Mở bản gốc ↗</a>
        <button className="ghost small" disabled={busy} onClick={onDelete}>🗑 Xoá</button>
      </div>
      <div className="muted small">Esc để đóng · ← → để chuyển</div>
    </div>
  );
}
