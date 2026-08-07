import React from 'react';
import { Filter, Search, RotateCcw } from 'lucide-react';

interface LedgerFiltersProps {
  activeSegment: 'customers' | 'suppliers';
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  personFilter: string;
  setPersonFilter: (val: string) => void;
  startDate: string;
  setStartDate: (val: string) => void;
  endDate: string;
  setEndDate: (val: string) => void;
  handleResetFilters: () => void;
}

export default function LedgerFilters({
  activeSegment,
  searchQuery,
  setSearchQuery,
  personFilter,
  setPersonFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  handleResetFilters
}: LedgerFiltersProps) {
  return (
    <div id="ledger-filters-panel" className="bg-white rounded-[2rem] border border-slate-200 p-6 sm:p-7 space-y-5">
      <h3 className="font-sans text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1.5 pb-3 border-b border-slate-100">
        <Filter className="h-4 w-4 text-indigo-550" />
        <span>Search Filters</span>
      </h3>

      {/* Filter by Receipt Number/General Search */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
          General Query (Receipt / ID)
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="E.g., RC-4587 or payment date"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-505 outline-none"
          />
        </div>
      </div>

      {/* Filter by Person Choice */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
          {activeSegment === 'customers' ? 'Search Customer' : 'Search Supplier'}
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={activeSegment === 'customers' ? 'E.g., Acmet Corp' : 'E.g., Global Dist'}
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-505 outline-none"
          />
        </div>
      </div>

      {/* Start Date */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Start Date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs font-semibold text-slate-800 transition focus:border-indigo-500 focus:bg-white outline-none cursor-pointer"
        />
      </div>

      {/* End Date */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">End Date</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs font-semibold text-slate-800 transition focus:border-indigo-500 focus:bg-white outline-none cursor-pointer"
        />
      </div>

      {/* Actions for Filters */}
      <div className="pt-2 flex gap-2">
        <button
          type="button"
          onClick={handleResetFilters}
          className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition font-bold text-[10px] uppercase tracking-wide flex items-center justify-center gap-1 cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
}
