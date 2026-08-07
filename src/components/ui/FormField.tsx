import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface FormFieldProps {
  label: string;
  id?: string;
  required?: boolean;
  error?: string;
  success?: string;
  helperText?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  id,
  required = false,
  error,
  success,
  helperText,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={`space-y-1 font-sans ${className}`}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1 select-none"
        >
          <span>{label}</span>
          {required && <span className="text-rose-600 font-extrabold">*</span>}
        </label>
        {success && (
          <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Valid</span>
          </span>
        )}
      </div>

      <div className="relative">{children}</div>

      {error ? (
        <p className="text-xs text-rose-600 font-medium flex items-center gap-1 mt-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-[11px] text-slate-500 font-normal mt-0.5">{helperText}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  success?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, success, className = '', ...props }, ref) => {
    let borderClass = 'border-slate-300 focus:border-blue-600 focus:ring-blue-600/20';
    if (error) borderClass = 'border-rose-400 focus:border-rose-600 focus:ring-rose-600/20 bg-rose-50/30';
    else if (success) borderClass = 'border-emerald-400 focus:border-emerald-600 focus:ring-emerald-600/20 bg-emerald-50/30';

    return (
      <input
        ref={ref}
        className={`w-full px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium rounded-xl border transition-all duration-150 focus:outline-2 focus:outline-offset-1 focus:ring-2 disabled:bg-slate-100 disabled:text-slate-500 shadow-2xs opacity-100 ${borderClass} ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
