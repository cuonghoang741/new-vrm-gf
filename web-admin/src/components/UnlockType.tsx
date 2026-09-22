import { LEVELS, UNLOCK_TYPES, type UnlockType } from '../lib/unlock';

export function UnlockSelect({ value, onChange, disabled }: { value: UnlockType; onChange: (v: UnlockType) => void; disabled?: boolean }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as UnlockType)} title={UNLOCK_TYPES.find((u) => u.id === value)?.hint}>
      {UNLOCK_TYPES.map((u) => (
        <option key={u.id} value={u.id}>{u.label}</option>
      ))}
    </select>
  );
}

export function UnlockBadge({ type, price }: { type: UnlockType; price?: number | null }) {
  const p = price ?? 0;
  if (type === 'default') return <span className="flag">free</span>;
  if (type === 'ads') return <span className="flag">▶️ ads</span>;
  if (type === 'ruby') return <span className="flag nsfw" style={p > 0 ? undefined : { outline: '1px solid #ff453a' }} title={p > 0 ? undefined : 'Ruby nhưng chưa có giá — app sẽ không bán được'}>💎{p || '?'}</span>;
  return <span className="flag pro">PRO{p > 0 ? ` / 💎${p}` : ''}</span>;
}


/** Mốc level mở khoá (cột unlock_at_level). 1 = không khoá. */
export function LevelSelect({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      title="Cần thân thiết tới mốc này mới dùng được, trước cả PRO/ruby"
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {LEVELS.map((n) => (
        <option key={n} value={n}>{n === 1 ? '— mọi level' : `❤️ Lv ${n}`}</option>
      ))}
    </select>
  );
}

export function LevelBadge({ level }: { level: number }) {
  if (!level || level <= 1) return null;
  return <span className="flag" title="Khoá theo mức thân thiết">❤️ Lv {level}</span>;
}
