import React, { useState, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';
import { LedgerEntry } from '../types';
import { formatCurrency } from '../utils/currencyFormatter';
import { getNextPostingNumber, commitNextPostingNumber, resolveSystemAccount, ensureSystemAccountsExist, validateJournalBalance } from '../lib/postingEngine';
import { Scale, CheckCircle2, AlertCircle, RefreshCw, X, ArrowRight, DollarSign, Calendar, FileText } from 'lucide-react';

interface VatSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  ledgerEntries: LedgerEntry[];
  coa: any[];
  onSuccess?: () => void;
}

export default function VatSettlementModal({
  isOpen,
  onClose,
  ledgerEntries,
  coa,
  onSuccess
}: VatSettlementModalProps) {
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [settlementMemo, setSettlementMemo] = useState('VAT Period Tax Settlement & Clearing');
  const [settlementAccountMode, setSettlementAccountMode] = useState<'tax_account' | 'cash'>('tax_account');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Calculate live balances for Output VAT (2400) and Input VAT (1400) from active posted ledger entries
  const { outputVatBalance, inputVatBalance, netVatPosition } = useMemo(() => {
    let outputCredits = 0;
    let outputDebits = 0;
    let inputDebits = 0;
    let inputCredits = 0;

    ledgerEntries.forEach(entry => {
      if (entry.postingStatus !== 'POSTED') return;
      entry.lines.forEach(line => {
        if (line.accountCode === '2400') {
          outputCredits += line.credit || 0;
          outputDebits += line.debit || 0;
        } else if (line.accountCode === '1400') {
          inputDebits += line.debit || 0;
          inputCredits += line.credit || 0;
        }
      });
    });

    const outputVat = Math.max(0, outputCredits - outputDebits);
    const inputVat = Math.max(0, inputDebits - inputCredits);
    const netVat = outputVat - inputVat;

    return {
      outputVatBalance: parseFloat(outputVat.toFixed(2)),
      inputVatBalance: parseFloat(inputVat.toFixed(2)),
      netVatPosition: parseFloat(netVat.toFixed(2))
    };
  }, [ledgerEntries]);

  if (!isOpen) return null;

  const handleExecuteSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (outputVatBalance <= 0 && inputVatBalance <= 0) {
      setError("There are currently no active Output VAT or Input VAT balances to settle.");
      return;
    }

    setSubmitting(true);

    try {
      const currentUserEmail = auth.currentUser?.email || 'admin_01@nexus.erp';
      const timestamp = new Date().toISOString();
      const year = new Date(settlementDate).getFullYear() || 2026;
      const periodMonth = String(new Date(settlementDate).getMonth() + 1).padStart(2, '0');
      const accountingPeriod = `${year}-${periodMonth}`;

      const outputVatAcc = resolveSystemAccount('OUTPUT_VAT', coa);
      const inputVatAcc = resolveSystemAccount('INPUT_VAT', coa);

      let targetAccountCode = '2410';
      let targetAccountName = 'Net VAT Payable';
      let targetAccountId = 'acc-vat-payable-net';

      if (settlementAccountMode === 'cash') {
        const cashAcc = resolveSystemAccount('CASH', coa);
        targetAccountCode = cashAcc.code;
        targetAccountName = cashAcc.name;
        targetAccountId = cashAcc.id;
      } else {
        if (netVatPosition < 0) {
          targetAccountCode = '1410';
          targetAccountName = 'Net VAT Refund Receivable';
          targetAccountId = 'acc-vat-refund-net';
        }
      }

      const lines = [];

      // 1. Debit Output VAT Payable (2400) to clear collected tax liability
      if (outputVatBalance > 0) {
        lines.push({
          accountId: outputVatAcc.id,
          accountCode: outputVatAcc.code,
          accountName: outputVatAcc.name,
          debit: outputVatBalance,
          credit: 0,
          baseCurrencyDebit: outputVatBalance,
          baseCurrencyCredit: 0
        });
      }

      // 2. Credit Input VAT Receivable (1400) to clear recoverable tax asset
      if (inputVatBalance > 0) {
        lines.push({
          accountId: inputVatAcc.id,
          accountCode: inputVatAcc.code,
          accountName: inputVatAcc.name,
          debit: 0,
          credit: inputVatBalance,
          baseCurrencyDebit: 0,
          baseCurrencyCredit: inputVatBalance
        });
      }

      // 3. Balancing entry for Net VAT Position
      if (netVatPosition > 0) {
        // Output VAT > Input VAT: Credit Net VAT Payable / Cash for net difference
        lines.push({
          accountId: targetAccountId,
          accountCode: targetAccountCode,
          accountName: targetAccountName,
          debit: 0,
          credit: netVatPosition,
          baseCurrencyDebit: 0,
          baseCurrencyCredit: netVatPosition
        });
      } else if (netVatPosition < 0) {
        // Input VAT > Output VAT: Debit Net VAT Refund / Cash for refund difference
        const refundAmt = Math.abs(netVatPosition);
        lines.push({
          accountId: targetAccountId,
          accountCode: targetAccountCode,
          accountName: targetAccountName,
          debit: refundAmt,
          credit: 0,
          baseCurrencyDebit: refundAmt,
          baseCurrencyCredit: 0
        });
      }

      // Mandatory Enterprise Journal Integrity Validation (Phase X)
      validateJournalBalance(lines);

      await runTransaction(db, async (transaction) => {
        const { postingNumber, nextVal } = await getNextPostingNumber(transaction, 'JV', year);

        const settlementId = `vat-settle-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const entryId = `le-vat-settlement-${settlementId}`;

        const ledgerEntry: LedgerEntry = {
          id: entryId,
          postingNumber,
          companyId: 'comp-default',
          branchId: 'branch-main',
          fiscalYear: year,
          accountingPeriod,
          sourceModule: 'TAX' as any,
          postingStatus: 'POSTED',
          currency: 'USD',
          exchangeRate: 1,
          baseCurrencyCode: 'USD',
          version: 1,
          narration: `VAT Period Settlement: Output VAT ($${outputVatBalance}) - Input VAT ($${inputVatBalance}) -> Net ${netVatPosition >= 0 ? 'Payable' : 'Refund'} ($${Math.abs(netVatPosition)}). Memo: ${settlementMemo}`,
          createdFrom: settlementId,
          approvalStatus: 'APPROVED',
          postingDate: new Date(settlementDate + 'T12:00:00Z').toISOString(),
          createdAt: timestamp,
          createdBy: currentUserEmail,
          lines
        };

        transaction.set(doc(db, 'ledgerEntries', entryId), ledgerEntry);

        // Commit posting number sequence
        commitNextPostingNumber(transaction, 'JV', nextVal);

        // Ensure COA exists
        const currentCoaIds = coa.map(c => c.id);
        await ensureSystemAccountsExist(transaction, currentCoaIds);

        // Log audit trail
        const syslogId = `syslog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        transaction.set(doc(db, 'Logs', syslogId), {
          id: syslogId,
          action: "VAT Settlement Executed",
          user: currentUserEmail,
          timestamp,
          details: `Executed VAT Tax Period Settlement JV ${postingNumber}: Output VAT $${outputVatBalance}, Input VAT $${inputVatBalance}, Net $${netVatPosition}.`
        });
      });

      setSuccessMsg(`VAT Period Settlement successfully executed! Posted Journal Voucher JV entry.`);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error("VAT Settlement failed:", err);
      setError(err?.message || "Failed to process VAT settlement. Please retry.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-150 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">VAT Period Settlement Engine</h2>
              <p className="text-xs text-slate-400 font-mono">Tax Authority Output vs Input Clearing Voucher</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleExecuteSettlement} className="p-6 space-y-5">
          
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span className="font-semibold">{successMsg}</span>
            </div>
          )}

          {/* SUMMARY CARDS */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-rose-50/50 border border-rose-200/60 rounded-xl p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 block">Output VAT (2400)</span>
              <span className="text-lg font-black text-rose-700 font-mono mt-1 block">{formatCurrency(outputVatBalance)}</span>
              <span className="text-[9px] text-rose-500 block">Collected on Sales</span>
            </div>

            <div className="bg-indigo-50/50 border border-indigo-200/60 rounded-xl p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">Input VAT (1400)</span>
              <span className="text-lg font-black text-indigo-700 font-mono mt-1 block">{formatCurrency(inputVatBalance)}</span>
              <span className="text-[9px] text-indigo-500 block">Paid on Expenses/Stock</span>
            </div>

            <div className={`border rounded-xl p-3 text-center ${netVatPosition >= 0 ? 'bg-amber-50/50 border-amber-200/60' : 'bg-emerald-50/50 border-emerald-200/60'}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">Net VAT Position</span>
              <span className={`text-lg font-black font-mono mt-1 block ${netVatPosition >= 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {formatCurrency(Math.abs(netVatPosition))}
              </span>
              <span className="text-[9px] text-slate-500 block font-semibold">
                {netVatPosition >= 0 ? 'Net VAT Payable' : 'Net Refund Claim'}
              </span>
            </div>
          </div>

          {/* FORM INPUTS */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Settlement Date *</label>
              <input
                type="date"
                required
                value={settlementDate}
                onChange={(e) => setSettlementDate(e.target.value)}
                className="px-3 py-2 w-full text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Settlement Mode</label>
              <select
                value={settlementAccountMode}
                onChange={(e) => setSettlementAccountMode(e.target.value as any)}
                className="px-3 py-2 w-full text-sm border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="tax_account">Accrue to Tax Authority Account (2410/1410)</option>
                <option value="cash">Immediate Cash / Bank Clearing (1010)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Narration / Memo</label>
            <input
              type="text"
              required
              value={settlementMemo}
              onChange={(e) => setSettlementMemo(e.target.value)}
              className="px-3 py-2 w-full text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* DOUBLE ENTRY JOURNAL PREVIEW */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              Settlement Journal Voucher Preview (JV)
            </h4>

            <div className="space-y-1.5 text-xs font-mono pt-1">
              {outputVatBalance > 0 && (
                <div className="flex justify-between items-center py-1 px-2.5 bg-white rounded border border-slate-150">
                  <span className="text-slate-800">Debit: Output VAT Payable (2400)</span>
                  <span className="font-bold text-slate-900">{formatCurrency(outputVatBalance)}</span>
                </div>
              )}

              {inputVatBalance > 0 && (
                <div className="flex justify-between items-center py-1 px-2.5 bg-white rounded border border-slate-150 pl-6">
                  <span className="text-slate-800">Credit: Input VAT Receivable (1400)</span>
                  <span className="font-bold text-slate-900">{formatCurrency(inputVatBalance)}</span>
                </div>
              )}

              {netVatPosition > 0 && (
                <div className="flex justify-between items-center py-1 px-2.5 bg-white rounded border border-slate-150 pl-6 text-amber-800 font-semibold">
                  <span>Credit: {settlementAccountMode === 'cash' ? 'Cash in Hand (1010)' : 'Net VAT Payable (2410)'}</span>
                  <span className="font-bold">{formatCurrency(netVatPosition)}</span>
                </div>
              )}

              {netVatPosition < 0 && (
                <div className="flex justify-between items-center py-1 px-2.5 bg-white rounded border border-slate-150 text-emerald-800 font-semibold">
                  <span>Debit: {settlementAccountMode === 'cash' ? 'Cash in Hand (1010)' : 'Net VAT Refund Receivable (1410)'}</span>
                  <span className="font-bold">{formatCurrency(Math.abs(netVatPosition))}</span>
                </div>
              )}
            </div>
          </div>

          {/* FOOTER ACTIONS */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (outputVatBalance <= 0 && inputVatBalance <= 0)}
              className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 rounded-xl transition shadow-md shadow-indigo-200 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Executing Settlement...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Execute VAT Settlement JV
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
