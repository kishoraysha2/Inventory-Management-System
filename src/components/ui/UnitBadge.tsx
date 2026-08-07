import React from 'react';

interface UnitBadgeProps {
  unitCode?: string;
  unitName?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const UnitBadge: React.FC<UnitBadgeProps> = ({
  unitCode,
  unitName,
  className = '',
  size = 'md',
}) => {
  const displayCode = unitCode?.trim() || unitName?.trim() || 'No Unit';

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-2.5 py-1',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200/80 uppercase tracking-wide whitespace-nowrap ${sizeClasses} ${className}`}
      title={unitName ? `${unitName} (${displayCode})` : displayCode}
    >
      {displayCode}
    </span>
  );
};

export default UnitBadge;
