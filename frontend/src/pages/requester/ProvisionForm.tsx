import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import api from '../../api/client'

interface FormValues {
  vm_name: string
  cpu_count: number
  memory_mb: number
  storage_gb: number
  os_template: string
  datacenter: string
  cluster: string
  datastore: string
  network: string
  description: string
  additional_notes: string
  justification: string
}

const OS_TEMPLATES = [
  'Windows Server 2022',
  'Windows Server 2019',
  'RHEL 9',
  'RHEL 8',
  'Ubuntu 22.04 LTS',
  'Ubuntu 20.04 LTS',
  'Oracle Linux 9',
  'Oracle Linux 8',
  'CentOS 8 Stream',
  'Debian 12',
]

export default function ProvisionForm() {
  const navigate = useNavigate()
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<FormValues>({
    defaultValues: { cpu_count: 2, memory_mb: 4096, storage_gb: 100 },
  })

  const onSubmit = async (data: FormValues) => {
    setLoading(true)
    try {
      await api.post('/requests/provision', {
        ...data,
        cpu_count: Number(data.cpu_count),
        memory_mb: Number(data.memory_mb),
        storage_gb: Number(data.storage_gb),
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
            Your provision request has been submitted and is pending administrator approval. You'll receive an email notification once it's reviewed.
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
      <div className="mx-auto max-w-2xl">
        {/* Back */}
        <button onClick={() => navigate('/')} className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeftIcon className="h-4 w-4" /> Back to Portal
        </button>

        <div className="card">
          <h1 className="page-title mb-1">Provision New VM</h1>
          <p className="text-sm text-gray-500 mb-8">Fill in all required fields. Your request will go to administrators for approval.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* VM Identity */}
            <section>
              <h2 className="section-title mb-4 pb-2 border-b border-gray-100">VM Identity</h2>
              <div>
                <label className="form-label">VM Name <span className="text-red-500">*</span></label>
                <input className="form-input" placeholder="e.g. prod-web-01" {...register('vm_name', { required: 'VM name is required' })} />
                {errors.vm_name && <p className="mt-1 text-xs text-red-600">{errors.vm_name.message}</p>}
              </div>
            </section>

            {/* Compute */}
            <section>
              <h2 className="section-title mb-4 pb-2 border-b border-gray-100">Compute Resources</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="form-label">vCPU Count <span className="text-red-500">*</span></label>
                  <input type="number" min={1} max={128} className="form-input"
                    {...register('cpu_count', { required: true, min: 1, max: 128 })} />
                </div>
                <div>
                  <label className="form-label">Memory (MB) <span className="text-red-500">*</span></label>
                  <input type="number" min={512} className="form-input"
                    {...register('memory_mb', { required: true, min: 512 })} />
                  <p className="mt-1 text-xs text-gray-400">e.g. 4096 = 4 GB</p>
                </div>
                <div>
                  <label className="form-label">Storage (GB) <span className="text-red-500">*</span></label>
                  <input type="number" min={20} className="form-input"
                    {...register('storage_gb', { required: true, min: 20 })} />
                </div>
              </div>
            </section>

            {/* OS */}
            <section>
              <h2 className="section-title mb-4 pb-2 border-b border-gray-100">Operating System</h2>
              <div>
                <label className="form-label">OS Template <span className="text-red-500">*</span></label>
                <select className="form-select" {...register('os_template', { required: 'OS template is required' })}>
                  <option value="">Select OS template…</option>
                  {OS_TEMPLATES.map(os => <option key={os} value={os}>{os}</option>)}
                </select>
                {errors.os_template && <p className="mt-1 text-xs text-red-600">{errors.os_template.message}</p>}
              </div>
            </section>

            {/* Placement */}
            <section>
              <h2 className="section-title mb-4 pb-2 border-b border-gray-100">Placement</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Datacenter <span className="text-red-500">*</span></label>
                  <input className="form-input" placeholder="e.g. DC-01" {...register('datacenter', { required: true })} />
                </div>
                <div>
                  <label className="form-label">Cluster <span className="text-red-500">*</span></label>
                  <input className="form-input" placeholder="e.g. Cluster-Prod" {...register('cluster', { required: true })} />
                </div>
                <div>
                  <label className="form-label">Datastore <span className="text-red-500">*</span></label>
                  <input className="form-input" placeholder="e.g. DS-SSD-01" {...register('datastore', { required: true })} />
                </div>
                <div>
                  <label className="form-label">Network / VLAN <span className="text-red-500">*</span></label>
                  <input className="form-input" placeholder="e.g. VLAN-100-Prod" {...register('network', { required: true })} />
                </div>
              </div>
            </section>

            {/* Details */}
            <section>
              <h2 className="section-title mb-4 pb-2 border-b border-gray-100">Purpose & Justification</h2>
              <div className="space-y-4">
                <div>
                  <label className="form-label">VM Purpose / Description <span className="text-red-500">*</span></label>
                  <textarea rows={3} className="form-textarea" placeholder="Describe the purpose of this VM…"
                    {...register('description', { required: 'Description is required' })} />
                  {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
                </div>
                <div>
                  <label className="form-label">Business Justification</label>
                  <textarea rows={2} className="form-textarea" placeholder="Why is this resource needed? (Optional)"
                    {...register('justification')} />
                </div>
                <div>
                  <label className="form-label">Additional Notes</label>
                  <textarea rows={2} className="form-textarea" placeholder="Any special requirements…"
                    {...register('additional_notes')} />
                </div>
              </div>
            </section>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={loading} className="btn-primary px-8">
                {loading ? 'Submitting…' : 'Submit Request'}
              </button>
              <button type="button" onClick={() => navigate('/')} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
