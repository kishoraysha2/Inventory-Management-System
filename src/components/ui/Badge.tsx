import React from 'react';
import { Shield, Crown, CheckCircle2, AlertTriangle, AlertCircle, Info, Tag } from 'lucide-react';

export type BadgeVariant =
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'neutral'
  | 'role'
  | 'status';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  label?: string;
  role?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
  children?: React.ReactNode;
  className?: string;
}

export function Badge({
  variant = 'neutral',
  label,
  role,
  icon,
  size = 'md',
  children,
  className = '',
  ...props
}: BadgeProps) {
  const baseClasses =
    'inline-flex items-center gap-1 rounded-full font-extrabold uppercase tracking-wider select-none shrink-0 border shadow-2xs';

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[9px]',
    md: 'px-2.5 py-0.5 text-[10px]',
  };

  // Special Owner styling with gold gradient and crown icon
  if (role === 'owner' || variant === 'role' && role === 'owner') {
    return (
      <span
        className={`${baseClasses} ${sizeClasses[size]} bg-gradient-to-r from-amber-500 to-yellow-500 text-white border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.35)] ${className}`}
        {...props}
      >
        <Crown className="w-3 h-3 text-white fill-amber-100 shrink-0 animate-pulse" />
        <span className="leading-none">{label || 'Owner'}</span>
      </span>
    );
  }

  // Role badges
  if (variant === 'role' || role) {
    const roleKey = (role || label || '').toLowerCase();
    let roleStyles = 'bg-slate-100 border-slate-200 text-slate-700';
    if (roleKey === 'admin') roleStyles = 'bg-emerald-50 border-emerald-200 text-emerald-800';
    else if (roleKey === 'accountant') roleStyles = 'bg-blue-50 border-blue-200 text-blue-800';
    else if (roleKey === 'cashier') roleStyles = 'bg-amber-50 border-amber-200 text-amber-800';

    return (
      <span className={`${baseClasses} ${sizeClasses[size]} ${roleStyles} ${className}`} {...props}>
        <Shield className="w-2.5 h-2.5 shrink-0" />
        <span className="leading-none">{label || role}</span>
      </span>
    );
  }

  const variantStyles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    danger: 'bg-rose-50 border-rose-200 text-rose-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    neutral: 'bg-slate-100 border-slate-200 text-slate-700',
    status: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    role: 'bg-slate-100 border-slate-200 text-slate-700',
  };

  return (
    <span
      className={`${baseClasses} ${sizeClasses[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {icon}
      <span className="leading-none">{children || label}</span>
    </span>
  );
}
