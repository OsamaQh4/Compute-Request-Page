import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import { ComputerDesktopIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

interface FormValues {
  username: string
  password: string
}

export default function Login() {
  const { login, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>()

  const onSubmit = async (data: FormValues) => {
    setLoading(true)
    try {
      await login(data.username, data.password)
      // navigation handled in App.tsx via redirect on user state
      navigate(isAdmin ? '/admin/vms' : '/', { replace: true })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 px-4">
      <div className="w-full max-w-sm">
        {/* Logo block */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
            <ComputerDesktopIcon className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">VM Request Portal</h1>
          <p className="mt-1 text-sm text-brand-200">Sign in with your corporate credentials</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="form-label">Email address</label>
              <input
                type="text"
                placeholder="you@domain.com"
                className="form-input"
                {...register('username', { required: 'Email is required' })}
              />
              {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>}
            </div>

            <div>
              <label className="form-label">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="form-input"
                {...register('password', { required: 'Password is required' })}
              />
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-gray-400">
            Authentication powered by Active Directory
          </p>
        </div>

        {/* Demo hint */}
        <p className="mt-4 text-center text-xs text-brand-200">
          Demo: use <span className="font-mono bg-white/10 px-1 rounded">admin@demo.local</span> or <span className="font-mono bg-white/10 px-1 rounded">user@demo.local</span> with any password
        </p>
      </div>
    </div>
  )
}
