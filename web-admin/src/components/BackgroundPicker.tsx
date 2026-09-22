import { useMemo, useState } from 'react';

import { mediaUrl } from '../lib/supabase';
import type { Background } from '../lib/types';

/// Chọn cảnh bằng MẮT, không bằng tên.
///
/// Trước đây chỗ này là một `<select>`: người dùng phải nhớ "Temple Stairs" trông
/// như thế nào mới chọn được, mà tên cảnh thì gần như vô nghĩa với người không
/// tự tay đặt. Ảnh nền là thứ thuần thị giác — bộ chọn cũng phải vậy.
///
/// Ảnh xem trước dùng `thumbnail`; rơi về ảnh gốc chỉ khi cảnh đó chưa có bản thu
/// nhỏ, vì ảnh scene đầy đủ nặng ~700KB và một lưới 45 cảnh sẽ kéo về ~30MB.
export function BackgroundPicker({
  value,
  backgrounds,
  onPick,
  onClose,
}: {
  value: string | null;
  backgrounds: Background[];
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? backgrounds.filter((b) => b.name.toLowerCase().includes(s)) : backgrounds;
  }, [q, backgrounds]);

  const pick = (id: string | null) => {
    onPick(id);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 980 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3
            style={{
              margin: 0,
              textTransform: 'none',
              letterSpacing: 0,
              fontSize: 16,
            }}
          >
            🖼 Chọn nền mặc định
          </h3>
          <button className="ghost small" onClick={onClose}>
            Đóng
          </button>
        </div>

        <input
          placeholder="Tìm theo tên cảnh…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
            maxHeight: '58vh',
            overflowY: 'auto',
          }}
        >
          {/* Bỏ trống là hợp lệ: nhân vật không có background_default_id thì
              app giữ nền đang dùng, nên đây không phải trường bắt buộc. */}
          <Tile
            selected={value == null}
            onClick={() => pick(null)}
            label="Chưa đặt"
            url={null}
          />
          {list.map((b) => (
            <Tile
              key={b.id}
              selected={value === b.id}
              onClick={() => pick(b.id)}
              label={b.name}
              pro={b.tier === 'pro'}
              url={mediaUrl(b.thumbnail ?? b.image)}
            />
          ))}
        </div>

        {list.length === 0 && (
          <div className="muted small" style={{ marginTop: 12 }}>
            Không có cảnh nào khớp “{q}”.
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({
  url,
  label,
  pro,
  selected,
  onClick,
}: {
  url: string | null;
  label: string;
  pro?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{
        position: 'relative',
        padding: 0,
        border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'transparent',
        cursor: 'pointer',
        aspectRatio: '9 / 14',
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          className="avatar-empty"
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ∅
        </div>
      )}

      {pro && (
        <span
          className="flag pro"
          style={{ position: 'absolute', top: 6, left: 6, fontSize: 10 }}
        >
          PRO
        </span>
      )}
      {selected && (
        <span
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 20,
            height: 20,
            borderRadius: 10,
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 12,
            lineHeight: '20px',
            textAlign: 'center',
          }}
        >
          ✓
        </span>
      )}

      {/* Tên đặt trên dải mờ ở đáy: cần để phân biệt hai cảnh giống nhau, nhưng
          không được che mất chính thứ người dùng đang nhìn. */}
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '10px 6px 5px',
          fontSize: 11,
          fontWeight: 600,
          color: '#fff',
          textAlign: 'left',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.78))',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
    </button>
  );
}
