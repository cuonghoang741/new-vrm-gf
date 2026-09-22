// Tên + mô tả nhân vật theo 10 ngôn ngữ (bảng character_translates).
//
// App đọc bản dịch theo ngôn ngữ đang dùng; thiếu dòng nào thì rơi về cột gốc
// characters.name / description. Nên ô để trống ở đây = "dùng bản gốc", không
// phải lỗi — và lưu ô trống sẽ XOÁ dòng dịch đó thay vì ghi chuỗi rỗng (chuỗi
// rỗng làm app hiện mô tả trắng thay vì rơi về bản gốc).
//
// "Dịch tự động" gọi edge function translate-character (Gemini) cho đúng nhân
// vật này, dịch từ characters.description (tiếng Anh) sang 9 ngôn ngữ còn lại.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errMsg } from '../../lib/db';
import { fnErrorMessage } from '../../lib/fnError';
import type { Translation } from '../../lib/types';

// Cùng bộ 10 ngôn ngữ với app (src/i18n/resources.ts SUPPORTED).
const LANGS = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' },
  { code: 'ja', flag: '🇯🇵', label: '日本語' },
  { code: 'zh', flag: '🇨🇳', label: '中文' },
  { code: 'ko', flag: '🇰🇷', label: '한국어' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'pt', flag: '🇵🇹', label: 'Português' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
] as const;

type Entry = { name: string; description: string };
type State = Record<string, Entry>;

function toState(rows: Translation[]): State {
  const s: State = {};
  for (const l of LANGS) s[l.code] = { name: '', description: '' };
  for (const r of rows) s[r.language_code] = { name: r.name ?? '', description: r.description ?? '' };
  return s;
}

export function TranslationsCard({ characterId, baseName }: { characterId: string; baseName: string }) {
  const [saved, setSaved] = useState<State>(toState([]));
  const [draft, setDraft] = useState<State>(toState([]));
  const [lang, setLang] = useState<string>('en');
  const [busy, setBusy] = useState<'' | 'load' | 'save' | 'ai'>('load');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  async function load() {
    setBusy('load');
    const { data, error } = await supabase
      .from('character_translates')
      .select('language_code, name, description')
      .eq('character_id', characterId);
    if (error) setErr(error.message);
    const s = toState((data ?? []) as Translation[]);
    setSaved(s);
    setDraft(s);
    setBusy('');
  }
  useEffect(() => {
    void load();
  }, [characterId]);

  const dirty = LANGS.filter(
    (l) => draft[l.code].name !== saved[l.code].name || draft[l.code].description !== saved[l.code].description,
  ).map((l) => l.code);

  async function save() {
    setBusy('save');
    setErr('');
    try {
      const upserts = dirty
        .filter((c) => draft[c].name.trim() || draft[c].description.trim())
        .map((c) => ({
          character_id: characterId,
          language_code: c,
          name: draft[c].name.trim() || null,
          description: draft[c].description.trim() || null,
          updated_at: new Date().toISOString(),
        }));
      const cleared = dirty.filter((c) => !draft[c].name.trim() && !draft[c].description.trim());
      if (upserts.length) {
        const { data, error } = await supabase
          .from('character_translates')
          .upsert(upserts, { onConflict: 'character_id,language_code' })
          .select('id');
        if (error) throw new Error(error.message);
        if ((data?.length ?? 0) < upserts.length) throw new Error('Một số bản dịch không lưu được — tài khoản chưa có quyền admin?');
      }
      if (cleared.length) {
        const { error } = await supabase
          .from('character_translates')
          .delete()
          .eq('character_id', characterId)
          .in('language_code', cleared);
        if (error) throw new Error(error.message);
      }
      setNote(`✓ Đã lưu ${dirty.length} ngôn ngữ`);
      setTimeout(() => setNote(''), 2500);
      await load();
    } catch (e) {
      setErr(errMsg(e));
      setBusy('');
    }
  }

  async function autoTranslate() {
    if (dirty.length && !confirm('Có thay đổi chưa lưu — dịch tự động sẽ ghi đè cả 10 ngôn ngữ. Tiếp tục?')) return;
    setBusy('ai');
    setErr('');
    const { data, error } = await supabase.functions.invoke<{ error?: string; translated?: number }>('translate-character', {
      body: { character_id: characterId },
    });
    if (error) setErr(await fnErrorMessage(error));
    else if (data?.error) setErr(data.error);
    else {
      setNote('✓ Đã dịch tự động 10 ngôn ngữ từ description gốc');
      setTimeout(() => setNote(''), 3500);
    }
    await load();
  }

  const cur = draft[lang];
  const set = (k: keyof Entry, v: string) => setDraft((d) => ({ ...d, [lang]: { ...d[lang], [k]: v } }));

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Bản dịch (character_translates)</h3>
        {note && <span className="muted small" style={{ color: 'var(--ok)' }}>{note}</span>}
        <div className="actions" style={{ marginLeft: 'auto', marginTop: 0 }}>
          <button className="ghost small" disabled={busy !== ''} onClick={() => void autoTranslate()} title="Gemini dịch description gốc (tiếng Anh) sang 9 ngôn ngữ">
            {busy === 'ai' ? '⏳ Đang dịch…' : '✨ Dịch tự động'}
          </button>
          <button className="primary small" disabled={busy !== '' || dirty.length === 0} onClick={() => void save()}>
            {busy === 'save' ? 'Đang lưu…' : `Lưu bản dịch${dirty.length ? ` (${dirty.length})` : ''}`}
          </button>
        </div>
      </div>

      {err && <div className="error" style={{ margin: '10px 0' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
        {LANGS.map((l) => {
          const has = !!(saved[l.code].name || saved[l.code].description);
          return (
            <button
              key={l.code}
              className={lang === l.code ? 'primary small' : 'ghost small'}
              onClick={() => setLang(l.code)}
              title={has ? 'Đã có bản dịch' : 'Chưa có — app dùng bản gốc'}
              style={{ opacity: has || lang === l.code ? 1 : 0.6 }}
            >
              {l.flag} {l.code}{dirty.includes(l.code) ? ' •' : ''}
            </button>
          );
        })}
      </div>

      <label>
        <span>Tên ({lang}) — trống = dùng “{baseName}”</span>
        <input value={cur.name} onChange={(e) => set('name', e.target.value)} placeholder={baseName} />
      </label>
      <label>
        <span>Mô tả ({lang}) — trống = dùng description gốc</span>
        <textarea rows={4} value={cur.description} onChange={(e) => set('description', e.target.value)} />
      </label>
    </div>
  );
}
