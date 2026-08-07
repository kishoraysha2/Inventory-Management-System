import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { TableSkeleton } from './Skeleton';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (row: T, index: number) => React.ReactNode;
  className?: string;
}

export interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor?: (row: T, index: number) => string | number;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  className?: string;
}

export function Table<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  emptyTitle = 'No Records Found',
  emptyDescription = 'There are no records to display in this list.',
  pageSizeOptions = [10, 25, 50, 100],
  defaultPageSize = 25,
  className = '',
}: TableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalRows = data.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  // Paginated Data
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, currentPage, pageSize]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  if (isLoading) {
    return <TableSkeleton rows={pageSize > 10 ? 10 : pageSize} />;
  }

  return (
    <div className={`bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden flex flex-col ${className}`}>
      {/* Table Scrollable Body */}
      <div className="overflow-x-auto overflow-y-auto max-h-[600px] relative">
        <table className="w-full text-left border-collapse font-sans">
          {/* Sticky Header */}
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10 border-b border-slate-200/80 shadow-2xs">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`px-4 py-3 sm:px-6 sm:py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-100 text-xs sm:text-sm text-slate-700 font-normal">
            {paginatedData.length > 0 ? (
              paginatedData.map((row, index) => {
                const key = keyExtractor ? keyExtractor(row, index) : index;
                return (
                  <tr
                    key={key}
                    className="hover:bg-slate-50/80 transition-colors duration-100 group"
                  >
                    {columns.map((col, colIdx) => (
                      <td
                        key={colIdx}
                        className={`px-4 py-3 sm:px-6 sm:py-3.5 align-middle ${col.className || ''}`}
                      >
                        {col.cell
                          ? col.cell(row, index)
                          : col.accessorKey
                          ? (row[col.accessorKey] as React.ReactNode)
                          : null}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center">
                  <EmptyState type="no-records" title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {data.length > 0 && (
        <div className="px-4 py-3 sm:px-6 bg-slate-50/80 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-sans">
          {/* Rows per page Selector */}
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 font-bold focus:outline-2 focus:outline-blue-600 cursor-pointer shadow-3xs"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <span className="hidden sm:inline text-slate-400">
              Showing {Math.min((currentPage - 1) * pageSize + 1, totalRows)}–
              {Math.min(currentPage * pageSize, totalRows)} of {totalRows}
            </span>
          </div>

          {/* Page Navigation Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
              title="First Page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-2 font-bold text-slate-700">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
              title="Last Page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
