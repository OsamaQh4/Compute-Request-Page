import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  PlusCircleIcon,
  PencilSquareIcon,
  ClipboardDocumentListIcon,
  ArrowRightOnRectangleIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline'

export default function RequestPortal() {
  const navigate = useNavigate()
  const { user, logout, isAdmin } = useAuth()

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-brand-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ComputerDesktopIcon className="h-7 w-7 text-brand-600" />
            <span className="text-lg font-bold text-gray-900">VM Request Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/my-requests')}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-brand-600 transition-colors"
            >
              <ClipboardDocumentListIcon className="h-5 w-5" />
              My Requests
            </button>
            {isAdmin && (
              <button
                onClick={() => navigate('/admin/vms')}
                className="btn-secondary text-xs py-1.5"
              >
                Admin Console
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-gray-700 hidden sm:block">{user?.name}</span>
            </div>
            <button
              onClick={() => { logout(); navigate('/login') }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Sign out"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="mx-auto max-w-5xl px-6 pt-16 pb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">What would you like to do?</h1>
        <p className="mt-3 text-gray-500 text-base">
          Submit a compute request. All requests are subject to approval based on your organization's policies.
        </p>
      </div>

      {/* Cards */}
      <div className="mx-auto max-w-3xl px-6 pb-16 grid grid-cols-1 sm:grid-cols-2 gap-6">
        <button
          onClick={() => navigate('/request/provision')}
          className="group relative flex flex-col items-center text-center rounded-2xl bg-white border-2 border-transparent
                     p-8 shadow-sm hover:border-brand-500 hover:shadow-md transition-all duration-200"
        >
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 group-hover:bg-brand-100 transition-colors">
            <PlusCircleIcon className="h-9 w-9 text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Provision New VM</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Request a new virtual machine with custom CPU, memory, storage, network, and OS configuration.
          </p>
          <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:gap-2 transition-all">
            Get started →
          </span>
        </button>

        <button
          onClick={() => navigate('/request/edit')}
          className="group relative flex flex-col items-center text-center rounded-2xl bg-white border-2 border-transparent
                     p-8 shadow-sm hover:border-brand-500 hover:shadow-md transition-all duration-200"
        >
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-50 group-hover:bg-purple-100 transition-colors">
            <PencilSquareIcon className="h-9 w-9 text-purple-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Edit Existing VM</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Request resource changes (CPU, RAM, storage) or snapshot management on an existing virtual machine.
          </p>
          <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-purple-600 group-hover:gap-2 transition-all">
            Select VM →
          </span>
        </button>
      </div>

      {/* Info bar */}
      <div className="mx-auto max-w-3xl px-6 pb-16">
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-5 py-4 text-sm text-blue-700">
          <strong>Auto-approval policy:</strong> Edit requests with resource increases of ≤10% are automatically
          approved. Larger changes and all provision requests require administrator approval.
        </div>
      </div>
    </div>
  )
}
