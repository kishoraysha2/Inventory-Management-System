import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertProps {
  type?: AlertType;
  title?: string;
  message: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export function Alert({
  type = 'info',
  title,
  message,
  onClose,
  className = '',
}: AlertProps) {
  const styles = {
    success: {
      container: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
      titleColor: 'text-emerald-900',
    },
    error: {
      container: 'bg-rose-50 border-rose-200 text-rose-900',
      icon: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />,
      titleColor: 'text-rose-900',
    },
    warning: {
      container: 'bg-amber-50 border-amber-200 text-amber-900',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
      titleColor: 'text-amber-900',
    },
    info: {
      container: 'bg-blue-50 border-blue-200 text-blue-900',
      icon: <Info className="w-5 h-5 text-blue-600 shrink-0" />,
      titleColor: 'text-blue-900',
    },
  };

  const current = styles[type];

  return (
    <div
      className={`p-4 rounded-xl border flex items-start gap-3 shadow-2xs ${current.container} ${className}`}
      role="alert"
    >
      {current.icon}
      <div className="flex-1 min-w-0 text-xs sm:text-sm font-sans">
        {title && <h4 className={`font-bold mb-0.5 ${current.titleColor}`}>{title}</h4>}
        <div className="leading-relaxed opacity-90">{message}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-black/5 text-slate-500 hover:text-slate-800 transition cursor-pointer shrink-0"
          title="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
