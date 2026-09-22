// Trang CHI TIẾT NHÂN VẬT (port từ CMS Yuuki): tab Thông tin / Trang phục / Media.
//
// Không có tab Personalities / Chat thử như Yuuki — TrueFeel không có bảng
// personalities, và chat đi qua gemini-chat với luồng riêng.

import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { mediaUrl, supabase } from '../lib/supabase';
import { errMsg, nullIfBlank, parsePrice, updateOne } from '../lib/db';
import { BackgroundPicker } from '../components/BackgroundPicker';
import VrmPreview from '../components/VrmPreview';
import { TranslationsCard } from './character/TranslationsCard';
import { OutfitsTab } from './character/OutfitsTab';
import { MediaTab } from './character/MediaTab';
import type { Background, Character } from '../lib/types';

type Tab = 'details' | 'outfits' | 'media';
const TABS: { id: Tab; label: string }[] = [
  { id: 'details', label: 'Thông tin' },
  { id: 'outfits', label: 'Trang phục' },
  { id: 'media', label: 'Media' },
];

export default function CharacterEditor() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'details') as Tab;
  const [char, setChar] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  async function loadChar() {
    setLoading(true);
    const { data, error } = await supabase.from('characters').select('*').eq('id', id).maybeSingle();
    if (error) setErr(error.message);
    setChar((data as Character) ?? null);
    setLoading(false);
  }
  useEffect(() => {
    void loadChar();
  }, [id]);

  async function setDefaultCostume(costumeId: string | null) {
    if (!char) return;
    try {
      await updateOne('characters', char.id, { default_costume_id: costumeId });
      setChar({ ...char, default_costume_id: costumeId });
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  if (loading) return <div className="page"><div className="loading">Loading…</div></div>;
  if (!char) return <div className="page"><div className="error">{err || 'Không tìm thấy nhân vật.'}</div></div>;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2>{char.name}</h2>
          <div className="subtitle"><Link to="/">← Characters</Link> · <code>{char.id}</code></div>
        </div>
      </header>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setParams({ tab: t.id })}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'details' && <DetailsTab char={char} onSaved={(c) => setChar(c)} />}
      {tab === 'outfits' && (
        <OutfitsTab characterId={char.id} defaultCostumeId={char.default_costume_id} onDefaultChange={(cid) => void setDefaultCostume(cid)} />
      )}
      {tab === 'media' && <MediaTab characterId={char.id} />}
    </div>
  );
}

// Trường chữ sửa được, theo thứ tự hiển thị. `order` không có ở đây: sắp xếp
// bằng kéo-thả ở trang Characters để số luôn đủ 3 chữ số và không trùng.
const URL_FIELDS: { k: keyof Character; label: string }[] = [
  { k: 'base_model_url', label: 'URL model VRM (base_model_url)' },
  { k: 'thumbnail_url', label: 'Thumbnail' },
  { k: 'small_thumb_url', label: 'Thumbnail nhỏ' },
  { k: 'avatar', label: 'Avatar' },
  { k: 'small_avatar', label: 'Avatar nhỏ' },
  { k: 'video_url', label: 'Video' },
  { k: 'agent_elevenlabs_id', label: 'ElevenLabs agent id (gọi thoại)' },
];

type Draft = Record<string, string | boolean>;

function toDraft(c: Character): Draft {
  const d: Draft = {
    name: c.name,
    description: c.description ?? '',
    instruction: c.instruction ?? '',
    tier: c.tier === 'free' ? 'free' : 'pro',
    price_ruby: String(c.price_ruby ?? 0),
    price_vcoin: String(c.price_vcoin ?? 0),
    is_public: !!c.is_public,
    available: !!c.available,
  };
  for (const f of URL_FIELDS) d[f.k] = (c[f.k] as string | null) ?? '';
  return d;
}

function DetailsTab({ char, onSaved }: { char: Character; onSaved: (c: Character) => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(char));
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [bgId, setBgId] = useState<string | null>(char.background_default_id);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [showVrm, setShowVrm] = useState(false);

  useEffect(() => setDraft(toDraft(char)), [char]);
  useEffect(() => {
    supabase.from('backgrounds').select('*').order('name').then(({ data }) => setBackgrounds((data ?? []) as Background[]));
  }, []);

  const set = (k: string, v: string | boolean) => setDraft((d) => ({ ...d, [k]: v }));
  const str = (k: string) => String(draft[k] ?? '');

  async function save() {
    setErr('');
    if (!str('name').trim()) return setErr('Tên không được trống.');
    const pr = parsePrice(str('price_ruby'));
    const pv = parsePrice(str('price_vcoin'));
    if (pr === null || pv === null) return setErr('Giá phải là số nguyên ≥ 0.');

    const next: Record<string, unknown> = {
      name: str('name').trim(),
      description: nullIfBlank(str('description')),
      instruction: nullIfBlank(str('instruction')),
      tier: str('tier'),
      price_ruby: pr,
      price_vcoin: pv,
      is_public: draft.is_public,
      available: draft.available,
      background_default_id: bgId,
    };
    for (const f of URL_FIELDS) next[f.k] = nullIfBlank(str(f.k).trim());

    // Chỉ ghi trường đổi thật — khỏi đè cột mà người khác vừa sửa ở chỗ khác.
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) if (v !== (char as Record<string, unknown>)[k]) patch[k] = v;
    if (Object.keys(patch).length === 0) return;

    setBusy(true);
    try {
      await updateOne('characters', char.id, patch);
      onSaved({ ...char, ...patch } as Character);
      setSavedAt(new Date());
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(false);
  }

  const model = str('base_model_url').trim();
  const modelIsPng = /\.png($|\?)/i.test(model);
  const reasons = [
    !draft.is_public && 'is_public tắt',
    !draft.available && 'available tắt',
    !model && 'thiếu model',
    modelIsPng && 'model là ảnh .png',
  ].filter(Boolean) as string[];
  const bg = backgrounds.find((b) => b.id === bgId);
  const bgThumb = bg ? mediaUrl(bg.thumbnail ?? bg.image) : null;

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Thông tin</h3>
          {reasons.length === 0
            ? <span className="flag" style={{ background: 'rgba(74,222,128,0.18)', color: 'var(--ok)' }}>📱 Đang hiện trong app</span>
            : <span className="flag muted">🚫 Không hiện: {reasons.join(', ')}</span>}
          {savedAt && <span className="muted small" style={{ color: 'var(--ok)' }}>✓ đã lưu {savedAt.toLocaleTimeString()}</span>}
          <button className="primary" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
        {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}

        <div className="row" style={{ marginTop: 12 }}>
          <label className="grow"><span>Tên (gốc)</span><input value={str('name')} onChange={(e) => set('name', e.target.value)} /></label>
          <label>
            <span>Tier</span>
            <select value={str('tier')} onChange={(e) => set('tier', e.target.value)}>
              <option value="free">free</option>
              <option value="pro">pro</option>
            </select>
          </label>
          <label><span>Giá 💎</span><input value={str('price_ruby')} inputMode="numeric" onChange={(e) => set('price_ruby', e.target.value)} style={{ width: 90 }} /></label>
          <label><span>Giá vcoin</span><input value={str('price_vcoin')} inputMode="numeric" onChange={(e) => set('price_vcoin', e.target.value)} style={{ width: 90 }} /></label>
        </div>
        <div className="row">
          <label className="checkbox"><input type="checkbox" checked={!!draft.is_public} onChange={(e) => set('is_public', e.target.checked)} /><span>is_public</span></label>
          <label className="checkbox"><input type="checkbox" checked={!!draft.available} onChange={(e) => set('available', e.target.checked)} /><span>available</span></label>
        </div>

        <label>
          <span>Mô tả gốc (tiếng Anh — nguồn cho “Dịch tự động”)</span>
          <textarea rows={3} value={str('description')} onChange={(e) => set('description', e.target.value)} />
        </label>
        <label>
          <span>Instruction (system prompt cho chat)</span>
          <textarea rows={8} value={str('instruction')} onChange={(e) => set('instruction', e.target.value)} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {URL_FIELDS.map((f) => (
            <label key={f.k}>
              <span>{f.label}</span>
              <input value={str(f.k)} onChange={(e) => set(f.k, e.target.value)} />
            </label>
          ))}
        </div>

        <div className="row" style={{ alignItems: 'center', marginTop: 8 }}>
          {bgThumb ? <img src={bgThumb} alt="" style={{ width: 40, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} /> : <div className="avatar-empty" style={{ width: 40, height: 60, borderRadius: 6 }} />}
          <button className="ghost small" onClick={() => setPicking(true)}>🖼 Nền mặc định: {bg?.name ?? '— chưa đặt —'}</button>
          <button className="ghost small" disabled={!model || modelIsPng} onClick={() => setShowVrm((v) => !v)}>🧍 {showVrm ? 'Ẩn' : 'Xem'} model VRM</button>
        </div>
        {showVrm && model && !modelIsPng && <VrmPreview url={mediaUrl(model)} height={460} />}
      </div>

      <TranslationsCard characterId={char.id} baseName={char.name} />

      {picking && <BackgroundPicker value={bgId} backgrounds={backgrounds} onPick={setBgId} onClose={() => setPicking(false)} />}
    </div>
  );
}
