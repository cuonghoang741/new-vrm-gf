// Đọc lý do thật khi một Edge Function trả về non-2xx.
//
// `supabase.functions.invoke` nuốt thân phản hồi: mọi lỗi 4xx/5xx đều thành
// đúng một câu "Edge Function returned a non-2xx status code". Trên màn tạo ảnh
// hàng loạt điều đó nghĩa là 95 dòng lỗi giống hệt nhau, không nói được gì —
// trong khi hàm edge ĐÃ trả `{ error: "OpenRouter 402: Insufficient credits…" }`
// ngay trong thân phản hồi. `error.context` chính là `Response` đó, đọc ra là có.
//
// Ngoài việc hiện chữ cho người dùng, phân loại lỗi còn quyết định có thử lại
// hay không: hết hạn mức tốc độ thì chờ rồi thử lại có ích, còn hết tiền hoặc
// sai khoá thì thử lại 3 lần × 95 ảnh chỉ tốn thời gian.

/** Moi `{ error }` trong thân phản hồi non-2xx ra; không có thì trả message thô. */
export async function fnErrorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (ctx?.json) {
    try {
      const body = (await ctx.json()) as { error?: string; detail?: string };
      const msg = body?.error ?? body?.detail;
      if (msg) return msg;
    } catch { /* không phải JSON — rơi xuống dưới */ }
  }
  return error instanceof Error ? error.message : String(error);
}

/** Hết hạn mức tốc độ: chờ rồi thử lại thì được. */
export function isRateLimited(msg: string): boolean {
  return /\b429\b|RESOURCE_EXHAUSTED|exhausted|rate.?limit|too many requests/i.test(msg);
}

/** Hỏng ở mức tài khoản: thử lại vô ích, phải dừng cả mẻ và báo người dùng. */
export function isFatalAccountError(msg: string): boolean {
  return /\b40[123]\b|insufficient credit|insufficient_quota|quota exceeded|billing|payment required|invalid api key|unauthorized/i
    .test(msg);
}

/** Câu giải thích ngắn cho người quản trị, kèm việc cần làm. */
export function friendlyFnError(msg: string): string {
  if (/insufficient credit|payment required|\b402\b/i.test(msg)) {
    return `Tài khoản OpenRouter hết tiền — nạp tại openrouter.ai/settings/credits rồi chạy lại. (${msg.slice(0, 140)})`;
  }
  if (/invalid api key|\b401\b|unauthorized/i.test(msg)) {
    return `Khoá OPENROUTER_API_KEY sai hoặc đã bị thu hồi — đặt lại secret cho project. (${msg.slice(0, 140)})`;
  }
  if (/IMAGE_SAFETY|safety|blocked/i.test(msg)) {
    return `Bị chặn nội dung — sửa prompt cho nhẹ bớt. (${msg.slice(0, 140)})`;
  }
  if (isRateLimited(msg)) {
    return `Hết hạn mức, đã thử lại 3 lần. Chạy lại sau ít phút. (${msg.slice(0, 140)})`;
  }
  return msg.slice(0, 220);
}
