import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between mt-8">
      <p className="text-sm text-gray-500">
        Showing {from}–{to} of {total} products
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={cn(
            'p-2 rounded-lg border border-gray-200 text-gray-500 transition-colors',
            page === 1
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:bg-gray-50 hover:text-knef-primary',
          )}
        >
          <ChevronLeft size={16} />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 7) {
              pageNum = i + 1;
            } else if (page <= 4) {
              pageNum = i + 1;
            } else if (page >= totalPages - 3) {
              pageNum = totalPages - 6 + i;
            } else {
              pageNum = page - 3 + i;
            }

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={cn(
                  'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                  pageNum === page
                    ? 'bg-knef-primary text-white'
                    : 'text-gray-600 hover:bg-gray-100',
                )}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className={cn(
            'p-2 rounded-lg border border-gray-200 text-gray-500 transition-colors',
            page === totalPages
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:bg-gray-50 hover:text-knef-primary',
          )}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
