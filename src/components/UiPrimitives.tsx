import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className='mb-6 flex flex-wrap items-end justify-between gap-3'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100'>
          {title}
        </h1>
        {subtitle && (
          <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300/80 bg-white/50 px-6 py-14 text-center dark:border-gray-700 dark:bg-gray-900/40'>
      {icon && (
        <div className='mb-4 text-gray-400 dark:text-gray-500'>{icon}</div>
      )}
      <p className='text-base font-medium text-gray-700 dark:text-gray-200'>
        {title}
      </p>
      {description && (
        <p className='mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400'>
          {description}
        </p>
      )}
      {action && <div className='mt-5'>{action}</div>}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      {label && (
        <span className='text-sm text-gray-600 dark:text-gray-300'>
          {label}
        </span>
      )}
      <span className='relative inline-flex'>
        <input
          type='checkbox'
          className='peer sr-only'
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className='h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-green-500 dark:bg-gray-600' />
        <span className='absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4' />
      </span>
    </label>
  );
}

export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className='grid grid-cols-3 gap-4 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-8'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='animate-pulse'>
          <div className='aspect-[2/3] w-full rounded-lg bg-gray-200/80 dark:bg-gray-800' />
          <div className='mt-2 h-4 w-3/4 rounded bg-gray-200/80 dark:bg-gray-800' />
        </div>
      ))}
    </div>
  );
}
