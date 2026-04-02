import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import api from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import LoadingSpinner from '../../components/LoadingSpinner'

interface Request {
  id: number
  request_type: string
  status: string
  vm_name?: string
  target_vm_name?: string
  requester_name: string
  created_at: string
  denial_reason?: string
  agent_response?: string
  cpu_count?: number
  memory_mb?: number
  storage_gb?: number
  requested_cpu?: number
  requested_memory_mb?: number
  requested_storage_gb?: number
}

// Demo data
const DEMO_REQUESTS: Request[] = [
  { id: 1, request_type: 'provision', status: 'pending', vm_name: 'prod-app-05', requester_name: 'John Doe', created_at: new Date().toISOString(), cpu_count: 4, memory_mb: 8192, storage_gb: 200 },
  { id: 2, request_type: 'edit', status: 'auto_approved', target_vm_name: 'dev-app-02', requester_name: 'John Doe', created_at: new Date(Date.now() - 86400000).toISOString(), requested_cpu: 2, requested_memory_mb: 4096 },
  { id: 3, request_type: 'edit', status: 'denied', target_vm_name: 'prod-db-01', requester_name: 'John Doe', created_at: new Date(Date.now() - 172800000).toISOString(), requested_cpu: 32, denial_reason: 'Exceeds maximum resource allocation for non-critical workloads.' },
]

export default function MyRequests() {
  const navigate = useNavigate()

  const { data: requests = [], isLoading } = useQuery<Request[]>({
    queryKey: ['my-requests'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/requests/')
        return data.length > 0 ? data : DEMO_REQUESTS
      } catch { return DEMO_REQUESTS }
    },
  })

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-4xl">
        <button onClick={() => navigate('/')} className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeftIcon className="h-4 w-4" /> Back to Portal
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title">My Requests</h1>
            <p className="text-sm text-gray-500 mt-1">Track all your VM provisioning and edit requests</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        ) : requests.length === 0 ? (
          <div className="card text-center py-16 text-gray-400">
            <p className="text-sm">No requests submitted yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map(req => (
              <div key={req.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="text-xs font-mono text-gray-400">#{req.id}</span>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${req.request_type === 'provision' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                        {req.request_type === 'provision' ? 'Provision' : 'Edit'}
                      </span>
                      <StatusBadge status={req.status} />
                    </div>
                    <h3 className="font-semibold text-gray-900">
                      {req.vm_name || req.target_vm_name || 'Unknown VM'}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {req.cpu_count && <span>{req.cpu_count} vCPU</span>}
                      {req.memory_mb && <span>{(req.memory_mb / 1024).toFixed(0)} GB RAM</span>}
                      {req.storage_gb && <span>{req.storage_gb} GB Storage</span>}
                      {req.requested_cpu && <span>→ {req.requested_cpu} vCPU</span>}
                      {req.requested_memory_mb && <span>→ {(req.requested_memory_mb / 1024).toFixed(0)} GB RAM</span>}
                    </div>
                    {req.denial_reason && (
                      <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                        <strong>Denial reason:</strong> {req.denial_reason}
                      </p>
                    )}
                    {req.agent_response && req.status === 'completed' && (
                      <p className="mt-2 text-xs text-green-700 bg-green-50 rounded px-2 py-1 truncate">
                        <strong>Result:</strong> {req.agent_response}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">{format(new Date(req.created_at), 'MMM d, yyyy')}</p>
                    <p className="text-xs text-gray-400">{format(new Date(req.created_at), 'HH:mm')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
