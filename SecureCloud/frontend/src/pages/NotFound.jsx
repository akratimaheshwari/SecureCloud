import { Link } from 'react-router-dom';
import { ShieldQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <ShieldQuestion className="mb-4 h-12 w-12 text-slate-300" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">The address may be mistyped, or the page was moved.</p>
      <Link to="/" className="mt-5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Go to dashboard</Link>
    </div>
  );
}
