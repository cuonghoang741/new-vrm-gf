import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

type NavItem = { to: string; icon: string; label: string; match: (path: string) => boolean };

// Same two-section sidebar as the Yuuki CMS. Musics / Settings are not here
// because TrueFeel has no tables behind them.
const CONTENT_LINKS: NavItem[] = [
  { to: '/', icon: '👥', label: 'Characters', match: (p) => p === '/' || p.startsWith('/characters') },
  { to: '/costumes', icon: '👗', label: 'Trang phục', match: (p) => p.startsWith('/costumes') },
  { to: '/backgrounds', icon: '🖼️', label: 'Backgrounds', match: (p) => p.startsWith('/backgrounds') },
  { to: '/medias', icon: '🖼', label: 'Media', match: (p) => p.startsWith('/medias') },
  { to: '/dances', icon: '💃', label: 'Điệu nhảy', match: (p) => p.startsWith('/dances') },
];

const SYSTEM_LINKS: NavItem[] = [
  { to: '/quests', icon: '🎯', label: 'Quests & Ruby', match: (p) => p.startsWith('/quests') },
  { to: '/economy', icon: '📅', label: 'Điểm danh', match: (p) => p.startsWith('/economy') },
  { to: '/privilege', icon: '🛡️', label: 'Privilege', match: (p) => p.startsWith('/privilege') },
  { to: '/remote-config', icon: '🎛️', label: 'Remote Config', match: (p) => p.startsWith('/remote-config') },
];

export default function Layout() {
  const { session, signOut } = useAuth();
  const loc = useLocation();

  const link = (l: NavItem) => (
    <Link key={l.to} to={l.to} className={l.match(loc.pathname) ? 'active' : ''}>
      <span className="nav-icon">{l.icon}</span>
      <span>{l.label}</span>
    </Link>
  );

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-dot" />
          <h1>TrueFeel</h1>
        </div>
        <nav>
          <div className="sidebar-section-label">Content</div>
          {CONTENT_LINKS.map(link)}
          <div className="sidebar-section-label">System</div>
          {SYSTEM_LINKS.map(link)}
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
