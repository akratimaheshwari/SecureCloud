import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import { errorMessage } from '../utils/errors';
import { AuthShell } from './Login';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const from = location.state?.from;

  const submit = async (e) => {
    e.preventDefault();
    if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
      setError('Password must contain at least one letter and one number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      navigate(from ? `${from.pathname}${from.search || ''}` : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="You get your own private file space. Sharing is controlled by policy.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Full name
          <input className="input mt-1" required minLength={2} maxLength={80} autoComplete="name" autoFocus value={form.name} onChange={set('name')} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input className="input mt-1" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input className="input mt-1" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={set('password')} />
          <span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters, with a letter and a number.</span>
        </label>
        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-sm text-slate-500">
        Already registered? <Link to="/login" state={location.state} className="font-medium text-brand-700 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
