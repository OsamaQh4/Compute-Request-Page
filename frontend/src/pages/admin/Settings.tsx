import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  ServerStackIcon, KeyIcon, EnvelopeIcon, CpuChipIcon,
  PlusIcon, TrashIcon, CheckCircleIcon, XCircleIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import api from '../../api/client'
import LoadingSpinner from '../../components/LoadingSpinner'

const TABS = [
  { id: 'vcenter', label: 'vCenters', icon: ServerStackIcon },
  { id: 'ldap', label: 'AD / LDAP', icon: KeyIcon },
  { id: 'smtp', label: 'SMTP', icon: EnvelopeIcon },
  { id: 'ai', label: 'AI Agent', icon: CpuChipIcon },
]

// ── Test result badge ─────────────────────────────────────────────────────────
function TestResult({ result }: { result: { success: boolean; message: string } | null }) {
  if (!result) return null
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
      {result.success ? <CheckCircleIcon className="h-4 w-4" /> : <XCircleIcon className="h-4 w-4" />}
      {result.message}
    </div>
  )
}

// ── vCenters tab ──────────────────────────────────────────────────────────────
function VCenterSettings() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [testResult, setTestResult] = useState<Record<number, any>>({})
  const { register, handleSubmit, reset } = useForm<any>()

  const { data: vcenters = [], isLoading } = useQuery({
    queryKey: ['settings-vcenters'],
    queryFn: async () => { try { const { data } = await api.get('/settings/vcenters'); return data } catch { return [] } },
  })

  const addMutation = useMutation({
    mutationFn: (d: any) => api.post('/settings/vcenters', d),
    onSuccess: () => { toast.success('vCenter added'); qc.invalidateQueries({ queryKey: ['settings-vcenters'] }); setShowAdd(false); reset() },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/vcenters/${id}`),
    onSuccess: () => { toast.success('vCenter removed'); qc.invalidateQueries({ queryKey: ['settings-vcenters'] }) },
  })

  const testConnection = async (id: number) => {
    try {
      const { data } = await api.post(`/settings/vcenters/${id}/test`)
      setTestResult(prev => ({ ...prev, [id]: data }))
    } catch (e: any) {
      setTestResult(prev => ({ ...prev, [id]: { success: false, message: e.response?.data?.detail || 'Error' } }))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">vCenter Connections</h2>
          <p className="text-sm text-gray-500 mt-1">Add vSphere REST API endpoints. VMs will be synced from all active vCenters.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <PlusIcon className="h-4 w-4" /> Add vCenter
        </button>
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner /></div>}

      {vcenters.map((vc: any) => (
        <div key={vc.id} className="rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900">{vc.name}</p>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${vc.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {vc.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{vc.url} · {vc.username}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                SSL: {vc.ignore_ssl ? 'Ignored' : 'Verified'}
                {vc.last_sync && ` · Last sync: ${new Date(vc.last_sync).toLocaleString()}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => testConnection(vc.id)} className="btn-secondary text-xs py-1.5">Test</button>
              <button onClick={() => deleteMutation.mutate(vc.id)} className="btn-danger text-xs py-1.5">
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {testResult[vc.id] && <TestResult result={testResult[vc.id]} />}
        </div>
      ))}

      {vcenters.length === 0 && !isLoading && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-10 text-center text-gray-400">
          <ServerStackIcon className="mx-auto h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm">No vCenters configured yet</p>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Add vCenter</h3>
            <form onSubmit={handleSubmit((d) => addMutation.mutate(d))} className="space-y-4">
              <div><label className="form-label">Display Name</label><input className="form-input" placeholder="VC-Primary" {...register('name', { required: true })} /></div>
              <div><label className="form-label">URL <span className="text-xs text-gray-400">(https://vcenter.domain.com)</span></label><input className="form-input" placeholder="https://vc.example.com" {...register('url', { required: true })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Username</label><input className="form-input" placeholder="administrator@vsphere.local" {...register('username', { required: true })} /></div>
                <div><label className="form-label">Password</label><input type="password" className="form-input" {...register('password', { required: true })} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" className="rounded" {...register('ignore_ssl')} />
                Ignore SSL certificate errors
              </label>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={addMutation.isPending} className="btn-primary flex-1">{addMutation.isPending ? 'Adding…' : 'Add vCenter'}</button>
                <button type="button" onClick={() => { setShowAdd(false); reset() }} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── LDAP tab ──────────────────────────────────────────────────────────────────
function LDAPSettings() {
  const qc = useQueryClient()
  const [testResult, setTestResult] = useState<any>(null)
  const { register, handleSubmit, reset } = useForm<any>()

  const { data: config, isLoading } = useQuery({
    queryKey: ['settings-ldap'],
    queryFn: async () => { try { const { data } = await api.get('/settings/ldap'); return data } catch { return null } },
  })

  useEffect(() => { if (config) reset(config) }, [config, reset])

  const saveMutation = useMutation({
    mutationFn: (d: any) => api.put('/settings/ldap', d),
    onSuccess: () => { toast.success('LDAP config saved'); qc.invalidateQueries({ queryKey: ['settings-ldap'] }) },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const testConn = async () => {
    try {
      const { data } = await api.post('/settings/ldap/test')
      setTestResult(data)
    } catch (e: any) {
      setTestResult({ success: false, message: e.response?.data?.detail || 'Connection failed' })
    }
  }

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>

  return (
    <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-6">
      <div>
        <h2 className="section-title">Active Directory / LDAP</h2>
        <p className="text-sm text-gray-500 mt-1">Configure LDAP authentication. Users log in with user@domain.com format.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2"><label className="form-label">LDAP Server</label><input className="form-input" placeholder="ldap.domain.com" {...register('server', { required: true })} /></div>
        <div><label className="form-label">Port</label><input type="number" className="form-input" defaultValue={389} {...register('port')} /></div>
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="rounded" {...register('use_ssl')} />Use SSL (LDAPS)</label>
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="rounded" {...register('ignore_ssl')} />Ignore SSL errors</label>
      </div>
      <div><label className="form-label">Base DN</label><input className="form-input" placeholder="DC=domain,DC=com" {...register('base_dn', { required: true })} /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="form-label">User Search Base</label><input className="form-input" placeholder="OU=Users,DC=domain,DC=com" {...register('user_search_base')} /></div>
        <div><label className="form-label">Group Search Base</label><input className="form-input" placeholder="OU=Groups,DC=domain,DC=com" {...register('group_search_base')} /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="form-label">Admin Group DN</label><input className="form-input" placeholder="CN=VMAdmins,OU=Groups,DC=domain,DC=com" {...register('admin_group_dn')} /></div>
        <div><label className="form-label">Requester Group DN <span className="text-xs text-gray-400">(optional)</span></label><input className="form-input" placeholder="CN=VMRequesters,OU=Groups,…" {...register('requester_group_dn')} /></div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Service Account (for group lookups)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="form-label">Bind DN</label><input className="form-input" placeholder="CN=svc-ldap,OU=Service,DC=domain,DC=com" {...register('bind_dn')} /></div>
          <div><label className="form-label">Bind Password</label><input type="password" className="form-input" {...register('bind_password')} /></div>
        </div>
      </div>

      {testResult && <TestResult result={testResult} />}

      <div className="flex gap-3">
        <button type="submit" disabled={saveMutation.isPending} className="btn-primary">{saveMutation.isPending ? 'Saving…' : 'Save Configuration'}</button>
        <button type="button" onClick={testConn} className="btn-secondary">Test Connection</button>
      </div>
    </form>
  )
}

// ── SMTP tab ──────────────────────────────────────────────────────────────────
function SMTPSettings() {
  const qc = useQueryClient()
  const [testResult, setTestResult] = useState<any>(null)
  const { register, handleSubmit, reset } = useForm<any>()

  const { data: config, isLoading } = useQuery({
    queryKey: ['settings-smtp'],
    queryFn: async () => { try { const { data } = await api.get('/settings/smtp'); return data } catch { return null } },
  })

  useEffect(() => { if (config) reset(config) }, [config, reset])

  const saveMutation = useMutation({
    mutationFn: (d: any) => api.put('/settings/smtp', d),
    onSuccess: () => { toast.success('SMTP config saved'); qc.invalidateQueries({ queryKey: ['settings-smtp'] }) },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const testConn = async () => {
    try {
      const { data } = await api.post('/settings/smtp/test')
      setTestResult(data)
    } catch (e: any) {
      setTestResult({ success: false, message: e.response?.data?.detail || 'Failed' })
    }
  }

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>

  return (
    <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-6">
      <div>
        <h2 className="section-title">SMTP Email Configuration</h2>
        <p className="text-sm text-gray-500 mt-1">Configure outbound email for request notifications.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2"><label className="form-label">SMTP Host</label><input className="form-input" placeholder="smtp.domain.com" {...register('host', { required: true })} /></div>
        <div><label className="form-label">Port</label><input type="number" className="form-input" defaultValue={587} {...register('port')} /></div>
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="rounded" {...register('use_tls')} />Use STARTTLS</label>
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="rounded" {...register('ignore_ssl')} />Ignore SSL errors</label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="form-label">SMTP Username</label><input className="form-input" placeholder="smtp-user@domain.com" {...register('username')} /></div>
        <div><label className="form-label">SMTP Password</label><input type="password" className="form-input" {...register('password')} /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="form-label">From Address <span className="text-red-500">*</span></label><input className="form-input" placeholder="noreply@domain.com" {...register('from_address', { required: true })} /></div>
        <div><label className="form-label">From Name</label><input className="form-input" placeholder="VM Request Portal" {...register('from_name')} /></div>
      </div>
      <div><label className="form-label">Admin Email(s) <span className="text-xs text-gray-400">(comma-separated)</span></label><input className="form-input" placeholder="admin@domain.com, ops@domain.com" {...register('admin_email')} /></div>

      {testResult && <TestResult result={testResult} />}

      <div className="flex gap-3">
        <button type="submit" disabled={saveMutation.isPending} className="btn-primary">{saveMutation.isPending ? 'Saving…' : 'Save Configuration'}</button>
        <button type="button" onClick={testConn} className="btn-secondary">Send Test Email</button>
      </div>
    </form>
  )
}

// ── AI Agent tab ──────────────────────────────────────────────────────────────
function AIAgentSettings() {
  const qc = useQueryClient()
  const [testResult, setTestResult] = useState<any>(null)
  const { register, handleSubmit, reset } = useForm<any>()

  const { data: config, isLoading } = useQuery({
    queryKey: ['settings-ai'],
    queryFn: async () => { try { const { data } = await api.get('/settings/ai-agent'); return data } catch { return null } },
  })

  useEffect(() => { if (config) reset(config) }, [config, reset])

  const saveMutation = useMutation({
    mutationFn: (d: any) => api.put('/settings/ai-agent', d),
    onSuccess: () => { toast.success('AI Agent config saved'); qc.invalidateQueries({ queryKey: ['settings-ai'] }) },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const testConn = async () => {
    try {
      const { data } = await api.post('/settings/ai-agent/test')
      setTestResult(data)
    } catch (e: any) {
      setTestResult({ success: false, message: e.response?.data?.detail || 'Failed' })
    }
  }

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>

  return (
    <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-6">
      <div>
        <h2 className="section-title">AI Agent (VMware Automation)</h2>
        <p className="text-sm text-gray-500 mt-1">Connect your OpenAI-compatible agent that executes VM provisioning and edits.</p>
      </div>

      <div><label className="form-label">Agent Base URL <span className="text-red-500">*</span></label><input className="form-input" placeholder="https://agent.domain.com" {...register('base_url', { required: true })} /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="form-label">API Key</label><input type="password" className="form-input" placeholder="sk-…" {...register('api_key')} /></div>
        <div><label className="form-label">Model Name</label><input className="form-input" placeholder="gpt-4" {...register('model')} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="rounded" {...register('ignore_ssl')} />Ignore SSL errors</label>
      <div>
        <label className="form-label">System Prompt <span className="text-xs text-gray-400">(instructions sent to the agent)</span></label>
        <textarea rows={4} className="form-textarea" placeholder="You are a VMware automation agent…" {...register('system_prompt')} />
      </div>

      {testResult && <TestResult result={testResult} />}

      <div className="flex gap-3">
        <button type="submit" disabled={saveMutation.isPending} className="btn-primary">{saveMutation.isPending ? 'Saving…' : 'Save Configuration'}</button>
        <button type="button" onClick={testConn} className="btn-secondary">Test Connection</button>
      </div>
    </form>
  )
}

// ── Main Settings page ────────────────────────────────────────────────────────
export default function Settings() {
  const [activeTab, setActiveTab] = useState('vcenter')
  const ActiveIcon = TABS.find(t => t.id === activeTab)?.icon!

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure integrations for vCenter, AD, email, and AI agent.</p>
      </div>

      <div className="flex gap-6">
        {/* Tab sidebar */}
        <nav className="w-48 flex-shrink-0 space-y-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium text-left transition-colors ${activeTab === tab.id ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              <tab.icon className="h-5 w-5 flex-shrink-0" />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 card min-h-[400px]">
          {activeTab === 'vcenter' && <VCenterSettings />}
          {activeTab === 'ldap' && <LDAPSettings />}
          {activeTab === 'smtp' && <SMTPSettings />}
          {activeTab === 'ai' && <AIAgentSettings />}
        </div>
      </div>
    </div>
  )
}
