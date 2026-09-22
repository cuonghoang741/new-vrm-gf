// Kiểu mở khoá của background / trang phục / điệu nhảy (cột unlock_type)
// và mốc level mở khoá (cột unlock_at_level).
//
//   default — miễn phí cho mọi người
//   ads     — xem 1 quảng cáo, mở vĩnh viễn (PRO: miễn phí)
//   ruby    — mua bằng ruby, KHÔNG cần PRO (cần Giá 💎 > 0)
//   pro     — chỉ PRO; nếu Giá 💎 > 0 thì phải có PRO rồi mới mua bằng ruby
//
// Cột `tier` do trigger `sync_tier` suy ra: `pro` → tier pro, còn lại → free.
// Trước đây trigger ép cả `ruby` thành tier pro, nên item "mua bằng ruby" hiện
// trong app là *vừa cần PRO vừa cần ruby*. Đã sửa ở migration
// 20260923030000 — và vì thế CMS KHÔNG gửi kèm `tier` nữa: gửi kèm là ghi đè
// trigger và lỗi cũ quay lại.
//
// `unlock_at_level` là mốc thân thiết với nhân vật (1 = không khoá). Nó nằm
// TRƯỚC mọi điều kiện khác: chưa đủ level thì dù có PRO hay đủ ruby cũng chưa
// dùng được, app hiện luôn cả hai điều kiện trên thẻ item.

export type UnlockType = 'default' | 'ads' | 'pro' | 'ruby';

export const UNLOCK_TYPES: { id: UnlockType; label: string; hint: string }[] = [
  { id: 'default', label: '🆓 Mặc định', hint: 'Miễn phí cho mọi người' },
  { id: 'ads', label: '▶️ Xem ads', hint: 'Xem 1 quảng cáo, mở vĩnh viễn. PRO: miễn phí.' },
  { id: 'ruby', label: '💎 Ruby', hint: 'Mua bằng ruby, không cần PRO. Cần Giá 💎 > 0.' },
  { id: 'pro', label: '👑 PRO', hint: 'Chỉ PRO. Nếu có Giá 💎 > 0 thì PRO rồi vẫn phải mua bằng ruby.' },
];

/** 1 = không khoá theo level; 2..5 = cần thân thiết tới mốc đó. */
export const LEVELS = [1, 2, 3, 4, 5] as const;

export function asUnlock(v: unknown): UnlockType {
  return v === 'default' || v === 'ads' || v === 'pro' || v === 'ruby' ? v : 'ads';
}

export function asLevel(v: unknown): number {
  const n = Number(v ?? 1);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : 1;
}

/** Lỗi cấu hình dễ gặp — trả về chuỗi để hiện, hoặc null. */
export function unlockProblem(type: UnlockType, price: number | null): string | null {
  if (type === 'ruby' && !(price && price > 0)) return 'Kiểu "Ruby" cần Giá 💎 > 0, nếu không app không bán được.';
  if (type === 'ads' && price && price > 0) return 'Kiểu "Xem ads" không nên có giá — app chỉ hỏi xem quảng cáo, số ruby sẽ bị bỏ qua.';
  return null;
}
