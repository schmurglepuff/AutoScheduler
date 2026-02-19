import { type InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        )}
        <input
          ref={ref}
          className={`rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800
            px-3 py-2 text-sm text-gray-900 dark:text-gray-100
            focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent
            placeholder:text-gray-400 dark:placeholder:text-gray-500
            ${error ? 'border-red-500' : ''} ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
