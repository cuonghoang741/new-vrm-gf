import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AuthState = {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState>({
  session: null,
  isAdmin: false,
  loading: true,
  signOut: async () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  // Quyền admin KÈM theo uid mà nó thuộc về. Trước đây isAdmin là một boolean
  // trơ: session về trước, profiles về sau, và trong khe hở đó isAdmin=false
  // làm Protected đá người dùng về /login kèm câu "not an admin" sai sự thật —
  // mỗi lần refresh trang lại nháy màn đăng nhập một nhịp. Giữ uid ở đây để
  // phân biệt được "CHƯA kiểm tra xong" với "kiểm tra rồi: không phải admin".
  const [admin, setAdmin] = useState<{ uid: string | null; isAdmin: boolean }>({
    uid: null,
    isAdmin: false,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Theo uid chứ không theo object session: token tự refresh mỗi giờ tạo ra
  // object session MỚI cho cùng một người — không có lý do gì hỏi lại quyền.
  const uid = session?.user.id ?? null;
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAdmin({ uid, isAdmin: data?.is_admin === true });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const isAdmin = uid != null && admin.uid === uid && admin.isAdmin;
  // Vẫn là "đang tải" khi session có rồi nhưng quyền admin CHƯA hỏi xong —
  // Protected nhờ vậy đứng yên ở màn Loading thay vì đá về /login rồi quay lại.
  const loading = sessionLoading || (uid != null && admin.uid !== uid);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <Ctx.Provider value={{ session, isAdmin, loading, signOut }}>{children}</Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
