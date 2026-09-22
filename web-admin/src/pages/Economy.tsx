// ECONOMY — lịch thưởng điểm danh 30 ngày (bảng login_rewards).
//
// Đây là phần tương đương trang Economy của CMS Yuuki. Chỉ sửa RUBY vì đó là
// thứ duy nhất có tác dụng thật:
//   - app hiện lịch bằng `select day_number, reward_ruby` (checkinService)
//   - hàm trả thưởng app_claim_daily_reward chỉ đọc reward_ruby
// Cột reward_vcoin / reward_energy vẫn có dữ liệu nhưng KHÔNG ai trả ra — sửa
// chúng ở đây sẽ là sửa cho vui, nên không có ô cho chúng.
//
// Không làm trang cho bảng game_config: không app, không hàm DB, không edge
// function nào đọc bảng đó.

import { useEffect, useMemo, useState } from 'react';
import { errMsg, parsePrice, selectAll, updateOne } from '../lib/db';
import type { LoginReward } from '../lib/types';

export default function Economy() {
  const [rows, setRows] = useState<LoginReward[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await selectAll<LoginReward>('login_rewards', '*', { column: 'day_number' });
      setRows(r);
      setDraft(Object.fromEntries(r.map((x) => [x.id, String(x.reward_ruby ?? 0)])));
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  const changed = rows.filter((r) => draft[r.id] !== String(r.reward_ruby ?? 0));
  const invalid = rows.filter((r) => parsePrice(draft[r.id] ?? '') === null);
  const total = useMemo(
    () => rows.reduce((s, r) => s + (parsePrice(draft[r.id] ?? '') ?? 0), 0),
    [rows, draft],
  );

  async function save() {
    if (invalid.length) return setErr(`Ngày ${invalid.map((r) => r.day_number).join(', ')}: phải là số nguyên ≥ 0.`);
    setBusy(true);
    setErr('');
    try {
      for (const r of changed) {
        await updateOne('login_rewards', r.id, { reward_ruby: parsePrice(draft[r.id])! });
      }
      setSavedAt(new Date());
      await load();
    } catch (e) {
      setErr(`${errMsg(e)} — đã lưu được một phần, bảng đã nạp lại theo DB.`);
      await load();
    }
    setBusy(false);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2>Economy</h2>
          <div className="subtitle" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="stat-pill">Điểm danh <strong>{rows.length}</strong> ngày</span>
            <span className="stat-pill">Tổng một vòng: <strong>💎 {total.toLocaleString()}</strong></span>
            {savedAt && <span className="muted small" style={{ color: 'var(--ok)' }}>✓ đã lưu {savedAt.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div className="actions">
          <button className="ghost" disabled={loading || busy} onClick={() => void load()}>↻ Tải lại</button>
          <button className="primary" disabled={busy || changed.length === 0} onClick={() => void save()}>
            {busy ? 'Đang lưu…' : `Lưu${changed.length ? ` (${changed.length})` : ''}`}
          </button>
        </div>
      </header>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ruby thưởng theo ngày (login_rewards.reward_ruby)</h3>
        <div className="muted small" style={{ marginBottom: 12 }}>
          Người dùng nhận ngày <i>n</i> của vòng 30 ngày, hết ngày 30 thì quay lại ngày 1. Ô viền sáng = có thay đổi chưa lưu.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
          {rows.map((r) => {
            const v = draft[r.id] ?? '';
            const bad = parsePrice(v) === null;
            const dirty = v !== String(r.reward_ruby ?? 0);
            return (
              <label
                key={r.id}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4, padding: 8, borderRadius: 8,
                  border: `1px solid ${bad ? '#ff453a' : dirty ? 'var(--accent)' : 'var(--border)'}`,
                  background: 'var(--bg-elev-2)',
                }}
              >
                <span className="muted small">Ngày {r.day_number}</span>
                <input
                  value={v}
                  inputMode="numeric"
                  onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
