// components/AppHeader.tsx - shared top bar for signed-in screens
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ShieldCheck } from 'lucide-react';

interface AppHeaderProps {
  user?: { email: string; isSeedUser?: boolean };
}

export default function AppHeader({ user }: AppHeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const navLink = (href: string, label: string) => {
    const active = router.pathname === href;
    return (
      <Link
        href={href}
        className={`rounded px-3 py-1.5 text-sm transition-colors ${
          active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b-2 border-brass-500 bg-gray-900 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded bg-blue-600">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-base font-semibold tracking-tight">AI Governance</span>
            <span className="block font-mono text-[11px] uppercase tracking-wider text-brass-300">
              EU AI Act · VAISS
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Main">
          {navLink('/dashboard', 'Dashboard')}
          {navLink('/assess', 'New assessment')}
          {user?.isSeedUser && navLink('/admin/users', 'Users')}
          {user?.isSeedUser && navLink('/admin/storage', 'Storage')}
        </nav>

        {user && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-300">{user.email}</span>
            <button
              onClick={handleLogout}
              className="rounded border border-white/20 px-3 py-1 text-gray-100 transition-colors hover:bg-white/10"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
