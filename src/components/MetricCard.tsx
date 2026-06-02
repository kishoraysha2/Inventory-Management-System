import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface MetricCardProps {
  id?: string;
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtext?: string;
  trend?: string;
  trendType?: 'positive' | 'negative' | 'neutral';
  colorClass?: string;
}

export default function MetricCard({
  id,
  title,
  value,
  icon,
  subtext,
  trend,
  trendType = 'neutral',
  colorClass = 'border-slate-100',
}: MetricCardProps) {
  return (
    <motion.div
      id={id || `metric-${title.replace(/\s+/g, '-').toLowerCase()}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative overflow-hidden rounded-[2rem] border bg-white p-6 sm:p-8 shadow-xs transition-all duration-300 hover:shadow-md ${cn(
        'border-slate-200',
        colorClass
      )}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
            {title}
          </p>
          <h3 className="mt-2 font-sans text-3xl font-bold tracking-tight text-slate-800">
            {value}
          </h3>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-slate-600 border border-slate-100">
          {icon}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {trend && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
              trendType === 'positive'
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                : trendType === 'negative'
                ? 'bg-rose-50 text-rose-600 border border-rose-100'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            {trend}
          </span>
        )}
        {subtext && <span className="text-xs text-slate-400">{subtext}</span>}
      </div>
    </motion.div>
  );
}
