import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Protected() {
  const { session, isAdmin, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/login" replace />;
  return <Outlet />;
}
