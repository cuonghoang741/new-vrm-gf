import { createClient } from '@supabase/supabase-js';

// TrueFeel / new-vrm Supabase (KHÁC project Yuuki). Anon key public — an toàn.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://kwqqmjfsrgoczbutuisx.supabase.co';
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cXFtamZzcmdvY3pidXR1aXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODI0MjcsImV4cCI6MjA4NzU1ODQyN30.SpEyZ4PPiq6JMpDJcZ-NVJSxNM6ORHp7ZJ9Bog3X9Tk';

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// new-vrm lưu URL media/asset dưới dạng URL TUYỆT ĐỐI (nhiều nguồn: roxie/evee/
// lusty/CloudFront/cloudfly), KHÔNG theo mẫu `<base>/<bucket>/<path>` như Yuuki.
// Nên chỉ dùng thẳng, không ghép base. Rỗng → null.
export function mediaUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return u;
}
