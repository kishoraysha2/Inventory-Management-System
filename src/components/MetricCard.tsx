import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export function ResponsiveKPIValue({ 
  value, 
  className = "text-slate-900" 
}: { 
  value: string | number; 
  className?: string; 
}) {
  if (typeof value === 'number') {
    return (
      <span className={`font-mono font-black text-[clamp(1.1rem,2vw,1.65rem)] tracking-tight leading-tight ${className}`}>
        {value.toLocaleString()}
      </span>
    );
  }

  const str = String(value).trim();
  const trailingMatch = str.match(/^(.*?)\s+([A-Za-z\u0600-\u06FF]+)$/);
  const leadingMatch = str.match(/^([$€£¥₹]|[A-Za-z\u0600-\u06FF]+\.?)\s*(.*)$/);

  if (trailingMatch) {
    const [, mainNum, unit] = trailingMatch;
    return (
      <div className="flex items-baseline flex-wrap gap-x-1.5 min-w-0 max-w-full">
        <span className={`font-mono font-black text-[clamp(1.1rem,2vw,1.65rem)] tracking-tight leading-tight break-all ${className}`}>
          {mainNum}
        </span>
        <span className="font-sans text-[clamp(0.65rem,1vw,0.825rem)] font-extrabold uppercase tracking-wider text-[#93A3B8] shrink-0">
          {unit}
        </span>
      </div>
    );
  }

  if (leadingMatch) {
    const [, symbol, mainNum] = leadingMatch;
    return (
      <div className="flex items-baseline flex-wrap gap-x-1.5 min-w-0 max-w-full">
        <span className="font-sans text-[clamp(0.65rem,1vw,0.825rem)] font-extrabold uppercase tracking-wider text-[#93A3B8] shrink-0">
          {symbol}
        </span>
        <span className={`font-mono font-black text-[clamp(1.1rem,2vw,1.65rem)] tracking-tight leading-tight break-all ${className}`}>
          {mainNum}
        </span>
      </div>
    );
  }

  return (
    <span className={`font-mono font-black text-[clamp(1.1rem,2vw,1.65rem)] tracking-tight leading-tight break-all ${className}`}>
      {str}
    </span>
  );
}

interface MetricCardProps {
  id?: string;
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtext?: string;
  trend?: string;
  trendType?: 'positive' | 'negative' | 'neutral';
  colorClass?: string;
  valueColorClass?: string;
}

export default function MetricCard({
  id,
  title,
  value,
  icon,
  subtext,
  trend,
  trendType = 'neutral',
  colorClass = 'border-slate-200/90 bg-white',
  valueColorClass = 'text-slate-900',
}: MetricCardProps) {
  return (
    <motion.div
      id={id || `metric-${title.replace(/\s+/g, '-').toLowerCase()}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 lg:p-6 shadow-2xs transition-all duration-200 hover:shadow-xs flex flex-col justify-between w-full min-w-0 ${cn(
        colorClass
      )}`}
    >
      <div className="flex items-start justify-between gap-3 w-full min-w-0">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[clamp(0.625rem,0.85vw,0.725rem)] font-bold tracking-wider text-slate-500 uppercase leading-snug whitespace-nowrap truncate">
            {title}
          </p>
          <div className="mt-1 min-w-0">
            <ResponsiveKPIValue value={value} className={valueColorClass} />
          </div>
        </div>
        <div className="rounded-xl bg-slate-50/80 p-2 sm:p-2.5 text-slate-600 border border-slate-200/60 shrink-0 flex items-center justify-center">
          {icon}
        </div>
      </div>

      {(trend || subtext) && (
        <div className="mt-3 pt-2.5 border-t border-slate-100/80 flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0 w-full justify-between">
          {trend && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[clamp(0.55rem,0.725vw,0.65rem)] font-extrabold uppercase tracking-wide shrink-0 ${
                trendType === 'positive'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                  : trendType === 'negative'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                  : 'bg-slate-100 text-slate-600 border border-slate-200/60'
              }`}
            >
              {trend}
            </span>
          )}
          {subtext && (
            <span className="text-[clamp(0.625rem,0.8vw,0.725rem)] font-medium text-slate-400 truncate max-w-full">
              {subtext}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
