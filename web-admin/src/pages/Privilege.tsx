// PRIVILEGE — tài khoản đặc quyền (Privilege Authenticator trong Settings của app).
//
// Ai đăng nhập đúng username + password ở đây trong app sẽ thành PRO trên tài
// khoản đang dùng. Dùng cho reviewer Google Play / App Store (điền vào
// App access) hoặc đối tác. Mật khẩu chỉ lưu dạng bcrypt ở server — trang này
// không đọc lại được mật khẩu cũ, chỉ đặt mật khẩu mới. Tắt một tài khoản sẽ
// gỡ PRO khỏi mọi người đã đăng nhập bằng nó.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { errMsg } from '../lib/db';

type Cred = { id: string; username: string; is_active: boolean; note: string | null; created_at: string; users: number };

function randomPassword() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(14);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => a[n % a.length]).join('');
}

export default function Privilege() {
  const [rows, setRows] = useState<Cred[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(randomPassword());
  const [note, setNote] = useState('');
  const [shown, setShown] = useState<{ username: string; password: string } | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc('admin_list_privilege');
    if (error) return setErr(error.message);
    setRows((data ?? []) as Cred[]);
    setErr('');
  }
  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setErr('');
    if (!/^[\w.@-]{3,}$/.test(username.trim())) return setErr('Username ≥ 3 ký tự (chữ, số, . _ - @).');
    if (password.length < 8) return setErr('Mật khẩu ≥ 8 ký tự.');
    setBusy(true);
    try {
      const { error } = await supabase.rpc('admin_set_privilege_credential', {
        p_username: username.trim(), p_password: password, p_note: note.trim() || null,
      });
      if (error) throw error;
      setShown({ username: username.trim(), password });
      setUsername('');
      setNote('');
      setPassword(randomPassword());
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(false);
  }

  async function toggle(c: Cred) {
    if (c.is_active && !confirm(`Tắt "${c.username}"? ${c.users} tài khoản đang PRO nhờ nó sẽ mất PRO.`)) return;
    const { error } = await supabase.rpc('admin_toggle_privilege_credential', { p_id: c.id, p_active: !c.is_active });
    if (error) return setErr(error.message);
    await load();
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2>Privilege accounts</h2>
          <div className="subtitle">Đăng nhập trong app: Settings → Privilege Authenticator → tài khoản thành PRO.</div>
        </div>
        <button className="ghost" onClick={() => void load()}>↻ Tải lại</button>
      </header>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
      {shown && (
        <div className="card" style={{ borderColor: 'var(--ok)' }}>
          <strong>Đã lưu.</strong> Chép ngay — trang này không hiện lại mật khẩu:
          <pre style={{ userSelect: 'all', margin: '8px 0 0' }}>Username: {shown.username}{'\n'}Password: {shown.password}</pre>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tạo / đổi mật khẩu</h3>
        <div className="muted small" style={{ marginBottom: 8 }}>Nhập username đã có để đặt mật khẩu mới (và bật lại nếu đang tắt).</div>
        <div className="row">
          <label><span>Username</span><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="reviewer.truemate" /></label>
          <label className="grow"><span>Password</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={password} onChange={(e) => setPassword(e.target.value)} style={{ flex: 1, fontFamily: 'ui-monospace, Menlo, monospace' }} />
              <button className="ghost small" onClick={() => setPassword(randomPassword())}>🎲</button>
            </div>
          </label>
          <label className="grow"><span>Ghi chú</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Google Play review 2026-09" /></label>
          <button className="primary" disabled={busy} onClick={() => void save()} style={{ alignSelf: 'flex-end' }}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </div>

      <div className="card">
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>Username</th><th>Ghi chú</th><th>Đang PRO nhờ nó</th><th>Tạo lúc</th><th /></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} style={{ opacity: c.is_active ? 1 : 0.5 }}>
                <td><code>{c.username}</code></td>
                <td className="muted small">{c.note}</td>
                <td>{c.users}</td>
                <td className="muted small">{new Date(c.created_at).toLocaleString()}</td>
                <td><button className={c.is_active ? 'danger small' : 'primary small'} onClick={() => void toggle(c)}>{c.is_active ? 'Tắt' : 'Bật'}</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">Chưa có tài khoản nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
