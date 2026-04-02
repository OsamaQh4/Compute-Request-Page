import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ServerStackIcon,
  CpuChipIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import api from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import LoadingSpinner from '../../components/LoadingSpinner'

interface VM {
  id: number; name: string; vcenter_name?: string; cpu_count: number; memory_mb: number
  storage_gb: number; power_state: string; guest_os?: string; ip_addresses: string
  datacenter?: string; cluster?: string; network?: string; snapshots: string; last_updated?: string
}

// Demo data
const DEMO_VMS: VM[] = [
  { id: 1, name: 'prod-web-01', vcenter_name: 'VC-Primary', cpu_count: 4, memory_mb: 8192, storage_gb: 200, power_state: 'POWERED_ON', guest_os: 'Oracle Linux 8', ip_addresses: '["10.0.1.10"]', datacenter: 'DC-Main', cluster: 'Cluster-Prod', network: 'VLAN-100', snapshots: '[]', last_updated: new Date().toISOString() },
  { id: 2, name: 'prod-db-01', vcenter_name: 'VC-Primary', cpu_count: 8, memory_mb: 32768, storage_gb: 500, power_state: 'POWERED_ON', guest_os: 'Oracle Linux 9', ip_addresses: '["10.0.1.20"]', datacenter: 'DC-Main', cluster: 'Cluster-Prod', network: 'VLAN-100', snapshots: '[{"id":"s1","name":"pre-patch"}]', last_updated: new Date().toISOString() },
  { id: 3, name: 'dev-app-02', vcenter_name: 'VC-Dev', cpu_count: 2, memory_mb: 4096, storage_gb: 100, power_state: 'POWERED_OFF', guest_os: 'Ubuntu 22.04', ip_addresses: '[]', datacenter: 'DC-Dev', cluster: 'Cluster-Dev', network: 'VLAN-200', snapshots: '[]', last_updated: new Date(Date.now() - 3600000).toISOString() },
  { id: 4, name: 'staging-api-01', vcenter_name: 'VC-Dev', cpu_count: 2, memory_mb: 4096, storage_gb: 80, power_state: 'POWERED_ON', guest_os: 'RHEL 9', ip_addresses: '["10.1.0.5"]', datacenter: 'DC-Dev', cluster: 'Cluster-Dev', network: 'VLAN-201', snapshots: '[]', last_updated: new Date(Date.now() - 7200000).toISOString() },
  { id: 5, name: 'prod-mon-01', vcenter_name: 'VC-Primary', cpu_count: 4, memory_mb: 16384, storage_gb: 300, power_state: 'POWERED_ON', guest_os: 'Oracle Linux 8', ip_addresses: '["10.0.1.30"]', datacenter: 'DC-Main', cluster: 'Cluster-Prod', network: 'VLAN-100', snapshots: '[]', last_updated: new Date(Date.now() - 1800000).toISOString() },
  { id: 6, name: 'dev-ci-01', vcenter_name: 'VC-Dev', cpu_count: 4, memory_mb: 8192, storage_gb: 150, power_state: 'SUSPENDED', guest_os: 'Ubuntu 22.04', ip_addresses: '[]', datacenter: 'DC-Dev', cluster: 'Cluster-Dev', network: 'VLAN-200', snapshots: '[]', last_updated: new Date(Date.now() - 86400000).toISOString() },
]

export default function VMList() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [vcenterFilter, setVcenterFilter] = useState('')
  const [expandedVm, setExpandedVm] = useState<number | null>(null)

  const { data: vms = [], isLoading, dataUpdatedAt } = useQuery<VM[]>({
    queryKey: ['admin-vms'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/vms/')
        return data.length > 0 ? data : DEMO_VMS
      } catch { return DEMO_VMS }
    },
    staleTime: 60_000,
  })

  const syncMutation = useMutation({
    mutationFn: () => api.post('/vms/sync'),
    onSuccess: (res) => {
      toast.success(`Sync completed. ${res.data.synced} vCenter(s) synced.`)
      qc.invalidateQueries({ queryKey: ['admin-vms'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Sync failed'),
  })

  const vcenters = [...new Set(vms.map(v => v.vcenter_name).filter(Boolean))]

  const filtered = vms.filter(v => {
    const matchSearch = v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.guest_os || '').toLowerCase().includes(search.toLowerCase()) ||
      (v.ip_addresses.includes(search))
    const matchVc = !vcenterFilter || v.vcenter_name === vcenterFilter
    return matchSearch && matchVc
  })

  const stats = {
    total: vms.length,
    on: vms.filter(v => v.power_state === 'POWERED_ON').length,
    off: vms.filter(v => v.power_state === 'POWERED_OFF').length,
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Virtual Machines</h1>
          <p className="text-sm text-gray-500 mt-1">
            {vms.length} VMs across {vcenters.length} vCenter(s)
            {dataUpdatedAt ? ` · Last refreshed ${format(dataUpdatedAt, 'HH:mm')}` : ''}
          </p>
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="btn-primary"
        >
          {syncMutation.isPending ? <LoadingSpinner size="sm" /> : <ArrowPathIcon className="h-4 w-4" />}
          {syncMutation.isPending ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total VMs', value: stats.total, color: 'text-gray-900', bg: 'bg-gray-50', icon: ServerStackIcon },
          { label: 'Powered On', value: stats.on, color: 'text-green-700', bg: 'bg-green-50', icon: CpuChipIcon },
          { label: 'Powered Off', value: stats.off, color: 'text-gray-500', bg: 'bg-gray-50', icon: CircleStackIcon },
        ].map(s => (
          <div key={s.label} className={`card flex items-center gap-4 ${s.bg}`}>
            <s.icon className={`h-8 w-8 ${s.color} opacity-60`} />
            <div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, OS, IP…"
            className="form-input pl-9 w-full"
          />
        </div>
        <select value={vcenterFilter} onChange={e => setVcenterFilter(e.target.value)} className="form-select w-auto">
          <option value="">All vCenters</option>
          {vcenters.map(vc => <option key={vc} value={vc}>{vc}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['VM Name', 'vCenter', 'State', 'OS', 'vCPU', 'RAM', 'Storage', 'IP Address', 'Snaps', 'Updated'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(vm => {
                const ips = JSON.parse(vm.ip_addresses || '[]')
                const snaps = JSON.parse(vm.snapshots || '[]')
                const expanded = expandedVm === vm.id
                return (
                  <>
                    <tr
                      key={vm.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setExpandedVm(expanded ? null : vm.id)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{vm.name}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{vm.vcenter_name || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={vm.power_state} /></td>
                      <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{vm.guest_os || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{vm.cpu_count}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{(vm.memory_mb / 1024).toFixed(0)} GB</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{vm.storage_gb} GB</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{ips[0] || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {snaps.length > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">{snaps.length}</span>
                        ) : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                        {vm.last_updated ? format(new Date(vm.last_updated), 'MMM d HH:mm') : '—'}
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${vm.id}-detail`} className="bg-brand-50">
                        <td colSpan={10} className="px-6 py-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-gray-600">
                            <div><span className="font-semibold block text-gray-700">Datacenter</span>{vm.datacenter || '—'}</div>
                            <div><span className="font-semibold block text-gray-700">Cluster</span>{vm.cluster || '—'}</div>
                            <div><span className="font-semibold block text-gray-700">Network</span>{vm.network || '—'}</div>
                            <div><span className="font-semibold block text-gray-700">All IPs</span>{ips.join(', ') || '—'}</div>
                            {snaps.length > 0 && (
                              <div className="col-span-4">
                                <span className="font-semibold block text-gray-700 mb-1">Snapshots</span>
                                <div className="flex flex-wrap gap-2">
                                  {snaps.map((s: any) => (
                                    <span key={s.id} className="bg-amber-100 text-amber-800 rounded px-2 py-1 text-xs">{s.name}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400 text-sm">No VMs match your filters</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
