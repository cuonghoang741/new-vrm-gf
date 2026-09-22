import { supabase } from './supabase';

/**
 * Writes that REPORT whether they actually changed anything.
 *
 * PostgREST answers an update/delete that row-level security refuses with
 * success and zero rows — no error. The first version of this CMS took that
 * as "saved", updated its local state, and showed a green tick while the
 * database stayed untouched. Every write here asks for the affected ids back
 * and throws when the count is not what the caller expected, so a refused
 * write surfaces as an error instead of a fake success.
 */

export class WriteRefused extends Error {}

function refused(table: string, op: string): WriteRefused {
  return new WriteRefused(
    `Không ${op} được bảng "${table}" — không dòng nào thay đổi. ` +
      `Thường là do tài khoản chưa có quyền admin (profiles.is_admin).`,
  );
}

/** Update rows matching `match`; throws unless at least `min` rows changed. */
export async function updateWhere(
  table: string,
  patch: Record<string, unknown>,
  match: Record<string, unknown>,
  min = 1,
): Promise<number> {
  let q = supabase.from(table).update(patch);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v as string);
  const { data, error } = await q.select('id');
  if (error) throw new Error(error.message);
  const n = data?.length ?? 0;
  if (n < min) throw refused(table, 'sửa');
  return n;
}

/** Update exactly one row by id. */
export function updateOne(table: string, id: string, patch: Record<string, unknown>) {
  return updateWhere(table, patch, { id });
}

/**
 * Update every row whose id is in `ids`; throws unless all of them changed.
 *
 * Chunked: the id list travels in the URL (`id=in.(…)`), and 317 uuids is
 * ~12 KB — past what gateways reliably accept for a request line.
 */
export async function updateIds(table: string, ids: string[], patch: Record<string, unknown>) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabase.from(table).update(patch).in('id', chunk).select('id');
    if (error) throw new Error(error.message);
    n += data?.length ?? 0;
  }
  if (n < ids.length) throw refused(table, 'sửa');
  return n;
}

/** Insert one row and return it. */
export async function insertOne<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.from(table).insert(row).select('*').single();
  if (error) throw new Error(error.message);
  if (!data) throw refused(table, 'thêm');
  return data as T;
}

/** Delete exactly one row by id. */
export async function deleteOne(table: string, id: string) {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) < 1) throw refused(table, 'xoá');
}

/**
 * Read a whole table in pages. PostgREST caps a single response (1000 rows by
 * default, and the old Medias page asked for only 300 while the table had
 * 317 — the last 17 simply never appeared).
 */
export async function selectAll<T>(
  table: string,
  columns = '*',
  order?: { column: string; ascending?: boolean },
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    let q = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

/**
 * Parse a price the admin typed. Returns null for anything that is not a
 * whole number >= 0 — the old pages used `Number(v) || 0`, which turned a typo
 * like "1o0" or an empty box into a price of 0 and made the item free.
 */
export function parsePrice(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

/** "" -> null for optional text/uuid columns, so clearing a field stores NULL. */
export function nullIfBlank(v: unknown): unknown {
  return typeof v === 'string' && v.trim() === '' ? null : v;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
