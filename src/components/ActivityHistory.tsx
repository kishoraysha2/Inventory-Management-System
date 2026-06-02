import { motion } from 'motion/react';
import { PlusCircle, FileCode, Trash2, ArrowUpDown, RefreshCcw } from 'lucide-react';
import { ActivityLog } from '../types';

interface ActivityHistoryProps {
  id?: string;
  logs: ActivityLog[];
  onClear: () => void;
}

export default function ActivityHistory({
  id = 'activity-history-panel',
  logs,
  onClear,
}: ActivityHistoryProps) {
  const getLogIcon = (type: ActivityLog['type']) => {
    switch (type) {
      case 'add':
        return <PlusCircle className="h-4 w-4 text-emerald-400" />;
      case 'edit':
        return <FileCode className="h-4 w-4 text-indigo-450" />;
      case 'delete':
        return <Trash2 className="h-4 w-4 text-rose-400" />;
      case 'stock_change':
        return <ArrowUpDown className="h-4 w-4 text-amber-400" />;
      default:
        return <ArrowUpDown className="h-4 w-4 text-slate-400" />;
    }
  };

  const getLogBg = (type: ActivityLog['type']) => {
    switch (type) {
      case 'add':
        return 'bg-emerald-950/40 border-emerald-500/20';
      case 'edit':
        return 'bg-indigo-955/40 bg-indigo-950/40 border-indigo-500/20';
      case 'delete':
        return 'bg-rose-950/40 border-rose-500/20';
      case 'stock_change':
        return 'bg-amber-950/40 border-amber-500/20';
      default:
        return 'bg-slate-850 border-slate-700';
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Just now';
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  // Sort logs by newest first
  const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div id={id} className="rounded-[2rem] border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-sm flex flex-col h-full text-slate-300">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
        <div>
          <h4 className="font-sans text-sm font-bold tracking-tight text-white uppercase tracking-wider">
            System Audit Log
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">Chronological history of stock adjustments</p>
        </div>
        {logs.length > 0 && (
          <button
            id="clear-logs-button"
            type="button"
            onClick={onClear}
            className="text-[11px] font-bold tracking-widest uppercase text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 px-2.5 py-1 rounded transition"
          >
            Clear Log
          </button>
        )}
      </div>

      <div className="flex-grow overflow-y-auto max-h-[350px] pr-1 space-y-4">
        {sortedLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-slate-500">
            <RefreshCcw className="h-8 w-8 text-slate-700 animate-spin mb-2" style={{ animationDuration: '4s' }} />
            <p className="text-xs font-semibold text-slate-400">No recent mutations recorded</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Adjustments will log automatically</p>
          </div>
        ) : (
          <div className="relative border-l border-slate-800 pl-4 ml-2 space-y-5">
            {sortedLogs.map((log, index) => (
              <motion.div
                id={`log-item-${log.id}`}
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="relative group animate-none"
              >
                {/* Node bubble */}
                <div
                  className={`absolute -left-[25px] top-1 rounded-full border p-1 ${getLogBg(log.type)} shadow-xs`}
                >
                  {getLogIcon(log.type)}
                </div>

                <div className="flex items-start justify-between gap-2 text-xs">
                  <div>
                    <p className="font-bold text-slate-200 tracking-tight">{log.itemName}</p>
                    <p className="mt-0.5 text-slate-400 leading-relaxed font-sans">{log.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-[10px] text-slate-500 font-medium">
                      {formatTime(log.timestamp)}
                    </p>
                    <p className="text-[9px] text-slate-550 text-slate-500">{formatDate(log.timestamp)}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
