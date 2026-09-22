// Firebase Remote Config — bật/tắt & sửa param ngay trên CMS (port từ CMS Yuuki).
//
// Project Firebase của TrueFeel là `truemate-e3401`. Edge function
// `remote-config` cần secret FIREBASE_SA_JSON (service account của project đó)
// — chưa đặt thì trang hiện hướng dẫn thay vì danh sách.
//
// Private key của service account KHÔNG ở đây: mọi thao tác đi qua edge function
// `remote-config` (admin-gate + giữ key server-side). Trang này chỉ list + gửi
// thay đổi.

import { useEffect, useState, type CSSProperties } from 'react';
import { supabase, mediaUrl } from '../lib/supabase';
import { fnErrorMessage } from '../lib/fnError';

type Param = {
  key: string;
  value: string | null;
  useInAppDefault: boolean;
  valueType: string; // BOOLEAN | NUMBER | STRING | JSON
  description: string;
  conditional: string[];
};

type ListResp = { params?: Param[]; etag?: string; projectId?: string; error?: string };

type CharRow = { id: string; name: string; thumbnail_url: string | null; avatar: string | null };

/** Ảnh nhân vật — giống trang Characters. */
function charAvatar(c: CharRow): string | null {
  return mediaUrl(c.thumbnail_url ?? c.avatar);
}

function Avatar({ c, size = 28 }: { c: CharRow; size?: number }) {
  const url = charAvatar(c);
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-elev-2)',
        border: '1px solid var(--border)',
        fontSize: size * 0.45,
        color: 'var(--muted)',
      }}
    >
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : (c.name.slice(0, 1) || '?')}
    </span>
  );
}

// Key Remote Config chứa danh sách character id ẩn trên iOS. Có UI riêng bên
// dưới (toggle theo tên nhân vật), nên ẩn khỏi danh sách "Giá trị" thô.
const IOS_HIDDEN_KEY = 'ios_hidden_characters';

export default function RemoteConfig() {
  const [params, setParams] = useState<Param[]>([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  // Giá trị đang chỉnh cho các param không phải boolean (theo key).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Danh sách nhân vật (cho UI ẩn iOS).
  const [chars, setChars] = useState<CharRow[]>([]);
  // Multi-select dropdown "ẩn iOS".
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  async function load() {
    setLoading(true);
    setErr('');
    const { data, error } = await supabase.functions.invoke<ListResp>('remote-config', {
      body: { op: 'list' },
    });
    if (error) { setErr(await fnErrorMessage(error)); setLoading(false); return; }
    if (data?.error) { setErr(data.error); setLoading(false); return; }
    setParams(data?.params ?? []);
    setProjectId(data?.projectId ?? '');
    setDrafts({});
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  // Nạp danh sách nhân vật để render toggle "ẩn iOS" theo tên.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('characters')
        .select('id, name, thumbnail_url, avatar')
        .order('order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      setChars((data as CharRow[] | null) ?? []);
    })();
  }, []);

  async function commit(key: string, value: string) {
    setSavingKey(key);
    setErr('');
    const { data, error } = await supabase.functions.invoke<ListResp>('remote-config', {
      body: { op: 'set', changes: { [key]: value } },
    });
    if (error) { setErr(await fnErrorMessage(error)); setSavingKey(null); return; }
    if (data?.error) { setErr(data.error); setSavingKey(null); return; }
    setParams(data?.params ?? []);
    setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
    setSavingKey(null);
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2500);
  }

  const booleans = params.filter((p) => p.valueType === 'BOOLEAN');
  const others = params.filter((p) => p.valueType !== 'BOOLEAN' && p.key !== IOS_HIDDEN_KEY);

  // Nhân vật ẩn iOS: parse từ giá trị param (id ngăn cách phẩy/xuống dòng).
  const hiddenParamExists = params.some((p) => p.key === IOS_HIDDEN_KEY);
  const hiddenRaw = params.find((p) => p.key === IOS_HIDDEN_KEY)?.value ?? '';
  const hiddenIds = hiddenRaw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const hiddenSet = new Set(hiddenIds);
  const savingHidden = savingKey === IOS_HIDDEN_KEY;
  const q = pickerQuery.trim().toLowerCase();
  const available = chars.filter(
    (c) => !hiddenSet.has(c.id) && (!q || c.name.toLowerCase().includes(q)),
  );

  async function toggleHidden(id: string) {
    const next = new Set(hiddenSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    await commit(IOS_HIDDEN_KEY, Array.from(next).join(','));
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2>Remote Config</h2>
          <div className="subtitle">
            Bật/tắt & sửa tham số Firebase Remote Config
            {projectId && <> — <code>{projectId}</code></>}. Thay đổi <strong>publish ngay</strong> cho app.
          </div>
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => void load()} disabled={loading}>↻ Tải lại</button>
        </div>
      </header>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
      {err.includes('FIREBASE_SA_JSON') && <SetupHelp />}

      {loading ? (
        <div className="card"><div className="muted small">Loading…</div></div>
      ) : (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Bật / tắt ({booleans.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {booleans.map((p) => {
                const on = p.value === 'true';
                const busy = savingKey === p.key;
                return (
                  <div key={p.key} className="rc-row" style={rowStyle}>
                    <div style={{ minWidth: 0 }}>
                      <code style={{ fontSize: 13 }}>{p.key}</code>
                      {p.conditional.length > 0 && (
                        <span className="muted small" style={{ marginLeft: 8 }}>
                          (có điều kiện: {p.conditional.join(', ')})
                        </span>
                      )}
                      {p.description && <div className="muted small">{p.description}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {savedKey === p.key && <span style={{ color: 'var(--ok)', fontSize: 12 }}>✓ đã lưu</span>}
                      <button
                        className={on ? 'primary' : 'ghost'}
                        disabled={busy}
                        onClick={() => void commit(p.key, on ? 'false' : 'true')}
                        style={{ minWidth: 84 }}
                      >
                        {busy ? '…' : on ? 'BẬT' : 'TẮT'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Giá trị ({others.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {others.map((p) => {
                const current = p.useInAppDefault ? '' : (p.value ?? '');
                const draft = drafts[p.key];
                const shown = draft ?? current;
                const dirty = draft !== undefined && draft !== current;
                const busy = savingKey === p.key;
                return (
                  <div key={p.key} className="rc-row" style={rowStyle}>
                    <div style={{ minWidth: 0 }}>
                      <code style={{ fontSize: 13 }}>{p.key}</code>{' '}
                      <span className="muted small">[{p.valueType}]</span>
                      {p.useInAppDefault && <span className="muted small"> (dùng default trong app)</span>}
                      {p.conditional.length > 0 && (
                        <span className="muted small" style={{ marginLeft: 8 }}>
                          (có điều kiện: {p.conditional.join(', ')})
                        </span>
                      )}
                      {p.description && <div className="muted small">{p.description}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {savedKey === p.key && <span style={{ color: 'var(--ok)', fontSize: 12 }}>✓</span>}
                      <input
                        value={shown}
                        onChange={(e) => setDrafts((d) => ({ ...d, [p.key]: e.target.value }))}
                        disabled={busy}
                        inputMode={p.valueType === 'NUMBER' ? 'decimal' : 'text'}
                        style={inputStyle}
                      />
                      <button
                        className="primary"
                        disabled={busy || !dirty}
                        onClick={() => void commit(p.key, shown)}
                      >
                        {busy ? '…' : 'Lưu'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>
              Nhân vật ẩn trên iOS ({hiddenSet.size})
            </h3>
            <p className="muted small" style={{ marginTop: 0, lineHeight: 1.5 }}>
              Nhân vật được bật ở đây sẽ <strong>không hiện trong app trên iOS</strong> (để qua
              App Store review). Android vẫn hiện đủ. Ghi vào Remote Config
              <code> {IOS_HIDDEN_KEY}</code> — publish ngay, không cần build mới.
            </p>
            {!hiddenParamExists ? (
              <div className="muted small">
                Chưa có param <code>{IOS_HIDDEN_KEY}</code> trên Remote Config — bấm “↻ Tải lại”.
              </div>
            ) : chars.length === 0 ? (
              <div className="muted small">Đang tải danh sách nhân vật…</div>
            ) : (
              <>
                {/* Chips: nhân vật đang ẩn */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {hiddenIds.length === 0 && (
                    <span className="muted small">Chưa ẩn nhân vật nào.</span>
                  )}
                  {hiddenIds.map((id) => {
                    const c = chars.find((x) => x.id === id);
                    // Id rác (nhân vật đã bị xoá) → không tìm thấy trong `chars`.
                    // Vẫn hiện chip để admin dọn; trên app nó chỉ là no-op vô hại.
                    return (
                      <span key={id} style={chipStyle} title={c ? id : `Nhân vật đã xoá — id ${id}`}>
                        {c ? <Avatar c={c} size={22} /> : <span>⚠️</span>}
                        {c ? c.name : <span className="muted">(đã xoá) {id.slice(0, 8)}…</span>}
                        <button
                          onClick={() => void toggleHidden(id)}
                          disabled={savingHidden}
                          style={chipXStyle}
                          title={c ? 'Bỏ ẩn' : 'Dọn id rác'}
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>

                {/* Dropdown multi-select có search */}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    className="ghost"
                    disabled={savingHidden}
                    onClick={() => setPickerOpen((o) => !o)}
                  >
                    {savingHidden ? 'Đang lưu…' : '＋ Chọn nhân vật ẩn ▾'}
                  </button>
                  {pickerOpen && (
                    <>
                      <div onClick={() => setPickerOpen(false)} style={backdropStyle} />
                      <div style={panelStyle}>
                        <input
                          autoFocus
                          placeholder="Tìm nhân vật…"
                          value={pickerQuery}
                          onChange={(e) => setPickerQuery(e.target.value)}
                          style={{ ...inputStyle, width: '100%', marginBottom: 6 }}
                        />
                        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                          {available.length === 0 && (
                            <div className="muted small" style={{ padding: 6 }}>
                              {hiddenSet.size === chars.length ? 'Đã ẩn tất cả.' : 'Không có nhân vật khớp.'}
                            </div>
                          )}
                          {available.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => void toggleHidden(c.id)}
                              disabled={savingHidden}
                              style={optStyle}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Avatar c={c} size={30} />
                                {c.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <p className="muted small" style={{ margin: 0, lineHeight: 1.6 }}>
              ⚠️ App TrueFeel hiện <strong>chưa đọc Remote Config</strong> (chưa cài
              <code> @react-native-firebase/remote-config</code>) — giá trị sửa ở đây chỉ có tác dụng
              khi app được cập nhật để đọc chúng, và việc cài module đó cần build native mới.
              Chỉ sửa được các key ĐANG CÓ; thêm key mới thì làm ở Firebase Console.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid var(--border)',
};

const inputStyle: CSSProperties = {
  width: 160,
  padding: '6px 8px',
  background: 'var(--bg-elev-2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 13,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 6px 4px 10px',
  background: 'var(--bg-elev-2)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  fontSize: 13,
};

const chipXStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--muted)',
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1,
  padding: '2px 4px',
};

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10,
};

const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  zIndex: 11,
  width: 280,
  padding: 8,
  background: 'var(--bg-elev-1, var(--bg-elev-2))',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
};

const optStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 10px',
  background: 'transparent',
  border: 'none',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 14,
  cursor: 'pointer',
};

/// Hướng dẫn khi edge function chưa có service account — thay vì để admin
/// nhìn một dòng lỗi mà không biết làm gì tiếp.
function SetupHelp() {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Cần cấu hình một lần</h3>
      <ol className="small" style={{ lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
        <li>Firebase Console → project <code>truemate-e3401</code> → Project settings → Service accounts.</li>
        <li>Bấm <b>Generate new private key</b>, tải file JSON về.</li>
        <li>
          Đặt vào secret của edge function <code>remote-config</code> trên Supabase (Dashboard → Edge Functions →
          Secrets), tên <code>FIREBASE_SA_JSON</code>, giá trị là <b>toàn bộ nội dung</b> file JSON.
        </li>
        <li>Quay lại đây bấm “↻ Tải lại”.</li>
      </ol>
      <p className="muted small" style={{ marginBottom: 0 }}>
        Key này chỉ nằm phía server — không bao giờ gửi xuống trình duyệt.
      </p>
    </div>
  );
}
