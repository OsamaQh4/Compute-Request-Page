import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import RequestPortal from './pages/requester/RequestPortal'
import ProvisionForm from './pages/requester/ProvisionForm'
import EditForm from './pages/requester/EditForm'
import AdminLayout from './components/AdminLayout'
import VMList from './pages/admin/VMList'
import RequestApprovals from './pages/admin/RequestApprovals'
import Settings from './pages/admin/Settings'
import MyRequests from './pages/requester/MyRequests'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isAdmin } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, isAdmin } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={isAdmin ? '/admin/vms' : '/'} replace /> : <Login />} />

      {/* Requester routes */}
      <Route path="/" element={<ProtectedRoute><RequestPortal /></ProtectedRoute>} />
      <Route path="/request/provision" element={<ProtectedRoute><ProvisionForm /></ProtectedRoute>} />
      <Route path="/request/edit" element={<ProtectedRoute><EditForm /></ProtectedRoute>} />
      <Route path="/my-requests" element={<ProtectedRoute><MyRequests /></ProtectedRoute>} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/admin/vms" replace />} />
        <Route path="vms" element={<VMList />} />
        <Route path="requests" element={<RequestApprovals />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
