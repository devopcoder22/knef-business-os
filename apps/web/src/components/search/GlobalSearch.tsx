'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Package,
  Users,
  ShoppingCart,
  FileText,
  UserCheck,
  Truck,
  CreditCard,
  Barcode,
  CheckSquare,
  Loader2,
  Search as SearchIcon,
  type LucideIcon,
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import {
  useGlobalSearch,
  type SearchEntityType,
  type SearchResult,
} from '@/hooks/useGlobalSearch';

interface Props {
  open: boolean;
  onClose: () => void;
}

const ENTITY_LABEL: Record<SearchEntityType, string> = {
  PRODUCT:         'Products',
  CUSTOMER:        'Customers',
  ORDER:           'Orders',
  INVOICE:         'Invoices',
  STAFF:           'Staff',
  SUPPLIER:        'Suppliers',
  TRANSACTION:     'Transactions',
  SERIALIZED_UNIT: 'Serialized Inventory',
  TASK:            'Tasks',
};

const ENTITY_ICON: Record<SearchEntityType, LucideIcon> = {
  PRODUCT:         Package,
  CUSTOMER:        Users,
  ORDER:           ShoppingCart,
  INVOICE:         FileText,
  STAFF:           UserCheck,
  SUPPLIER:        Truck,
  TRANSACTION:     CreditCard,
  SERIALIZED_UNIT: Barcode,
  TASK:            CheckSquare,
};

// Preserve a consistent group order regardless of how the API returns them.
const GROUP_ORDER: SearchEntityType[] = [
  'PRODUCT', 'CUSTOMER', 'ORDER', 'INVOICE', 'STAFF',
  'SUPPLIER', 'TRANSACTION', 'SERIALIZED_UNIT', 'TASK',
];

export function GlobalSearch({ open, onClose }: Props) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const debounced = useDebounce(input, 300);

  // Reset the input every time the modal opens so stale state never flashes.
  useEffect(() => {
    if (open) setInput('');
  }, [open]);

  const { data, isFetching, isError } = useGlobalSearch({
    q: debounced,
    limit: 5,
    enabled: open,
  });

  const groups = useMemo(() => {
    if (!data) return [] as Array<{ type: SearchEntityType; items: SearchResult[] }>;
    return GROUP_ORDER
      .map((type) => ({ type, items: data.byType[type] ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [data]);

  const handleSelect = (result: SearchResult) => {
    onClose();
    router.push(result.route);
  };

  if (!open) return null;

  const showHint = debounced.trim().length < 2;
  const showEmpty = !showHint && !isFetching && (data?.total ?? 0) === 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-2 pt-[10vh] sm:px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xl rounded-lg bg-white shadow-xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Global search"
      >
        <Command
          label="Global search"
          shouldFilter={false}
          loop
          className="flex flex-col overflow-hidden rounded-lg"
        >
          {/* Input */}
          <div className="flex items-center gap-2 border-b border-gray-200 px-3">
            <SearchIcon size={16} className="text-gray-400" />
            <Command.Input
              autoFocus
              value={input}
              onValueChange={setInput}
              placeholder="Search products, customers, orders, invoices, staff…"
              className="flex-1 border-0 bg-transparent py-3 text-sm text-gray-900 placeholder-gray-400 outline-none"
            />
            {isFetching && (
              <Loader2 size={16} className="animate-spin text-gray-400" aria-label="Loading" />
            )}
            <kbd className="hidden rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-500 sm:inline-block">
              Esc
            </kbd>
          </div>

          {/* Results */}
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            {showHint && (
              <div className="px-3 py-6 text-center text-sm text-gray-500">
                Type at least 2 characters to search.
              </div>
            )}

            {!showHint && isError && (
              <div className="px-3 py-6 text-center text-sm text-red-600">
                Search failed. Please try again.
              </div>
            )}

            {!showHint && !isError && showEmpty && (
              <Command.Empty className="px-3 py-6 text-center text-sm text-gray-500">
                No results for &ldquo;{debounced}&rdquo;
              </Command.Empty>
            )}

            {groups.map(({ type, items }) => {
              const Icon = ENTITY_ICON[type];
              return (
                <Command.Group
                  key={type}
                  heading={ENTITY_LABEL[type]}
                  className="pb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-gray-500"
                >
                  {items.map((item) => (
                    <Command.Item
                      key={`${type}:${item.id}`}
                      value={`${type}:${item.id}:${item.title}`}
                      onSelect={() => handleSelect(item)}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-900 aria-selected:bg-blue-50 aria-selected:text-blue-900"
                    >
                      <Icon size={16} className="flex-shrink-0 text-gray-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{item.title}</div>
                        <div className="truncate text-xs text-gray-500">{item.subtitle}</div>
                      </div>
                      <span className="hidden flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-600 sm:inline-block">
                        {ENTITY_LABEL[type]}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
