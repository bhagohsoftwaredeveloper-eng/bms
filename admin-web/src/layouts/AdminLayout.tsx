import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../lib/auth-store';
import { logout as apiLogout } from '../lib/api';
import { ThemeToggle } from '../components/ThemeToggle';
import { NotificationBell } from '../components/NotificationBell';
import { useServerEvents } from '../lib/useServerEvents';
import { useNotificationStore } from '../lib/notification-store';
import type { UserRole } from '../lib/types';
import {
  LayoutDashboard,
  Users,
  FolderGit2,
  FileCode,
  FileImage,
  Package,
  Key,
  Layers,
  Wrench,
  DollarSign,
  CreditCard,
  BarChart3,
  Settings,
  ClipboardList,
  Droplets,
  UserCog,
  LogOut,
  Zap,
  type LucideIcon,
} from 'lucide-react';

type NavLinkItem = { to: string; label: string; end?: boolean; indent?: boolean };
type NavSection = { section: true; label: string };
type NavItem = NavLinkItem | NavSection;

const NAV_ICONS: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/clients': Users,
  '/dev-projects': FolderGit2,
  '/job-orders/software': FileCode,
  '/job-orders/design': FileImage,
  '/products': Package,
  '/licenses': Key,
  '/design-jobs': Layers,
  '/jobs': Wrench,
  '/earnings': DollarSign,
  '/withdrawals': CreditCard,
  '/analytics': BarChart3,
  '/settings': Settings,
  '/audit-logs': ClipboardList,
  '/ink-tracking': Droplets,
  '/profile': UserCog,
};

const NAV_ITEMS_BY_ROLE: Record<UserRole, NavItem[]> = {
  SUPER_ADMIN: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/clients', label: 'Clients' },
    { section: true, label: 'Dev' },
    { to: '/job-orders/software', label: 'Software JO', indent: true },
    { to: '/dev-projects', label: 'Dev Projects', indent: true },
    { to: '/products', label: 'Software Products', indent: true },
    { to: '/licenses', label: 'Licenses', indent: true },
    { section: true, label: 'Design' },
    { to: '/job-orders/design', label: 'Design JO', indent: true },
    { to: '/design-jobs', label: 'Design Projects', indent: true },
    { section: true, label: 'Operations' },
    { to: '/jobs', label: 'Installations', indent: true },
    { to: '/earnings', label: 'Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
    { to: '/analytics', label: 'Analytics' },
    { to: '/settings', label: 'Settings' },
  ],
  INSTALLER: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/jobs', label: 'My Jobs' },
    { to: '/earnings', label: 'My Earnings' },
    { to: '/withdrawals', label: 'Withdrawals' },
  ],
  DEVELOPER: [
    { to: '/', label: 'Dashboard', end: true },
    { section: true, label: 'Dev' },
    { to: '/dev-projects', label: 'Dev Projects', indent: true },
    { to: '/licenses', label: 'Licenses', indent: true },
    { section: true, label: 'Payroll' },
    { to: '/earnings', label: 'My Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
  ],
  DESIGNER: [
    { to: '/', label: 'Dashboard', end: true },
    { section: true, label: 'Design' },
    { to: '/design-jobs', label: 'Design Projects', indent: true },
    { to: '/job-orders/design', label: 'Design JO', indent: true },
    { section: true, label: 'Payroll' },
    { to: '/earnings', label: 'My Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
  ],
  MACHINE_OPERATOR: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/jobs', label: 'Operations' },
    { to: '/ink-tracking', label: 'Ink Tracking' },
    { section: true, label: 'Design' },
    { to: '/design-jobs', label: 'Design Projects', indent: true },
    { to: '/job-orders/design', label: 'Design JO', indent: true },
    { section: true, label: 'Payroll' },
    { to: '/earnings', label: 'My Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
  ],
  LIAISON: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/clients', label: 'Clients' },
    { section: true, label: 'Job Orders' },
    { to: '/job-orders/software', label: 'Software JO', indent: true },
    { to: '/job-orders/design', label: 'Design JO', indent: true },
    { to: '/jobs', label: 'Installations' },
    { section: true, label: 'Payroll' },
    { to: '/earnings', label: 'My Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
  ],
  ADMIN_STAFF: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/clients', label: 'Clients' },
    { section: true, label: 'Dev' },
    { to: '/job-orders/software', label: 'Software JO', indent: true },
    { to: '/dev-projects', label: 'Dev Projects', indent: true },
    { to: '/products', label: 'Software Products', indent: true },
    { section: true, label: 'Design' },
    { to: '/job-orders/design', label: 'Design JO', indent: true },
    { to: '/design-jobs', label: 'Design Projects', indent: true },
    { section: true, label: 'Operations' },
    { to: '/jobs', label: 'Installations', indent: true },
    { to: '/earnings', label: 'Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
    { to: '/audit-logs', label: 'Audit Logs' },
  ],
  SALES_STAFF: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/clients', label: 'Clients' },
    { section: true, label: 'Job Orders' },
    { to: '/job-orders/software', label: 'Software JO', indent: true },
    { to: '/job-orders/design', label: 'Design JO', indent: true },
    { to: '/jobs', label: 'Installations' },
    { section: true, label: 'Payroll' },
    { to: '/earnings', label: 'My Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
  ],
};

const PORTAL_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'SDLMP Admin',
  INSTALLER: 'SDLMP Installer',
  DEVELOPER: 'SDLMP Developer',
  DESIGNER: 'SDLMP Designer',
  MACHINE_OPERATOR: 'SDLMP Operator',
  LIAISON: 'SDLMP Liaison',
  ADMIN_STAFF: 'SDLMP Staff',
  SALES_STAFF: 'SDLMP Sales',
};

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Admin',
  INSTALLER: 'Installer',
  DEVELOPER: 'Developer',
  DESIGNER: 'Designer',
  MACHINE_OPERATOR: 'Operator',
  LIAISON: 'Liaison',
  ADMIN_STAFF: 'Staff',
  SALES_STAFF: 'Sales',
};

function buildMergedNav(primaryRole: UserRole, allRoles: UserRole[]): NavItem[] {
  const primaryNav = NAV_ITEMS_BY_ROLE[primaryRole] ?? [];
  const seenPaths = new Set(
    primaryNav.filter((item): item is NavLinkItem => 'to' in item).map((item) => item.to),
  );
  const result: NavItem[] = [...primaryNav];

  for (const role of allRoles) {
    if (role === primaryRole) continue;
    const roleNav = NAV_ITEMS_BY_ROLE[role] ?? [];
    const uniqueLinks = roleNav.filter(
      (item): item is NavLinkItem => 'to' in item && !seenPaths.has(item.to),
    );
    if (uniqueLinks.length > 0) {
      result.push({ section: true, label: ROLE_LABEL[role] });
      for (const link of uniqueLinks) {
        seenPaths.add(link.to);
        result.push({ ...link, indent: true });
      }
    }
  }
  return result;
}

function getInitials(name: string | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/* ── Sidebar nav link with hover state and update badge ── */
function SidebarLink({ item, hasUpdate }: { item: NavLinkItem; hasUpdate: boolean }) {
  const [hovered, setHovered] = useState(false);
  const Icon = NAV_ICONS[item.to];
  const markRouteRead = useNotificationStore((s) => s.markRouteRead);
  const { pathname } = useLocation();

  const isActive = item.end
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(item.to + '/');

  useEffect(() => {
    if (isActive && hasUpdate) markRouteRead(item.to);
  }, [isActive, hasUpdate, item.to, markRouteRead]);

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.55rem 0.75rem',
        paddingLeft: item.indent ? '1rem' : '0.75rem',
        borderRadius: 9,
        textDecoration: 'none',
        fontSize: '0.875rem',
        fontWeight: isActive ? 600 : 500,
        color: isActive ? '#ffffff' : hovered ? '#c8d4e8' : '#8fa3bf',
        background: isActive
          ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
          : hovered
          ? 'rgba(255, 255, 255, 0.055)'
          : 'transparent',
        boxShadow: isActive ? '0 4px 14px rgba(79, 70, 229, 0.45)' : 'none',
        transition: 'all 0.15s ease',
        letterSpacing: '0.01em',
      }}
    >
      {Icon && (
        <Icon
          size={15}
          style={{ flexShrink: 0, opacity: 0.85 }}
          strokeWidth={2}
        />
      )}
      <span style={{ flex: 1 }}>{item.label}</span>
      {hasUpdate && !isActive && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#ef4444',
            flexShrink: 0,
            boxShadow: '0 0 0 2px rgba(239, 68, 68, 0.3)',
          }}
        />
      )}
    </NavLink>
  );
}

export function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const allRoles = user?.roles ?? (user?.role ? [user.role] : []);
  const navItems: NavItem[] = user ? buildMergedNav(user.role, allRoles) : [];
  const unreadRoutes = useNotificationStore((s) => s.unreadRoutes);

  const [logoutHovered, setLogoutHovered] = useState(false);

  useServerEvents();

  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch {
      // ignore network errors on logout — clear local session regardless
    }
    clear();
    navigate('/login', { replace: true });
  };

  const SIDEBAR_WIDTH = 256;

  return (
    <div style={{ display: 'flex' }}>
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: SIDEBAR_WIDTH,
          background: '#060c18',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          height: '100vh',
          overflow: 'hidden',
          overflowY: 'auto',
          zIndex: 100,
        }}
      >
        {/* Brand */}
        <div
          style={{
            padding: '1.375rem 1.125rem 1.25rem',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.5)',
            }}
          >
            <Zap size={17} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: '0.9rem',
                color: '#f0f4ff',
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
              }}
            >
              {user ? PORTAL_LABEL[user.role] : 'SDLMP'}
            </div>
            <div
              style={{
                fontSize: '0.65rem',
                color: '#4a6080',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              Admin Portal
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav
          style={{
            flex: 1,
            padding: '0.875rem 0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.1rem',
          }}
        >
          {navItems.map((item, i) => {
            if ('section' in item) {
              return (
                <div
                  key={`section-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.65rem 0.5rem 0.3rem',
                    marginTop: i === 0 ? 0 : '0.3rem',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.63rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: '#3a5070',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.label}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: 'rgba(255,255,255,0.05)',
                    }}
                  />
                </div>
              );
            }
            return (
                <SidebarLink
                  key={item.to}
                  item={item}
                  hasUpdate={unreadRoutes.includes(item.to)}
                />
              );
          })}
        </nav>

        {/* User section */}
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '0.875rem 0.75rem',
          }}
        >
          {/* Avatar + name */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              marginBottom: '0.625rem',
              padding: '0 0.25rem',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.75rem',
                color: '#fff',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.4)',
                letterSpacing: '0.02em',
              }}
            >
              {getInitials(user?.fullName)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#dce8f8',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.3,
                }}
              >
                {user?.fullName}
              </div>
              <div
                style={{
                  fontSize: '0.69rem',
                  color: '#3a5070',
                  letterSpacing: '0.02em',
                }}
              >
                {user?.role.replace(/_/g, ' ')}
              </div>
            </div>
          </div>

          {/* Profile link */}
          <NavLink
            to="/profile"
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.48rem 0.75rem',
              borderRadius: 8,
              textDecoration: 'none',
              color: isActive ? '#ffffff' : '#8fa3bf',
              background: isActive
                ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                : 'transparent',
              fontSize: '0.82rem',
              fontWeight: 500,
              marginBottom: '0.375rem',
              transition: 'all 0.15s ease',
              boxShadow: isActive ? '0 4px 14px rgba(79,70,229,0.4)' : 'none',
            })}
          >
            <UserCog size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span>Profile Settings</span>
          </NavLink>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            onMouseEnter={() => setLogoutHovered(true)}
            onMouseLeave={() => setLogoutHovered(false)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.48rem 0.75rem',
              borderRadius: 8,
              border: `1px solid ${logoutHovered ? 'rgba(248,113,113,0.45)' : 'rgba(248,113,113,0.2)'}`,
              background: logoutHovered ? 'rgba(248,113,113,0.12)' : 'rgba(248,113,113,0.06)',
              color: '#f87171',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontFamily: 'inherit',
            }}
          >
            <LogOut size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <div
        style={{
          marginLeft: SIDEBAR_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          width: `calc(100% - ${SIDEBAR_WIDTH}px)`,
          minHeight: '100vh',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '0.875rem 2.25rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            gap: '1rem',
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 50,
            boxShadow: '0 1px 0 var(--border)',
          }}
        >
          <NotificationBell />
          <ThemeToggle />
        </header>

        <main
          style={{
            flex: 1,
            padding: '2rem 2.5rem',
            width: '100%',
            overflow: 'auto',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
