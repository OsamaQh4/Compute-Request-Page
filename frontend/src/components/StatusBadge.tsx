import clsx from 'clsx'

const config: Record<string, { label: string; classes: string }> = {
  pending:       { label: 'Pending',        classes: 'bg-yellow-100 text-yellow-800' },
  approved:      { label: 'Approved',       classes: 'bg-blue-100 text-blue-800' },
  auto_approved: { label: 'Auto-Approved',  classes: 'bg-teal-100 text-teal-800' },
  completed:     { label: 'Completed',      classes: 'bg-green-100 text-green-800' },
  denied:        { label: 'Denied',         classes: 'bg-red-100 text-red-800' },
  failed:        { label: 'Failed',         classes: 'bg-red-100 text-red-800' },
  POWERED_ON:    { label: 'On',             classes: 'bg-green-100 text-green-800' },
  POWERED_OFF:   { label: 'Off',            classes: 'bg-gray-100 text-gray-700' },
  SUSPENDED:     { label: 'Suspended',      classes: 'bg-orange-100 text-orange-800' },
  UNKNOWN:       { label: 'Unknown',        classes: 'bg-gray-100 text-gray-500' },
}

export default function StatusBadge({ status }: { status: string }) {
  const cfg = config[status] ?? { label: status, classes: 'bg-gray-100 text-gray-700' }
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', cfg.classes)}>
      {cfg.label}
    </span>
  )
}
