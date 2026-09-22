// QUESTS & RUBY — nhiệm vụ (bảng quests) và các con số kinh tế (economy_config).
//
// Server tự đếm tiến độ cho các event: chat, checkin, checkin_days, watch_ad,
// outfits_owned, backgrounds_owned, dances_owned, all_daily. App chỉ báo được
// change_outfit, change_background, dance, open_gallery, voice_call (và mỗi
// quest bị chặn ở mục tiêu của nó). Event khác → quest không bao giờ xong.
//
// Tiêu đề ở đây là bản tiếng Anh dự phòng; app dịch theo id (quest.q.<id>).
// Quest mới thêm sẽ hiện tiêu đề tiếng Anh này cho mọi ngôn ngữ.

import { useEffect, useState } from 'react';
import { errMsg, insertOne, selectAll, updateWhere } from '../lib/db';
import type { EconomyConfig, Quest } from '../lib/types';

const EVENTS: { id: string; label: string; special?: boolean }[] = [
  { id: 'chat', label: 'Gửi tin nhắn (server đếm)' },
  { id: 'checkin', label: 'Điểm danh hôm nay (server)' },
  { id: 'watch_ad', label: 'Xem video thưởng (server)' },
  { id: 'change_outfit', label: 'Đổi trang phục (app báo, chỉ daily)' },
  { id: 'change_background', label: 'Đổi địa điểm (app báo, chỉ daily)' },
  { id: 'dance', label: 'Xem nhảy (app báo, chỉ daily)' },
  { id: 'open_gallery', label: 'Mở thư viện (app báo, chỉ daily)' },
  { id: 'voice_call', label: 'Gọi thoại (app báo, chỉ daily)' },
  { id: 'all_daily', label: 'Xong mọi daily khác (server)' },
  { id: 'checkin_days', label: 'Tổng số ngày điểm danh (server)', special: true },
  { id: 'outfits_owned', label: 'Số trang phục sở hữu (server)', special: true },
  { id: 'backgrounds_owned', label: 'Số địa điểm sở hữu (server)', special: true },
  { id: 'dances_owned', label: 'Số điệu nhảy sở hữu (server)', special: true },
];
const CLIENT_ONLY_DAILY = ['change_outfit', 'change_background', 'dance', 'open_gallery', 'voice_call'];
const ICONS = ['calendar', 'message', 'messages', 'shirt', 'map', 'music', 'photo', 'video', 'trophy'];

type Row = Quest & { _dirty?: boolean };

export default function Quests() {
  const [quests, setQuests] = useState<Row[]>([]);
  const [config, setConfig] = useState<EconomyConfig[]>([]);
  const [cfgDraft, setCfgDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [newQ, setNewQ] = useState({ id: '', kind: 'daily' as Quest['kind'], event: 'chat', target: '1', reward_ruby: '5', title: '', icon: 'trophy' });

  async function load() {
    try {
      const [q, c] = await Promise.all([
        selectAll<Quest>('quests', '*', { column: 'sort_order' }),
        selectAll<EconomyConfig>('economy_config', 'key, value, description', { column: 'key' }),
      ]);
      setQuests(q);
      setConfig(c);
      setCfgDraft(Object.fromEntries(c.map((x) => [x.key, String(x.value)])));
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const edit = (id: string, patch: Partial<Quest>) =>
    setQuests((p) => p.map((q) => (q.id === id ? { ...q, ...patch, _dirty: true } : q)));

  const intOk = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

  async function saveAll() {
    setErr('');
    const dirty = quests.filter((q) => q._dirty);
    for (const q of dirty) {
      if (!intOk(q.target) || q.target < 1 || !intOk(q.reward_ruby)) return setErr(`${q.id}: mục tiêu ≥ 1, thưởng ≥ 0, số nguyên.`);
    }
    const cfgChanged = config.filter((c) => cfgDraft[c.key] !== String(c.value));
    for (const c of cfgChanged) {
      if (!/^\d+$/.test(cfgDraft[c.key] ?? '')) return setErr(`${c.key}: phải là số nguyên ≥ 0.`);
    }
    setBusy(true);
    try {
      for (const q of dirty) {
        await updateWhere('quests', {
          title: q.title, target: q.target, reward_ruby: q.reward_ruby, is_active: q.is_active,
          sort_order: q.sort_order, icon: q.icon, updated_at: new Date().toISOString(),
        }, { id: q.id });
      }
      for (const c of cfgChanged) {
        await updateWhere('economy_config', { value: Number(cfgDraft[c.key]), updated_at: new Date().toISOString() }, { key: c.key });
      }
      setSavedAt(new Date());
      await load();
    } catch (e) {
      setErr(`${errMsg(e)} — có thể đã lưu một phần; bảng đã nạp lại.`);
      await load();
    }
    setBusy(false);
  }

  async function addQuest() {
    setErr('');
    const id = newQ.id.trim();
    if (!/^[a-z0-9_]+$/.test(id)) return setErr('Id chỉ gồm a-z, 0-9, _ (vd d_chat_50).');
    if (quests.some((q) => q.id === id)) return setErr('Id đã tồn tại.');
    if (newQ.kind === 'special' && CLIENT_ONLY_DAILY.includes(newQ.event)) return setErr('Event do app báo chỉ dùng được cho daily.');
    const target = Number(newQ.target), reward = Number(newQ.reward_ruby);
    if (!Number.isInteger(target) || target < 1 || !Number.isInteger(reward) || reward < 0) return setErr('Mục tiêu ≥ 1, thưởng ≥ 0.');
    if (!newQ.title.trim()) return setErr('Cần tiêu đề (tiếng Anh).');
    setBusy(true);
    try {
      await insertOne<Quest>('quests', {
        id, kind: newQ.kind, event: newQ.event, target, reward_ruby: reward, title: newQ.title.trim(), icon: newQ.icon,
        sort_order: (quests.at(-1)?.sort_order ?? 0) + 10, is_active: true,
      });
      setNewQ({ ...newQ, id: '', title: '' });
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(false);
  }

  const daily = quests.filter((q) => q.kind === 'daily' && q.is_active);
  const dailyTotal = daily.reduce((s, q) => s + q.reward_ruby, 0);
  const n = (k: string) => Number(cfgDraft[k] ?? 0);
  const dirtyCount = quests.filter((q) => q._dirty).length + config.filter((c) => cfgDraft[c.key] !== String(c.value)).length;

  const table = (kind: Quest['kind']) => (
    <table className="table" style={{ width: '100%' }}>
      <thead>
        <tr><th>Bật</th><th>Id</th><th>Tiêu đề (EN)</th><th>Event</th><th>Mục tiêu</th><th>💎</th><th>Icon</th><th>Thứ tự</th></tr>
      </thead>
      <tbody>
        {quests.filter((q) => q.kind === kind).map((q) => (
          <tr key={q.id} style={{ opacity: q.is_active ? 1 : 0.5, background: q._dirty ? 'rgba(255,77,141,0.06)' : undefined }}>
            <td><input type="checkbox" checked={q.is_active} onChange={(e) => edit(q.id, { is_active: e.target.checked })} /></td>
            <td><code>{q.id}</code></td>
            <td><input value={q.title} onChange={(e) => edit(q.id, { title: e.target.value })} style={{ width: '100%' }} /></td>
            <td className="muted small">{q.event}</td>
            <td><input value={q.target} inputMode="numeric" onChange={(e) => edit(q.id, { target: Number(e.target.value) })} style={{ width: 70 }} /></td>
            <td><input value={q.reward_ruby} inputMode="numeric" onChange={(e) => edit(q.id, { reward_ruby: Number(e.target.value) })} style={{ width: 60 }} /></td>
            <td>
              <select value={q.icon ?? ''} onChange={(e) => edit(q.id, { icon: e.target.value })}>
                {ICONS.map((i) => <option key={i}>{i}</option>)}
              </select>
            </td>
            <td><input value={q.sort_order} inputMode="numeric" onChange={(e) => edit(q.id, { sort_order: Number(e.target.value) })} style={{ width: 60 }} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2>Quests & Ruby</h2>
          <div className="subtitle" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="stat-pill">Daily tối đa/ngày: <strong>💎 {dailyTotal}</strong></span>
            <span className="stat-pill">Ads/ngày: <strong>💎 {n('ad_reward_ruby') * n('ad_daily_limit')}</strong></span>
            <span className="stat-pill">PRO/ngày: <strong>💎 {n('pro_daily_bonus')}</strong></span>
            {savedAt && <span className="muted small" style={{ color: 'var(--ok)' }}>✓ đã lưu {savedAt.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div className="actions">
          <button className="ghost" disabled={busy} onClick={() => void load()}>↻ Tải lại</button>
          <button className="primary" disabled={busy || dirtyCount === 0} onClick={() => void saveAll()}>{busy ? 'Đang lưu…' : `Lưu${dirtyCount ? ` (${dirtyCount})` : ''}`}</button>
        </div>
      </header>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Nhiệm vụ hằng ngày</h3>
        <div className="muted small" style={{ marginBottom: 8 }}>Làm mới 00:00 UTC. Mỗi quest nhận 1 lần/ngày (server chặn trùng).</div>
        {table('daily')}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Nhiệm vụ đặc biệt (1 lần)</h3>
        {table('special')}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Thêm nhiệm vụ</h3>
        <div className="row">
          <label><span>Id</span><input value={newQ.id} onChange={(e) => setNewQ({ ...newQ, id: e.target.value })} placeholder="d_chat_50" style={{ width: 130 }} /></label>
          <label>
            <span>Loại</span>
            <select value={newQ.kind} onChange={(e) => setNewQ({ ...newQ, kind: e.target.value as Quest['kind'] })}>
              <option value="daily">daily</option>
              <option value="special">special</option>
            </select>
          </label>
          <label>
            <span>Event</span>
            <select value={newQ.event} onChange={(e) => setNewQ({ ...newQ, event: e.target.value })}>
              {EVENTS.filter((ev) => newQ.kind === 'daily' ? !ev.special : !CLIENT_ONLY_DAILY.includes(ev.id)).map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
            </select>
          </label>
          <label><span>Mục tiêu</span><input value={newQ.target} onChange={(e) => setNewQ({ ...newQ, target: e.target.value })} style={{ width: 70 }} /></label>
          <label><span>💎</span><input value={newQ.reward_ruby} onChange={(e) => setNewQ({ ...newQ, reward_ruby: e.target.value })} style={{ width: 60 }} /></label>
          <label className="grow"><span>Tiêu đề (EN)</span><input value={newQ.title} onChange={(e) => setNewQ({ ...newQ, title: e.target.value })} /></label>
          <button className="primary" disabled={busy} onClick={() => void addQuest()} style={{ alignSelf: 'flex-end' }}>Thêm</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Con số kinh tế (economy_config)</h3>
        <div className="muted small" style={{ marginBottom: 10 }}>
          <code>pack_truemate.ruby.N</code> = số ruby webhook RevenueCat cộng khi mua gói đó. Đổi ở đây có hiệu lực ngay cho lần mua sau.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {config.map((c) => {
            const v = cfgDraft[c.key] ?? '';
            const dirty = v !== String(c.value);
            return (
              <label key={c.key} style={{ padding: 8, borderRadius: 8, border: `1px solid ${!/^\d+$/.test(v) ? '#ff453a' : dirty ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--bg-elev-2)' }}>
                <span><code>{c.key}</code></span>
                <input value={v} inputMode="numeric" onChange={(e) => setCfgDraft((d) => ({ ...d, [c.key]: e.target.value }))} />
                <span className="muted small">{c.description}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
