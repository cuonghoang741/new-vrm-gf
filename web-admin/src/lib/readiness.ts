/**
 * Why a character must not be shown in the app yet (empty = ready).
 *
 * tools/vroid/import_characters.py writes characters hidden, with a
 * placeholder persona marked "[TODO" and no tagline. The chat and
 * touch-reaction functions send `instruction` to the model as is, so a
 * character published in that state talks from the placeholder.
 */
export function publishBlockers(c: { instruction: string | null; description: string | null }): string[] {
  const out: string[] = [];
  if ((c.instruction ?? '').includes('[TODO')) out.push('persona vẫn là bản nháp [TODO] — viết Instruction trước');
  if (!(c.description ?? '').trim()) out.push('chưa có tagline (Mô tả gốc)');
  return out;
}
