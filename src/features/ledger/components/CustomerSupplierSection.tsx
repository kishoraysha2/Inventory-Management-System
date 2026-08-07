import React from 'react';
import { User, Truck, Phone } from 'lucide-react';
import { AppPermissions } from '../../../hooks/usePermission';
import { formatCurrency } from '../../../utils/currencyFormatter';

interface CustomerSupplierSectionProps {
  activeSegment: 'customers' | 'suppliers';
  loading: boolean;
  searchedCustomers: any[];
  searchedSuppliers: any[];
  permissions: AppPermissions;
  handleOpenRecordModal: (personId?: string) => void;
}

export default function CustomerSupplierSection({
  activeSegment,
  loading,
  searchedCustomers,
  searchedSuppliers,
  permissions,
  handleOpenRecordModal
}: CustomerSupplierSectionProps) {
  return (
    <div id="customer-supplier-segment-list" className="bg-white rounded-[2rem] border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6 flex flex-col">
      <div className="pb-2 border-b border-slate-100">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
          {activeSegment === 'customers' ? (
            <>
              <User className="h-4.5 w-4.5 text-indigo-600" />
              <span>Customer Section</span>
            </>
          ) : (
            <>
              <Truck className="h-4.5 w-4.5 text-indigo-600" />
              <span>Supplier Section</span>
            </>
          )}
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {activeSegment === 'customers'
            ? 'Active accounts receivable ledger'
            : 'Active accounts trade payable ledger'}
        </p>
      </div>

      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-16 border border-slate-100 rounded-2xl animate-pulse bg-slate-50"></div>
            ))}
          </div>
        ) : activeSegment === 'customers' ? (
          searchedCustomers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-xs font-bold text-slate-600">No customers found</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Adjust filter keywords to search database.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* SECTION 1: Outstanding Due */}
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold flex items-center gap-1.5 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  <span>Customers With Outstanding Due</span>
                  <span className="ml-auto bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-mono">
                    {searchedCustomers.filter(c => (c.customerCredit || 0) === 0).length}
                  </span>
                </h4>
                {searchedCustomers.filter(c => (c.customerCredit || 0) === 0).length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic pl-3.5 py-2">No customers with outstanding due balances.</p>
                ) : (
                  <div className="divide-y divide-slate-100 bg-slate-50/20 rounded-2xl p-3 border border-slate-100">
                    {searchedCustomers.filter(c => (c.customerCredit || 0) === 0).map((c) => (
                      <div key={c.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group transition">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600 transition">{c.name}</h4>
                          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
                            <span className="inline-flex shrink-0 px-1 py-0.5 text-[8px] bg-white border border-slate-100 text-slate-400 font-bold rounded">
                              ID: {c.id}
                            </span>
                            {c.phone ? (
                              <span className="inline-flex items-center gap-1 text-[9px] text-slate-500 font-medium truncate">
                                <Phone className="h-2 w-2 text-slate-400" />
                                <span className="truncate">{c.phone}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Due Balance</p>
                            <span className={`text-xs font-bold block mt-1 ${c.dueBalance > 0 ? 'text-orange-600 font-extrabold' : 'text-slate-400 font-normal'}`}>
                              {formatCurrency(c.dueBalance)}
                            </span>
                          </div>
                          <div className="text-right border-l border-slate-100 pl-3">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Customer Credit</p>
                            <span className={`text-xs font-bold block mt-1 ${(c.customerCredit || 0) > 0 ? 'text-emerald-600 font-extrabold' : 'text-slate-400 font-normal'}`}>
                              {formatCurrency(c.customerCredit || 0)}
                            </span>
                          </div>
                          {permissions.createPayment && c.dueBalance > 0 && (
                            <button
                              type="button"
                              onClick={() => handleOpenRecordModal(c.id)}
                              className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-150 border border-indigo-100 text-indigo-600 font-bold text-[10px] cursor-pointer transition shrink-0"
                            >
                              Pay
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 2: Credit Balance */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold flex items-center gap-1.5 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Customers With Credit Balance</span>
                  <span className="ml-auto bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-mono">
                    {searchedCustomers.filter(c => (c.customerCredit || 0) > 0).length}
                  </span>
                </h4>
                {searchedCustomers.filter(c => (c.customerCredit || 0) > 0).length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic pl-3.5 py-2">No customers with credit balances.</p>
                ) : (
                  <div className="divide-y divide-slate-100 bg-slate-50/20 rounded-2xl p-3 border border-slate-100">
                    {searchedCustomers.filter(c => (c.customerCredit || 0) > 0).map((c) => (
                      <div key={c.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group transition">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-emerald-600 transition">{c.name}</h4>
                          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
                            <span className="inline-flex shrink-0 px-1 py-0.5 text-[8px] bg-white border border-slate-100 text-slate-400 font-bold rounded">
                              ID: {c.id}
                            </span>
                            {c.phone ? (
                              <span className="inline-flex items-center gap-1 text-[9px] text-slate-500 font-medium truncate">
                                <Phone className="h-2 w-2 text-slate-400" />
                                <span className="truncate">{c.phone}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Due Balance</p>
                            <span className={`text-xs font-bold block mt-1 ${c.dueBalance > 0 ? 'text-orange-600 font-extrabold' : 'text-slate-400 font-normal'}`}>
                              {formatCurrency(c.dueBalance)}
                            </span>
                          </div>
                          <div className="text-right border-l border-slate-100 pl-3">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Customer Credit</p>
                            <span className="text-xs font-bold block mt-1 text-emerald-600 font-extrabold">
                              {formatCurrency(c.customerCredit || 0)}
                            </span>
                          </div>
                          {permissions.createPayment && c.dueBalance > 0 && (
                            <button
                              type="button"
                              onClick={() => handleOpenRecordModal(c.id)}
                              className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-150 border border-indigo-100 text-indigo-600 font-bold text-[10px] cursor-pointer transition shrink-0"
                            >
                              Pay
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          searchedSuppliers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-xs font-bold text-slate-600">No suppliers found</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Adjust filter keywords to search database.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {searchedSuppliers.map((s) => {
                const owed = s.dueBalance ?? 0;
                return (
                  <div key={s.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group transition">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600 transition">{s.name}</h4>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                        <span className="inline-flex shrink-0 px-1.5 py-0.5 text-[9px] bg-slate-50 border border-slate-100 text-slate-400 font-bold rounded-md">
                          ID: {s.id}
                        </span>
                        {s.phone ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium truncate">
                            <Phone className="h-2.5 w-2.5 text-slate-400" />
                            <span className="truncate">{s.phone}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Owed Balance</p>
                        <span className={`text-xs font-bold block mt-1 ${owed > 0 ? 'text-indigo-600' : 'text-slate-400 font-normal'}`}>
                          {formatCurrency(owed)}
                        </span>
                      </div>
                      {permissions.createPayment && owed > 0 && (
                        <button
                          type="button"
                          onClick={() => handleOpenRecordModal(s.id)}
                          className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-150 border border-indigo-100 text-indigo-600 font-bold text-[10px] cursor-pointer transition shrink-0"
                        >
                          Settle
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
