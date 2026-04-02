import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, XMarkIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import api from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import LoadingSpinner from '../../components/LoadingSpinner'

interface Request {
  id: number; request_type: string; status: string; requester_name: string; requester_email: string
  requester_department?: string; vm_name?: string; target_vm_name?: string
  cpu_count?: number; memory_mb?: number; storage_gb?: number; os_template?: string
  datacenter?: string; cluster?: string; datastore?: string; network?: string
  requested_cpu?: number; requested_memory_mb?: number; requested_storage_gb?: number
  snapshot_action?: string; snapshot_name?: string; justification?: string; description?: string
  denial_reason?: string; admin_notes?: string; agent_response?: string; auto_approved?: boolean
  created_at: string; approved_by?: string
}

const DEMO_REQUESTS: Request[] = [
  { id: 1, request_type: 'provision', status: 'pending', requester_name: 'John Doe', requester_email: 'john@demo.local', requester_department: 'Engineering', vm_name: 'prod-app-05', cpu_count: 4, memory_mb: 8192, storage_gb: 200, os_template: 'Oracle Linux 9', datacenter: 'DC-Main', cluster: 'Cluster-Prod', datastore: 'DS-SSD-01', network: 'VLAN-100', description: 'New application server for the payment service', justification: 'Required to handle increased transaction volume.', created_at: new Date().toISOString() },
  { id: 2, request_type: 'edit', status: 'pending', requester_name: 'Jane Smith', requester_email: 'jane@demo.local', requester_department: 'DevOps', target_vm_name: 'prod-db-01', requested_cpu: 16, requested_memory_mb: 65536, justification: 'Database growing quickly, need more RAM and CPU.', created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 3, request_type: 'edit', status: 'auto_approved', requester_name: 'Alex Kim', requester_email: 'alex@demo.local', target_vm_name: 'dev-app-02', requested_cpu: 2, requested_memory_mb: 4505, created_at: new Date(Date.now() - 7200000).toISOString(), auto_approved: true },
  { id: 4, request_type: 'provision', status: 'completed', requester_name: 'Sarah Lee', requester_email: 'sarah@demo.local', vm_name: 'staging-cache-01', cpu_count: 2, memory_mb: 4096, storage_gb: 50, os_template: 'Ubuntu 22.04', created_at: new Date(Date.now() - 86400000).toISOString(), approved_by: 'admin@demo.local', agent_response: 'VM staging-cache-01 provisioned successfully. IP: 10.1.0.42' },
  { id: 5, request_type: 'edit', status: 'denied', requester_name: 'Bob Wilson', requester_email: 'bob@demo.local', target_vm_name: 'prod-web-01', requested_cpu: 32, requested_memory_mb: 131072, justification: 'Need more resources.', created_at: new Date(Date.now() - 172800000).toISOString(), denial_reason: 'Requested resources exceed the maximum allowed for this VM tier. Please submit a formal capacity planning request.' },
]

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'auto_approved', label: 'Auto-Approved' },
  { value: 'completed', label: 'Completed' },
  { value: 'denied', label: 'Denied' },
]

export default function RequestApprovals() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [denyModal, setDenyModal] = useState<{ id: number } | null>(null)
  const [denyReason, setDenyReason] = useState('')
  const [adminNotes, setAdminNotes] = useState('')

  const { data: requests = [], isLoading } = useQuery<Request[]>({
    queryKey: ['admin-requests'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/requests/')
        return data.length > 0 ? data : DEMO_REQUESTS
      } catch { return DEMO_REQUESTS }
    },
    refetchInterval: 30_000,
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) =>
      api.post(`/requests/${id}/approve`, { admin_notes: notes }),
    onSuccess: () => {
      toast.success('Request approved')
      qc.invalidateQueries({ queryKey: ['admin-requests'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to approve'),
  })

  const denyMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`/requests/${id}/deny`, { denial_reason: reason }),
    onSuccess: () => {
      toast.success('Request denied')
      setDenyModal(null)
      setDenyReason('')
      qc.invalidateQueries({ queryKey: ['admin-requests'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to deny'),
  })

  const filtered = statusFilter ? requests.filter(r => r.status === statusFilter) : requests
  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="page-title">Requests</h1>
          {pendingCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 px-2.5 py-0.5 text-sm font-semibold">
              {pendingCount} pending
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-1">Review and action VM provisioning and edit requests</p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${statusFilter === tab.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {tab.label}
            {tab.value === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-yellow-400 text-yellow-900 px-1.5 text-xs font-bold">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const isPending = req.status === 'pending'
            const isExpanded = expandedId === req.id

            return (
              <div key={req.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Main row */}
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-xs font-mono text-gray-400">#{req.id}</span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${req.request_type === 'provision' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                          {req.request_type === 'provision' ? '⚡ Provision' : '✏️ Edit'}
                        </span>
                        <StatusBadge status={req.status} />
                        {req.auto_approved && <span className="text-xs text-teal-600 font-medium">(≤10% change)</span>}
                      </div>

                      <h3 className="font-semibold text-gray-900 text-base">
                        {req.vm_name || req.target_vm_name || 'Unknown VM'}
                      </h3>

                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-500">
                        <span>By <strong className="text-gray-700">{req.requester_name}</strong></span>
                        {req.requester_department && <span>{req.requester_department}</span>}
                        <span>{format(new Date(req.created_at), 'MMM d, yyyy HH:mm')}</span>
                      </div>

                      {/* Quick spec summary */}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                        {req.cpu_count && <span className="bg-gray-100 rounded px-2 py-0.5">{req.cpu_count} vCPU</span>}
                        {req.memory_mb && <span className="bg-gray-100 rounded px-2 py-0.5">{(req.memory_mb / 1024).toFixed(0)} GB RAM</span>}
                        {req.storage_gb && <span className="bg-gray-100 rounded px-2 py-0.5">{req.storage_gb} GB</span>}
                        {req.requested_cpu && <span className="bg-purple-100 text-purple-700 rounded px-2 py-0.5">→ {req.requested_cpu} vCPU</span>}
                        {req.requested_memory_mb && <span className="bg-purple-100 text-purple-700 rounded px-2 py-0.5">→ {(req.requested_memory_mb / 1024).toFixed(0)} GB RAM</span>}
                        {req.requested_storage_gb && <span className="bg-purple-100 text-purple-700 rounded px-2 py-0.5">→ {req.requested_storage_gb} GB</span>}
                      </div>

                      {req.denial_reason && (
                        <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                          <strong>Denied:</strong> {req.denial_reason}
                        </p>
                      )}
                      {req.agent_response && (
                        <p className="mt-2 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                          <strong>Agent:</strong> {req.agent_response}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isPending && (
                        <>
                          <button
                            onClick={() => approveMutation.mutate({ id: req.id, notes: adminNotes })}
                            disabled={approveMutation.isPending}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                          >
                            <CheckIcon className="h-4 w-4" />
                            Approve
                          </button>
                          <button
                            onClick={() => setDenyModal({ id: req.id })}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
                          >
                            <XMarkIcon className="h-4 w-4" />
                            Deny
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : req.id)}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Toggle details"
                      >
                        {isExpanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                      {req.request_type === 'provision' && (
                        <>
                          {req.os_template && <InfoRow label="OS Template" value={req.os_template} />}
                          {req.datacenter && <InfoRow label="Datacenter" value={req.datacenter} />}
                          {req.cluster && <InfoRow label="Cluster" value={req.cluster} />}
                          {req.datastore && <InfoRow label="Datastore" value={req.datastore} />}
                          {req.network && <InfoRow label="Network" value={req.network} />}
                        </>
                      )}
                      {req.snapshot_action && <InfoRow label="Snapshot Action" value={`${req.snapshot_action} → ${req.snapshot_name || req.snapshot_name || ''}`} />}
                      {req.requester_email && <InfoRow label="Email" value={req.requester_email} />}
                      {req.approved_by && <InfoRow label="Reviewed By" value={req.approved_by} />}
                    </div>
                    {req.description && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1">Description</p>
                        <p className="text-sm text-gray-700">{req.description}</p>
                      </div>
                    )}
                    {req.justification && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1">Justification</p>
                        <p className="text-sm text-gray-700">{req.justification}</p>
                      </div>
                    )}
                    {isPending && (
                      <div className="mt-3">
                        <label className="text-xs font-semibold text-gray-500 block mb-1">Admin Notes (optional)</label>
                        <textarea
                          rows={2}
                          className="form-textarea text-sm"
                          placeholder="Internal notes for this approval…"
                          value={adminNotes}
                          onChange={e => setAdminNotes(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="card text-center py-16 text-gray-400">
              <p className="text-sm">No requests in this category</p>
            </div>
          )}
        </div>
      )}

      {/* Deny modal */}
      {denyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Deny Request #{denyModal.id}</h2>
            <p className="text-sm text-gray-500 mb-4">Provide a reason. This will be emailed to the requester.</p>
            <textarea
              rows={4}
              className="form-textarea w-full mb-4"
              placeholder="Enter denial reason…"
              value={denyReason}
              onChange={e => setDenyReason(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                onClick={() => denyMutation.mutate({ id: denyModal.id, reason: denyReason })}
                disabled={!denyReason.trim() || denyMutation.isPending}
                className="btn-danger flex-1"
              >
                {denyMutation.isPending ? 'Denying…' : 'Confirm Deny'}
              </button>
              <button onClick={() => { setDenyModal(null); setDenyReason('') }} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="text-sm text-gray-700 mt-0.5">{value}</p>
    </div>
  )
}
