import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Lock, ScanSearch, ShieldCheck, Share2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import { errorMessage } from '../utils/errors';
import { safeNext } from '../utils/format';

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-ink-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-7 w-7 text-brand-300" aria-hidden="true" />
          <span className="text-xl font-semibold tracking-tight">SecureCloud</span>
        </div>
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight text-white">Store files in the cloud without losing track of who can reach them.</h2>
          <ul className="mt-8 space-y-5 text-ink-300">
            <li className="flex gap-3"><Lock className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" aria-hidden="true" /><span>Every upload is encrypted at rest with a KMS key.</span></li>
            <li className="flex gap-3"><ScanSearch className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" aria-hidden="true" /><span>Each file is scanned for PAN numbers, bank accounts, salary data and contact details, then classified.</span></li>
            <li className="flex gap-3"><Share2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" aria-hidden="true" /><span>Sharing follows policy: allowed, warned, sent for approval or blocked, with the reason shown.</span></li>
          </ul>
        </div>
        <p className="text-sm text-ink-300/70">Access control and data loss prevention for cloud file storage.</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden="true" />
            <span className="text-lg font-semibold">SecureCloud</span>
          </div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const next = safeNext(params.get('next')) || (location.state?.from ? `${location.state.from.pathname}${location.state.from.search || ''}` : null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      navigate(next || (user.role === 'admin' ? '/admin' : '/'), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const fill = (e, p) => { setEmail(e); setPassword(p); };

  return (
    <AuthShell title="Sign in" subtitle="Use your SecureCloud account to manage and share files.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input className="input mt-1" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <div className="relative mt-1">
            <input className="input pr-10" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
      </form>

      <p className="mt-6 text-sm text-slate-500">
        New here? <Link to="/register" state={location.state} className="font-medium text-brand-700 hover:underline">Create an account</Link>
      </p>

      {import.meta.env.DEV && (
        <div className="mt-8 rounded-md border border-dashed border-slate-300 p-3 text-xs text-slate-500">
          <p className="mb-2 font-medium text-slate-600">Demo accounts (development only)</p>
          <div className="flex gap-2">
            <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50" onClick={() => fill('user@demo.com', 'User@123')}>Fill user</button>
            <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50" onClick={() => fill('admin@demo.com', 'Admin@123')}>Fill admin</button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
