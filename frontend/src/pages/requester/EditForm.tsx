import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, CheckCircleIcon, MagnifyingGlassIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import api from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import LoadingSpinner from '../../components/LoadingSpinner'

interface Disk { key: string; label: string; capacity_gb: number }
interface VM {
  id: number
  name: string
  cpu_count: number
  memory_mb: number
  storage_gb: number
  power_state: string
  guest_os?: string
  snapshots: string
  disks: string
}
interface FormValues {
  snapshot_action?: string
  snapshot_name?: string
  snapshot_id?: string
  justification?: string
}

// ── Dummy VMs for demo when no vCenters configured ───────────────────────────
const DEMO_VMS: VM[] = [
  {
    id: 1, name: 'prod-web-01', cpu_count: 4, memory_mb: 8192, storage_gb: 200,
    power_state: 'POWERED_ON', guest_os: 'Oracle Linux 8', snapshots: '[]',
    disks: '[{"key":"2000","label":"Hard disk 1","capacity_gb":200}]',
  },
  {
    id: 2, name: 'prod-db-01', cpu_count: 8, memory_mb: 32768, storage_gb: 548,
    power_state: 'POWERED_ON', guest_os: 'Oracle Linux 9',
    snapshots: '[{"id":"snap-1","name":"pre-patch-2024","created":"2024-12-01"}]',
    disks: '[{"key":"2000","label":"Hard disk 1","capacity_gb":500},{"key":"2001","label":"Hard disk 2","capacity_gb":48}]',
  },
  {
    id: 3, name: 'dev-app-02', cpu_count: 2, memory_mb: 4096, storage_gb: 100,
    power_state: 'POWERED_OFF', guest_os: 'Ubuntu 22.04', snapshots: '[]',
    disks: '[{"key":"2000","label":"Hard disk 1","capacity_gb":100}]',
  },
  {
    id: 4, name: 'staging-api-01', cpu_count: 2, memory_mb: 4096, storage_gb: 80,
    power_state: 'POWERED_ON', guest_os: 'RHEL 9', snapshots: '[]',
    disks: '[{"key":"2000","label":"Hard disk 1","capacity_gb":80}]',
  },
]

export default function EditForm() {
  const navigate = useNavigate()
  const [selectedVM, setSelectedVM] = useState<VM | null>(null)
  const [search, setSearch] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  // Controlled resource fields
  const [cpuCount, setCpuCount] = useState(1)
  const [memoryGb, setMemoryGb] = useState(1)
  const [addDiskGb, setAddDiskGb] = useState<string>('')

  const { data: vms = [], isLoading } = useQuery<VM[]>({
    queryKey: ['vms'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/vms/')
        return data.length > 0 ? data : DEMO_VMS
      } catch {
        return DEMO_VMS
      }
    },
  })

  const { register, handleSubmit, watch, reset } = useForm<FormValues>()
  const snapshotAction = watch('snapshot_action')
  const snapshots: Array<{ id: string; name: string }> = selectedVM
    ? JSON.parse(selectedVM.snapshots || '[]')
    : []
  const disks: Disk[] = selectedVM ? JSON.parse(selectedVM.disks || '[]') : []

  const filtered = vms.filter(
    v =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.guest_os || '').toLowerCase().includes(search.toLowerCase()),
  )

  const selectVM = (vm: VM) => {
    setSelectedVM(vm)
    setCpuCount(vm.cpu_count)
    setMemoryGb(Math.round(vm.memory_mb / 1024))
    setAddDiskGb('')
    reset({ snapshot_action: '', snapshot_name: '', snapshot_id: '', justification: '' })
  }

  const onSubmit = async (data: FormValues) => {
    if (!selectedVM) return

    const cpuChanged = cpuCount !== selectedVM.cpu_count
    const memChanged = memoryGb !== Math.round(selectedVM.memory_mb / 1024)
    const diskAdded = addDiskGb !== '' && Number(addDiskGb) > 0
    const snapshotChanged = !!data.snapshot_action

    if (!cpuChanged && !memChanged && !diskAdded && !snapshotChanged) {
      toast.error('No changes made — update at least one field.')
      return
    }

    setLoading(true)
    try {
      await api.post('/requests/edit', {
        target_vm_id: selectedVM.id,
        requested_cpu: cpuChanged ? cpuCount : undefined,
        requested_memory_mb: memChanged ? memoryGb * 1024 : undefined,
        add_disk_gb: diskAdded ? Number(addDiskGb) : undefined,
        snapshot_action: data.snapshot_action || undefined,
        snapshot_name: data.snapshot_name || undefined,
        snapshot_id: data.snapshot_id || undefined,
        justification: data.justification || undefined,
      })
      setSubmitted(true)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to submit request')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
          <CheckCircleIcon className="mx-auto h-16 w-16 text-green-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Request Submitted!</h2>
          <p className="text-gray-500 mb-6">
            Your edit request has been submitted. Snapshot-only changes are auto-approved immediately.
            Resource changes (CPU, memory, disk) require administrator review.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/my-requests')} className="btn-primary">View My Requests</button>
            <button onClick={() => navigate('/')} className="btn-secondary">Back to Portal</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-4xl">
        <button onClick={() => navigate('/')} className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeftIcon className="h-4 w-4" /> Back to Portal
        </button>

        <h1 className="page-title mb-1">Edit Existing VM</h1>
        <p className="text-sm text-gray-500 mb-8">Select a VM then specify the changes you need.</p>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* VM Selector */}
          <div className="lg:col-span-2 card p-0 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="section-title mb-3">Select VM</h2>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search VMs…"
                  className="form-input pl-9"
                />
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
              {isLoading && (
                <div className="flex justify-center py-8"><LoadingSpinner /></div>
              )}
              {!isLoading && filtered.map(vm => (
                <button
                  key={vm.id}
                  onClick={() => selectVM(vm)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedVM?.id === vm.id ? 'bg-brand-50 border-r-2 border-brand-500' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 truncate">{vm.name}</span>
                    <StatusBadge status={vm.power_state} />
                  </div>
                  <p className="text-xs text-gray-400">{vm.guest_os || 'Unknown OS'}</p>
                  <p className="text-xs text-gray-400">{vm.cpu_count} vCPU · {(vm.memory_mb / 1024).toFixed(0)} GB · {vm.storage_gb} GB</p>
                </button>
              ))}
              {!isLoading && filtered.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">No VMs found</p>
              )}
            </div>
          </div>

          {/* Edit Form */}
          <div className="lg:col-span-3">
            {!selectedVM ? (
              <div className="card flex flex-col items-center justify-center py-16 text-center text-gray-400">
                <MagnifyingGlassIcon className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">Select a VM from the list to request changes</p>
              </div>
            ) : (
              <div className="card">
                {/* Current spec banner */}
                <div className="mb-6 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Current Specs – {selectedVM.name}</p>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                    <span><strong>{selectedVM.cpu_count}</strong> vCPU</span>
                    <span><strong>{(selectedVM.memory_mb / 1024).toFixed(0)} GB</strong> RAM</span>
                    <span><strong>{selectedVM.storage_gb} GB</strong> Storage</span>
                    <StatusBadge status={selectedVM.power_state} />
                  </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  {/* CPU & Memory */}
                  <section>
                    <h2 className="section-title mb-1">Requested Resources</h2>
                    <p className="text-xs text-gray-400 mb-4">
                      Resource changes (CPU, memory, disk) require admin approval.
                      A snapshot is automatically taken before any hardware changes.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      {/* vCPU counter */}
                      <div>
                        <label className="form-label">vCPU</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCpuCount(c => Math.max(1, c - 1))}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 text-lg font-medium select-none"
                          >
                            −
                          </button>
                          <span className={`w-14 text-center text-lg font-semibold ${cpuCount !== selectedVM.cpu_count ? 'text-brand-600' : 'text-gray-800'}`}>
                            {cpuCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCpuCount(c => Math.min(128, c + 1))}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 text-lg font-medium select-none"
                          >
                            +
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">Current: {selectedVM.cpu_count} vCPU</p>
                      </div>

                      {/* Memory in GB */}
                      <div>
                        <label className="form-label">Memory (GB)</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMemoryGb(m => Math.max(1, m - 1))}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 text-lg font-medium select-none"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={memoryGb}
                            onChange={e => setMemoryGb(Math.max(1, Number(e.target.value)))}
                            className={`w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-center text-base font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 ${memoryGb !== Math.round(selectedVM.memory_mb / 1024) ? 'text-brand-600' : 'text-gray-800'}`}
                          />
                          <button
                            type="button"
                            onClick={() => setMemoryGb(m => m + 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 text-lg font-medium select-none"
                          >
                            +
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">Current: {(selectedVM.memory_mb / 1024).toFixed(0)} GB</p>
                      </div>
                    </div>
                  </section>

                  {/* Disk list */}
                  <section>
                    <h2 className="section-title mb-3">Storage</h2>
                    {disks.length > 0 ? (
                      <div className="mb-3 rounded-lg border border-gray-200 divide-y divide-gray-100">
                        {disks.map(disk => (
                          <div key={disk.key} className="flex items-center justify-between px-3 py-2 text-sm">
                            <span className="text-gray-700">{disk.label}</span>
                            <span className="font-medium text-gray-900">{disk.capacity_gb} GB</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mb-3">No disk data available (sync from vCenter to populate).</p>
                    )}

                    {/* Add new disk */}
                    <div className="rounded-lg border border-dashed border-gray-300 p-3">
                      <label className="form-label flex items-center gap-1 mb-2">
                        <PlusIcon className="h-4 w-4" /> Add New Disk (GB, thin provisioned)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          placeholder="e.g. 100"
                          value={addDiskGb}
                          onChange={e => setAddDiskGb(e.target.value)}
                          className="form-input w-32"
                        />
                        {addDiskGb && Number(addDiskGb) > 0 && (
                          <button
                            type="button"
                            onClick={() => setAddDiskGb('')}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                          >
                            <TrashIcon className="h-4 w-4" /> Remove
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        Adds a new virtual disk. Note: existing snapshots are NOT automatically removed before disk operations.
                      </p>
                    </div>
                  </section>

                  {/* Snapshots */}
                  <section>
                    <h2 className="section-title mb-4">Snapshot Management</h2>
                    <div>
                      <label className="form-label">Snapshot Action</label>
                      <select className="form-select mb-3" {...register('snapshot_action')}>
                        <option value="">No snapshot action</option>
                        <option value="add">Create new snapshot</option>
                        <option value="delete">Delete existing snapshot</option>
                      </select>
                    </div>

                    {snapshotAction === 'add' && (
                      <div>
                        <label className="form-label">Snapshot Name</label>
                        <input className="form-input" placeholder="e.g. pre-migration-2025" {...register('snapshot_name')} />
                      </div>
                    )}

                    {snapshotAction === 'delete' && (
                      <div>
                        <label className="form-label">Select Snapshot to Delete</label>
                        {snapshots.length > 0 ? (
                          <select className="form-select" {...register('snapshot_id')}>
                            <option value="">Choose snapshot…</option>
                            {snapshots.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        ) : (
                          <div>
                            <p className="text-xs text-gray-400 mb-2">No snapshots found for this VM. Enter snapshot ID manually:</p>
                            <input className="form-input" placeholder="Snapshot ID" {...register('snapshot_id')} />
                            <input className="form-input mt-2" placeholder="Snapshot Name" {...register('snapshot_name')} />
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  {/* Justification */}
                  <div>
                    <label className="form-label">Justification</label>
                    <textarea rows={3} className="form-textarea" placeholder="Why are these changes needed?"
                      {...register('justification')} />
                  </div>

                  <div className="flex gap-3">
                    <button type="submit" disabled={loading} className="btn-primary px-8">
                      {loading ? 'Submitting…' : 'Submit Request'}
                    </button>
                    <button type="button" onClick={() => navigate('/')} className="btn-secondary">Cancel</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
