import React from 'react';
import { ShieldAlert, FileQuestion, AlertTriangle, WifiOff, Wrench, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export type ErrorType = '404' | '403' | '500' | 'offline' | 'maintenance';

export interface ErrorStateProps {
  type?: ErrorType;
  title?: string;
  description?: string;
  onRetry?: () => void;
  onBack?: () => void;
  className?: string;
}

export function ErrorState({
  type = '500',
  title,
  description,
  onRetry,
  onBack,
  className = '',
}: ErrorStateProps) {
  const defaults = {
    '404': {
      title: '404 - Page Not Found',
      description: 'The requested route or module does not exist in Nexus ERP.',
      icon: <FileQuestion className="w-12 h-12 text-slate-400 stroke-1" />,
      badge: 'Resource Missing',
    },
    '403': {
      title: '403 - Access Denied',
      description: 'You do not possess the required RBAC clearance for this operational section.',
      icon: <ShieldAlert className="w-12 h-12 text-rose-500 stroke-1" />,
      badge: 'Permission Restricted',
    },
    '500': {
      title: '500 - Application Exception',
      description: 'An unexpected processing error occurred. The system telemetry logged this event.',
      icon: <AlertTriangle className="w-12 h-12 text-amber-500 stroke-1" />,
      badge: 'Internal System Error',
    },
    offline: {
      title: 'Network Disconnected',
      description: 'Unable to reach Firestore database. Please check your internet connection.',
      icon: <WifiOff className="w-12 h-12 text-slate-400 stroke-1" />,
      badge: 'Offline Status',
    },
    maintenance: {
      title: 'Scheduled System Maintenance',
      description: 'Nexus ERP is undergoing routine database optimization. Back shorty.',
      icon: <Wrench className="w-12 h-12 text-indigo-500 stroke-1" />,
      badge: 'System Maintenance',
    },
  };

  const current = defaults[type];

  return (
    <div
      className={`bg-white border border-slate-200/90 rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto my-10 shadow-2xs font-sans ${className}`}
    >
      <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 mb-4">
        {current.badge}
      </span>

      <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-5 shadow-2xs">
        {current.icon}
      </div>

      <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2 leading-tight">
        {title || current.title}
      </h2>

      <p className="text-xs sm:text-sm text-slate-500 max-w-sm mb-8 leading-relaxed">
        {description || current.description}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {onBack && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
            onClick={onBack}
          >
            Return to Dashboard
          </Button>
        )}
        {onRetry && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={onRetry}
          >
            Retry Action
          </Button>
        )}
      </div>
    </div>
  );
}
