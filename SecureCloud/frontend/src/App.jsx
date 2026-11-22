import { Route, Routes } from 'react-router-dom';
import ProtectedRoute, { GuestRoute } from './routes/ProtectedRoute';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import SharedAccess from './pages/SharedAccess';
import Dashboard from './pages/Dashboard';
import Files from './pages/Files';
import FileDetails from './pages/FileDetails';
import SharedByMe from './pages/SharedByMe';
import SharedWithMe from './pages/SharedWithMe';
import MyActivity from './pages/MyActivity';
import AdminOverview from './pages/admin/AdminOverview';
import AdminApprovals from './pages/admin/AdminApprovals';
import AdminEvents from './pages/admin/AdminEvents';
import AdminAudit from './pages/admin/AdminAudit';
import AdminUsers from './pages/admin/AdminUsers';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
      <Route path="/shared/:token" element={<SharedAccess />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="files" element={<Files />} />
          <Route path="files/:id" element={<FileDetails />} />
          <Route path="shares/mine" element={<SharedByMe />} />
          <Route path="shares/with-me" element={<SharedWithMe />} />
          <Route path="activity" element={<MyActivity />} />

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="admin" element={<AdminOverview />} />
            <Route path="admin/approvals" element={<AdminApprovals />} />
            <Route path="admin/events" element={<AdminEvents />} />
            <Route path="admin/audit" element={<AdminAudit />} />
            <Route path="admin/users" element={<AdminUsers />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
