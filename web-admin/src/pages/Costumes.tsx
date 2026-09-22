// Trang quản lý TRANG PHỤC của toàn bộ nhân vật (port từ CMS Yuuki).
//
// Sửa đầy đủ một bộ (URL VRM, ảnh…) nằm ở tab "Trang phục" trong trang nhân
// vật. Trang này làm phần nhìn bao quát: bộ nào đang ẩn, bộ nào thiếu VRM/ảnh,
// nhân vật nào có đồ mà app lại không hiện được bộ nào — cộng các nút bật/tắt
// nhanh ngay trên thẻ.
//
// Luật của app TrueFeel (CostumeSheet): chỉ lấy bộ `available = true`, xếp
// theo created_at. Nhân vật có trang phục nhưng không bộ nào available thì
// sheet trang phục trong app TRỐNG — nhìn bảng Supabase không thấy được điều đó.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mediaUrl } from '../lib/supabase';
import { deleteOne, errMsg, parsePrice, selectAll, updateOne, updateWhere } from '../lib/db';
import VrmPreviewModal from '../components/VrmPreviewModal';
import type { Character, Costume } from '../lib/types';
import { LevelBadge, LevelSelect, UnlockBadge, UnlockSelect } from '../components/UnlockType';
import { asLevel, asUnlock, unlockProblem } from '../lib/unlock';

type Filter = 'all' | 'shown' | 'hidden' | 'pro' | 'free' | 'broken';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Tất cả',
  shown: 'Đang hiện',
  hidden: 'Đang ẩn',
  pro: 'PRO',
  free: 'Free',
  broken: 'Thiếu VRM / ảnh',
};

// "PRO" filter = anything that costs (PRO or ruby); "Free" = default or ads.
const isPro = (c: Costume) => ['pro', 'ruby'].includes(asUnlock(c.unlock_type));

export default function Costumes() {
  const [chars, setChars] = useState<Character[]>([]);
  const [rows, setRows] = useState<Costume[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [charId, setCharId] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Costume | null>(null);

  async function fetchAll() {
    const [c, k] = await Promise.all([
      selectAll<Character>('characters', '*', { column: 'order' }),
      selectAll<Costume>('character_costumes', '*', { column: 'created_at' }),
    ]);
    return { chars: c, rows: k };
  }

  async function load() {
    setLoading(true);
    try {
      const d = await fetchAll();
      setChars(d.chars);
      setRows(d.rows);
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    const acc: Record<string, { total: number; shown: number }> = {};
    for (const r of rows) {
      const s = (acc[r.character_id] ??= { total: 0, shown: 0 });
      s.total++;
      if (r.available) s.shown++;
    }
    return acc;
  }, [rows]);

  const dressed = useMemo(() => chars.filter((c) => (stats[c.id]?.total ?? 0) > 0), [chars, stats]);

  /// Có trang phục nhưng không bộ nào available → sheet trang phục trong app trống.
  const stalled = useMemo(
    () => dressed.filter((c) => stats[c.id]!.shown === 0),
    [dressed, stats],
  );

  const defaultOf = useMemo(
    () => new Map(chars.map((c) => [c.id, c.default_costume_id])),
    [chars],
  );

  const shown = useMemo(() => {
    let list = charId ? rows.filter((r) => r.character_id === charId) : rows;
    if (filter === 'shown') list = list.filter((r) => r.available);
    if (filter === 'hidden') list = list.filter((r) => !r.available);
    if (filter === 'pro') list = list.filter(isPro);
    if (filter === 'free') list = list.filter((r) => !isPro(r));
    if (filter === 'broken') list = list.filter((r) => !r.model_url || !r.thumbnail);
    // Gom theo nhân vật (thứ tự trang Characters) rồi mới theo ngày tạo — đúng
    // thứ tự app hiện trong sheet.
    const order = new Map(chars.map((c, i) => [c.id, i]));
    return [...list].sort(
      (a, b) =>
        (order.get(a.character_id) ?? 0) - (order.get(b.character_id) ?? 0) ||
        a.created_at.localeCompare(b.created_at),
    );
  }, [rows, chars, charId, filter]);

  async function patch(id: string, fields: Partial<Costume>) {
    setBusyId(id);
    try {
      await updateOne('character_costumes', id, fields);
      setRows((p) => p.map((r) => (r.id === id ? { ...r, ...fields } : r)));
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusyId(null);
  }

  /// Bộ mặc định ở TrueFeel nằm trên NHÂN VẬT (characters.default_costume_id),
  /// không phải cờ trên từng bộ — nên luôn duy nhất, không cần gỡ cờ bộ cũ.
  async function makeDefault(c: Costume) {
    setBusyId(c.id);
    try {
      await updateOne('characters', c.character_id, { default_costume_id: c.id });
      setChars((p) => p.map((x) => (x.id === c.character_id ? { ...x, default_costume_id: c.id } : x)));
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusyId(null);
  }

  /// Hiện hết trang phục của một nhân vật — cách chữa nhanh cho cảnh báo ở trên.
  async function revealAll(cid: string) {
    setBusyId(cid);
    try {
      await updateWhere('character_costumes', { available: true }, { character_id: cid });
      setRows((p) => p.map((r) => (r.character_id === cid ? { ...r, available: true } : r)));
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusyId(null);
  }

  async function remove(c: Costume) {
    const who = chars.find((x) => x.id === c.character_id)?.name ?? '';
    if (!confirm(`Xoá trang phục "${c.costume_name}" của ${who}? Không hoàn tác được.`)) return;
    setBusyId(c.id);
    try {
      await deleteOne('character_costumes', c.id);
      setRows((p) => p.filter((x) => x.id !== c.id));
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusyId(null);
    // Chỉ xoá dòng, KHÔNG xoá file trên R2 — một file mồ côi rẻ hơn nhiều so
    // với rủi ro xoá nhầm file mà dòng khác đang dùng.
  }

  const currentChar = chars.find((c) => c.id === charId);

  return (
    <div>
      <header className="page-header">
        <div>
          <h2>Trang phục</h2>
          <div className="subtitle">
            <span className="stat-pill"><strong>{rows.length}</strong> bộ</span>{' '}
            <span className="stat-pill"><strong>{rows.filter((r) => r.available).length}</strong> đang hiện</span>{' '}
            <span className="stat-pill"><strong>{dressed.length}</strong> nhân vật có đồ thay</span>{' '}
            <span className="stat-pill"><strong>{chars.length - dressed.length}</strong> chưa có bộ nào</span>
          </div>
        </div>
        <button className="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'Đang tải…' : '↻ Tải lại'}
        </button>
      </header>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

      {stalled.length > 0 && (
        <div className="error" style={{ marginBottom: 12 }}>
          <b>{stalled.length} nhân vật có trang phục nhưng app không hiện được bộ nào.</b>{' '}
          App chỉ lấy bộ <i>available</i> — sheet trang phục của những người này đang trống:
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {stalled.map((c) => (
              <button
                key={c.id}
                className="ghost small"
                disabled={busyId !== null}
                title={`Hiện hết ${stats[c.id]!.total} bộ của ${c.name}`}
                onClick={() => void revealAll(c.id)}
              >
                {c.name} (0/{stats[c.id]!.total}) → hiện hết
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 240, flexShrink: 0, maxHeight: '70vh', overflowY: 'auto',
            border: '1px solid var(--border)', borderRadius: 10, padding: 6,
          }}
        >
          <button
            className={charId === '' ? 'primary small' : 'ghost small'}
            style={{ width: '100%', marginBottom: 4 }}
            onClick={() => setCharId('')}
          >
            Tất cả nhân vật
          </button>
          {dressed.map((c) => {
            const s = stats[c.id]!;
            const stuck = s.shown === 0;
            return (
              <button
                key={c.id}
                className={charId === c.id ? 'primary small' : 'ghost small'}
                style={{ width: '100%', marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}
                onClick={() => setCharId(c.id)}
                title={stuck ? 'App không hiện bộ nào của nhân vật này' : ''}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ opacity: 0.85, color: stuck ? '#ff8a96' : undefined }}>{s.shown}/{s.total}</span>
              </button>
            );
          })}
          {dressed.length === 0 && !loading && (
            <div className="muted small" style={{ padding: 8 }}>Chưa nhân vật nào có trang phục.</div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <button key={f} className={filter === f ? 'primary small' : 'ghost small'} onClick={() => setFilter(f)}>
                {FILTER_LABEL[f]}
              </button>
            ))}
            <span className="muted small" style={{ marginLeft: 4 }}>{shown.length} bộ</span>
            {currentChar && (
              <Link
                className="ghost small"
                to={`/characters/${currentChar.id}?tab=outfits`}
                style={{ marginLeft: 'auto', textDecoration: 'none' }}
                title="Thêm bộ mới, sửa URL VRM và ảnh"
              >
                ＋ Thêm bộ cho {currentChar.name} ↗
              </Link>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="empty">{loading ? 'Đang tải…' : 'Không có trang phục nào khớp bộ lọc.'}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(178px, 1fr))', gap: 10 }}>
              {shown.map((c) => (
                <CostumeCard
                  key={c.id}
                  row={c}
                  charName={chars.find((x) => x.id === c.character_id)?.name ?? '—'}
                  showChar={!charId}
                  isDefault={defaultOf.get(c.character_id) === c.id}
                  busy={busyId === c.id || busyId === c.character_id}
                  onPatch={(f) => void patch(c.id, f)}
                  onRename={(name) => (name && name !== c.costume_name ? void patch(c.id, { costume_name: name }) : undefined)}
                  onDefault={() => void makeDefault(c)}
                  onPreview={() => setPreview(c)}
                  onDelete={() => void remove(c)}
                  onError={setErr}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {preview && (
        <VrmPreviewModal url={mediaUrl(preview.model_url)} title={preview.costume_name} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

/// Một ô trang phục. Đổi được ngay tại chỗ những thứ hay phải đổi nhất — hiện/
/// ẩn, PRO, giá, mặc định, tên. Sửa URL VRM/ảnh thì sang trang nhân vật.
function CostumeCard({
  row, charName, showChar, isDefault, busy,
  onPatch, onRename, onDefault, onPreview, onDelete, onError,
}: {
  row: Costume;
  charName: string;
  showChar: boolean;
  isDefault: boolean;
  busy: boolean;
  onPatch: (f: Partial<Costume>) => void;
  onRename: (name: string) => void;
  onDefault: () => void;
  onPreview: () => void;
  onDelete: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(row.costume_name);
  const [price, setPrice] = useState(String(row.price_ruby ?? 0));
  useEffect(() => setName(row.costume_name), [row.costume_name]);
  useEffect(() => setPrice(String(row.price_ruby ?? 0)), [row.price_ruby]);

  const thumb = mediaUrl(row.thumbnail ?? row.url);
  function commitPrice() {
    const v = parsePrice(price);
    if (v === null) {
      onError(`Giá "${price}" không hợp lệ — phải là số nguyên ≥ 0.`);
      setPrice(String(row.price_ruby ?? 0));
      return;
    }
    if (v !== (row.price_ruby ?? 0)) onPatch({ price_ruby: v });
  }

  return (
    <div
      style={{
        border: `1px solid ${row.available ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elev-2)', opacity: busy ? 0.5 : 1,
      }}
    >
      <div
        onClick={row.model_url ? onPreview : undefined}
        title={row.model_url ? 'Xem model VRM' : 'Bộ này chưa có VRM'}
        style={{
          position: 'relative', width: '100%', aspectRatio: '3/4', backgroundColor: 'var(--bg)',
          backgroundImage: thumb ? `url(${thumb})` : undefined, backgroundSize: 'cover',
          backgroundPosition: 'center top', cursor: row.model_url ? 'pointer' : 'default',
          // Bộ ẩn phải nhìn ra là ẩn ngay từ xa, không phải đọc nhãn mới biết.
          filter: row.available ? undefined : 'grayscale(1)',
        }}
      >
        {!thumb && (
          <div className="muted" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>👗</div>
        )}
        <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {isDefault && <span className="flag">mặc định</span>}
          <UnlockBadge type={asUnlock(row.unlock_type)} price={row.price_ruby} />
          <LevelBadge level={asLevel(row.unlock_at_level)} />
          {!row.model_url && <span className="flag nsfw">thiếu VRM</span>}
        </div>
      </div>

      <div style={{ padding: '6px 8px' }}>
        {showChar && (
          <div className="small" style={{ color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{charName}</div>
        )}
        <input
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onRename(name.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setName(row.costume_name);
          }}
          title="Sửa tên rồi bấm Enter"
          style={{ width: '100%', padding: '2px 4px', fontSize: 13, background: 'transparent', border: '1px solid transparent', borderRadius: 4, color: 'var(--text-strong)' }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--border-strong)')}
        />

        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <button
            className={row.available ? 'primary small' : 'ghost small'}
            disabled={busy}
            title={row.available ? 'Đang hiện trong app — bấm để ẩn' : 'Đang ẩn — bấm để hiện'}
            onClick={() => onPatch({ available: !row.available })}
          >
            {row.available ? '👁' : '🚫'}
          </button>
          <LevelSelect
            value={asLevel(row.unlock_at_level)}
            disabled={busy}
            onChange={(v) => onPatch({ unlock_at_level: v })}
          />
          <UnlockSelect
            value={asUnlock(row.unlock_type)}
            disabled={busy}
            onChange={(v) => {
              const problem = unlockProblem(v, row.price_ruby ?? 0);
              if (problem) return alert(problem + ' Nhập giá ở ô 💎 trước.');
              // Không gửi kèm `tier`: trigger sync_tier suy ra đúng rồi, gửi
              // kèm là ghi đè và item ruby lại thành "cần cả PRO".
              onPatch({ unlock_type: v });
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.7 }} title="Giá mở khoá bằng ruby (0 = không bán)">💎</span>
          <input
            value={price}
            inputMode="numeric"
            disabled={busy}
            style={{ width: 72 }}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <button
            className={isDefault ? 'primary small' : 'ghost small'}
            disabled={busy || isDefault}
            title="Đặt làm bộ mặc định của nhân vật này"
            onClick={onDefault}
          >
            ★
          </button>
          <button className="ghost small" disabled={busy || !row.model_url} title="Xem model VRM" onClick={onPreview}>🧍</button>
          <button className="ghost small" disabled={busy} style={{ marginLeft: 'auto' }} title="Xoá trang phục" onClick={onDelete}>🗑</button>
        </div>
      </div>
    </div>
  );
}
