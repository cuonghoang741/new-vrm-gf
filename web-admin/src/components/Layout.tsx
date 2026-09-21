import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

type NavItem = { to: string; icon: string; label: string; match: (path: string) => boolean };

const LINKS: NavItem[] = [
  { to: '/', icon: '👥', label: 'Characters', match: (p) => p === '/' || p.startsWith('/characters') },
  { to: '/costumes', icon: '👗', label: 'Costumes', match: (p) => p.startsWith('/costumes') },
  { to: '/backgrounds', icon: '🖼️', label: 'Backgrounds', match: (p) => p.startsWith('/backgrounds') },
  { to: '/medias', icon: '🖼', label: 'Medias', match: (p) => p.startsWith('/medias') },
];

export default function Layout() {
  const { session, signOut } = useAuth();
  const loc = useLocation();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-dot" />
          <h1>TrueFeel</h1>
        </div>
        <nav>
          <div className="sidebar-section-label">Content</div>
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className={l.match(loc.pathname) ? 'active' : ''}>
              <span className="nav-icon">{l.icon}</span>
              <span>{l.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user">👤 {session?.user.email}</div>
          <button className="ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
