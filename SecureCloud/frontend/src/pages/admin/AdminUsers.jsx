import { useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import useFetch from '../../hooks/useFetch';
import useDebounce from '../../hooks/useDebounce';
import { changeRole, listUsers } from '../../api/adminApi';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '../../components/ui/Feedback';
import { errorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState(null);
  const q = useDebounce(search.trim());

  const { data, loading, error, reload } = useFetch(() => listUsers({ page, limit: 20, ...(q && { q }), ...(role && { role }) }), [page, q, role]);
  const users = data?.data || [];

  useEffect(() => { setPage(1); }, [q, role]);

  const nextRole = target?.role === 'admin' ? 'user' : 'admin';
  const submit = async () => {
    try {
      await changeRole(target._id, nextRole);
      toast.success(`${target.name} is now ${nextRole === 'admin' ? 'an administrator' : 'a regular user'}.`);
      reload(true);
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  return (
    <>
      <PageHeader title="Users" description="Accounts and roles. Administrators can review shares, lock files and see all events." />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className="input pl-9" placeholder="Search by name or email" aria-label="Search users" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="user">Users</option>
            <option value="admin">Administrators</option>
          </select>
        </div>

        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : users.length === 0 ? (
          <EmptyState icon={Users} title="No users found">Try a different name or email.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50"><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Status</th><th className="th">Joined</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u._id}>
                    <td className="td font-medium text-slate-900">{u.name}{u._id === me._id && <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>}</td>
                    <td className="td break-all">{u.email}</td>
                    <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${u.role === 'admin' ? 'bg-ink-900 text-white ring-ink-900' : 'bg-slate-100 text-slate-700 ring-slate-500/20'}`}>{u.role === 'admin' ? 'Administrator' : 'User'}</span></td>
                    <td className="td">{u.isActive === false ? <span className="text-rose-700">Disabled</span> : <span className="text-emerald-700">Active</span>}</td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDate(u.createdAt, { time: false })}</td>
                    <td className="td text-right">
                      <Button size="sm" variant="secondary" disabled={u._id === me._id} title={u._id === me._id ? 'You cannot change your own role' : undefined} onClick={() => setTarget(u)}>
                        {u.role === 'admin' ? 'Make user' : 'Make administrator'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pagination={data?.pagination} onPage={setPage} />
      </div>

      <ConfirmDialog
        open={Boolean(target)} title={nextRole === 'admin' ? 'Make this user an administrator?' : 'Remove administrator access?'}
        confirmLabel={nextRole === 'admin' ? 'Make administrator' : 'Make user'} danger={nextRole === 'admin'}
        message={target ? (nextRole === 'admin' ? `${target.name} will be able to approve shares, lock files and see every user's events.` : `${target.name} will lose access to the administration pages.`) : ''}
        onConfirm={submit} onClose={() => setTarget(null)}
      />
    </>
  );
}
