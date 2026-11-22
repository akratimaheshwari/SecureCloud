import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, FileText, Inbox, LayoutDashboard, LogOut, Menu, ScrollText, Send, ShieldAlert, ShieldCheck, Users, X, CheckSquare,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const WORKSPACE = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/files', label: 'My files', icon: FileText },
  { to: '/shares/mine', label: 'Shared by me', icon: Send },
  { to: '/shares/with-me', label: 'Shared with me', icon: Inbox },
  { to: '/activity', label: 'My activity', icon: Activity },
];
const ADMIN = [
  { to: '/admin', label: 'Overview', icon: ShieldCheck, end: true },
  { to: '/admin/approvals', label: 'Approvals', icon: CheckSquare },
  { to: '/admin/events', label: 'Security events', icon: ShieldAlert },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
  { to: '/admin/users', label: 'Users', icon: Users },
];

function NavGroup({ title, items, onNavigate }) {
  return (
    <div className="mb-6">
      <p className="mb-2 px-3 text-xs font-medium text-ink-300/70">{title}</p>
      <ul className="space-y-0.5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'border-brand-300 bg-ink-800 font-medium text-white'
                    : 'border-transparent text-ink-300 hover:bg-ink-800/60 hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sidebar({ onNavigate }) {
  const { isAdmin } = useAuth();
  return (
    <div className="flex h-full flex-col bg-ink-900 text-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <ShieldCheck className="h-6 w-6 text-brand-300" aria-hidden="true" />
        <span className="text-lg font-semibold tracking-tight">SecureCloud</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pt-2" aria-label="Main">
        <NavGroup title="Workspace" items={WORKSPACE} onNavigate={onNavigate} />
        {isAdmin && <NavGroup title="Administration" items={ADMIN} onNavigate={onNavigate} />}
      </nav>
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const initials = (user?.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const signOut = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"><Sidebar /></aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl"><Sidebar onNavigate={() => setOpen(false)} /></aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
        <button type="button" className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close menu' : 'Open menu'}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className="hidden lg:block" />
        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-slate-800">{user?.name}</p>
            <p className="text-xs text-slate-500">{user?.role === 'admin' ? 'Administrator' : user?.email}</p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white" aria-hidden="true">{initials}</span>
          <button type="button" onClick={signOut} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            <LogOut className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
