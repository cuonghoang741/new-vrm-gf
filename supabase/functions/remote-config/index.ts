// Edge function: remote-config (TrueFeel)
//
// Port nguyên từ CMS Yuuki. CMS gọi hàm này để ĐỌC / SỬA tham số Firebase Remote
// Config của project Firebase của TrueFeel (`truemate-e3401`). Private key của
// service account nằm HOÀN TOÀN server-side (secret `FIREBASE_SA_JSON`) — không
// bao giờ xuống client (CMS là SPA tĩnh, giữ key ở đó là lộ ngay). Chỉ admin
// (`profiles.is_admin`) gọi được.
//
// Body JSON:
//   { op: "list" }                              → { params:[...], etag }
//   { op: "set", changes: { "<key>": "<value>" } } → cập nhật defaultValue.value
//                                                    của các key ĐANG CÓ rồi publish,
//                                                    trả lại danh sách mới.
//
// Key mới tạo trên Firebase console; hàm này chỉ sửa key đã có — CMS không nên
// là nơi đặt ra hợp đồng giữa app và server.
//
// Remote Config REST: GET/PUT .../projects/<id>/remoteConfig, PUT cần If-Match
// = ETag của bản đang có (hoặc "*" để ép ghi đè).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SA_JSON = Deno.env.get('FIREBASE_SA_JSON') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ── JWT RS256 bằng Web Crypto (Deno) → OAuth token cho scope remoteconfig ────
const SCOPE = 'https://www.googleapis.com/auth/firebase.remoteconfig';

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

interface SA {
  client_email: string;
  private_key: string;
  token_uri: string;
  project_id: string;
}

async function mintToken(sa: SA): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat: now, exp: now + 3600 };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)),
  );
  const assertion = `${signingInput}.${b64url(sig)}`;
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`token exchange failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token as string;
}

function rcBase(sa: SA): string {
  return `https://firebaseremoteconfig.googleapis.com/v1/projects/${sa.project_id}/remoteConfig`;
}

async function getConfig(sa: SA, tok: string): Promise<{ cfg: Record<string, unknown>; etag: string }> {
  const r = await fetch(rcBase(sa), { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error(`get remoteConfig ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const etag = r.headers.get('etag') || '*';
  const cfg = await r.json();
  return { cfg, etag };
}

async function putConfig(
  sa: SA,
  tok: string,
  cfg: Record<string, unknown>,
  etag: string,
): Promise<string> {
  const r = await fetch(rcBase(sa), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'If-Match': etag,
    },
    body: JSON.stringify(cfg),
  });
  if (!r.ok) throw new Error(`publish ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.headers.get('etag') || etag;
}

// Rút danh sách param gọn cho CMS.
function shapeParams(cfg: Record<string, unknown>): Array<Record<string, unknown>> {
  const params = (cfg.parameters ?? {}) as Record<string, {
    defaultValue?: { value?: string; useInAppDefault?: boolean };
    valueType?: string;
    description?: string;
    conditionalValues?: Record<string, unknown>;
  }>;
  return Object.entries(params).map(([key, v]) => {
    const dv = v.defaultValue ?? {};
    return {
      key,
      value: dv.value ?? null,
      useInAppDefault: dv.useInAppDefault === true,
      valueType: v.valueType ?? 'STRING',
      description: v.description ?? '',
      conditional: Object.keys(v.conditionalValues ?? {}),
    };
  }).sort((a, b) => (a.key as string).localeCompare(b.key as string));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // ── Admin gate ────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'unauthorized' }, 401);
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await asUser.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ error: 'unauthorized' }, 401);
    const db = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: prof } = await db.from('profiles').select('is_admin').eq('id', uid).maybeSingle();
    if (prof?.is_admin !== true) return json({ error: 'forbidden' }, 403);

    // Sau khi đã chắc là admin — người lạ không được biết cả chuyện secret có
    // hay chưa (bản Yuuki báo điều này trước khi kiểm quyền).
    if (!SA_JSON) return json({ error: 'FIREBASE_SA_JSON chưa được đặt trong function secrets' }, 503);

    let sa: SA;
    try {
      sa = JSON.parse(SA_JSON) as SA;
    } catch {
      return json({ error: 'FIREBASE_SA_JSON không phải JSON hợp lệ' }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as { op?: string; changes?: Record<string, string> };
    const op = body.op ?? 'list';
    const tok = await mintToken(sa);

    if (op === 'list') {
      const { cfg, etag } = await getConfig(sa, tok);
      return json({ params: shapeParams(cfg), etag, projectId: sa.project_id });
    }

    if (op === 'set') {
      const changes = body.changes ?? {};
      if (!changes || Object.keys(changes).length === 0) {
        return json({ error: 'changes rỗng' }, 400);
      }
      const { cfg, etag } = await getConfig(sa, tok);
      const params = (cfg.parameters ?? {}) as Record<string, { defaultValue?: Record<string, unknown> }>;
      const applied: string[] = [];
      const skipped: string[] = [];
      for (const [key, value] of Object.entries(changes)) {
        if (!params[key]) { skipped.push(key); continue; } // chỉ sửa key ĐANG CÓ
        params[key].defaultValue = { value: String(value) };
        applied.push(key);
      }
      if (applied.length === 0) {
        return json({ error: `Không key nào tồn tại để sửa (skipped: ${skipped.join(', ')})` }, 400);
      }
      const newEtag = await putConfig(sa, tok, cfg, etag);
      // Đọc lại để trả trạng thái chuẩn sau publish.
      const after = await getConfig(sa, tok);
      return json({ params: shapeParams(after.cfg), etag: after.etag, applied, skipped, newEtag });
    }

    return json({ error: `op không hợp lệ: ${op}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});
