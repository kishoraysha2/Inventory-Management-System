import React from 'react';
import { Database, Search, FileQuestion, Inbox, Plus } from 'lucide-react';
import { Button } from './Button';

export type EmptyStateType = 'no-data' | 'no-results' | 'no-records' | 'filtered';

export interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  type = 'no-data',
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className = '',
}: EmptyStateProps) {
  const defaults = {
    'no-data': {
      title: 'No Data Available',
      description: 'There are no records found in this repository section yet.',
      icon: <Inbox className="w-10 h-10 text-slate-400 stroke-1" />,
    },
    'no-results': {
      title: 'No Matching Search Results',
      description: 'Try adjusting your search query or removing active filters.',
      icon: <Search className="w-10 h-10 text-slate-400 stroke-1" />,
    },
    'no-records': {
      title: 'No Records Found',
      description: 'The requested transactional records could not be retrieved.',
      icon: <Database className="w-10 h-10 text-slate-400 stroke-1" />,
    },
    filtered: {
      title: 'Filter Yielded No Data',
      description: 'Try resetting date range or category parameters to expand scope.',
      icon: <FileQuestion className="w-10 h-10 text-slate-400 stroke-1" />,
    },
  };

  const current = defaults[type];

  return (
    <div
      className={`bg-white border border-slate-200/90 rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto my-6 shadow-2xs ${className}`}
    >
      <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-4 shadow-2xs">
        {icon || current.icon}
      </div>
      <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1.5 font-sans">
        {title || current.title}
      </h3>
      <p className="text-xs sm:text-sm text-slate-500 max-w-xs mb-6 leading-relaxed font-sans">
        {description || current.description}
      </p>
      {actionLabel && onAction && (
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
