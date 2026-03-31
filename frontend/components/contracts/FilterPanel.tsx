'use client';

import React, { useState } from 'react';
import { ContractSearchParams } from '@/lib/api';
import { ChevronDown, ChevronUp, Calendar, X } from 'lucide-react';

type NetworkFilter = NonNullable<ContractSearchParams['network']>;

interface FilterPanelProps {
  categories: string[];
  selectedCategories: string[];
  onToggleCategory: (value: string) => void;
  languages: string[];
  selectedLanguages: string[];
  onToggleLanguage: (value: string) => void;
  selectedNetworks: NetworkFilter[];
  onToggleNetwork: (value: NetworkFilter) => void;
  author: string;
  onAuthorChange: (value: string) => void;
  verifiedOnly: boolean;
  onVerifiedChange: (value: boolean) => void;
  dateFrom?: string;
  dateTo?: string;
  onDateRangeChange?: (from: string, to: string) => void;
  activeCounts?: Record<string, number>;
  onClearAll?: () => void;
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  activeCount = 0,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  activeCount?: number;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border/50 rounded-xl overflow-hidden bg-background shadow-sm transition-all duration-300">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground tracking-wide">
          {title}
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-primary text-primary-foreground rounded-full">
              {activeCount}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      <div
        className={`transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className="p-3 bg-background">{children}</div>
      </div>
    </div>
  );
}

function CheckboxGroup({
  options,
  selected,
  onToggle,
  counts,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="space-y-1">
      {options.map((option) => {
        const isSelected = selected.includes(option);
        const count = counts?.[option] ?? 0;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-sm transition-all ${
              isSelected
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelected ? 'bg-primary border-primary' : 'border-border'
                }`}
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="capitalize">{option}</span>
            </div>
            {count > 0 && !isSelected && (
              <span className="text-xs text-muted-foreground/60">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function FilterPanel({
  categories,
  selectedCategories,
  onToggleCategory,
  languages,
  selectedLanguages,
  onToggleLanguage,
  selectedNetworks,
  onToggleNetwork,
  author,
  onAuthorChange,
  verifiedOnly,
  onVerifiedChange,
  dateFrom,
  dateTo,
  onDateRangeChange,
  activeCounts = {},
  onClearAll,
}: FilterPanelProps) {
  const networks: NetworkFilter[] = ['mainnet', 'testnet', 'futurenet'];

  const handlePresetDate = (daysCount: number) => {
    if (!onDateRangeChange) return;
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - daysCount);
    onDateRangeChange(from.toISOString().split('T')[0], to.toISOString().split('T')[0]);
  };

  const hasAnyFilter = 
    selectedCategories.length > 0 ||
    selectedLanguages.length > 0 ||
    selectedNetworks.length > 0 ||
    Boolean(author) ||
    verifiedOnly ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  return (
    <div className="space-y-4">
      {hasAnyFilter && onClearAll && (
        <div className="flex justify-end mb-2">
          <button
            onClick={onClearAll}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear All
          </button>
        </div>
      )}

      <CollapsibleSection title="Network" activeCount={selectedNetworks.length}>
        <CheckboxGroup
          options={networks}
          selected={selectedNetworks}
          onToggle={onToggleNetwork as (val: string) => void}
          counts={activeCounts}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Category" activeCount={selectedCategories.length}>
        <CheckboxGroup
          options={categories}
          selected={selectedCategories}
          onToggle={onToggleCategory}
          counts={activeCounts}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Language" activeCount={selectedLanguages.length} defaultOpen={false}>
        <CheckboxGroup
          options={languages}
          selected={selectedLanguages}
          onToggle={onToggleLanguage}
          counts={activeCounts}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Status & Creator" activeCount={(verifiedOnly ? 1 : 0) + (author ? 1 : 0)}>
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => onVerifiedChange(!verifiedOnly)}
            className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-all ${
              verifiedOnly
                ? 'bg-green-500/10 text-green-600 font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
              verifiedOnly ? 'bg-green-500 border-green-500' : 'border-border'
            }`}>
              {verifiedOnly && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            Verified only
          </button>

          <div className="px-1">
            <label className="block text-xs text-muted-foreground mb-1.5">Publisher / Address</label>
            <input
              type="text"
              value={author}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onAuthorChange(e.target.value)}
              placeholder="e.g. GB2X..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>
      </CollapsibleSection>

      {onDateRangeChange && (
        <CollapsibleSection title="Date Range" activeCount={(dateFrom || dateTo) ? 1 : 0} defaultOpen={false}>
          <div className="space-y-3 px-1">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handlePresetDate(7)} className="px-2 py-1.5 text-xs rounded-lg border border-border hover:bg-accent hover:text-foreground text-muted-foreground transition-colors">
                Last 7 Days
              </button>
              <button onClick={() => handlePresetDate(30)} className="px-2 py-1.5 text-xs rounded-lg border border-border hover:bg-accent hover:text-foreground text-muted-foreground transition-colors">
                Last 30 Days
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <input
                  type="date"
                  value={dateFrom || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => onDateRangeChange(e.target.value, dateTo || '')}
                  className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  aria-label="From date"
                />
                <input
                  type="date"
                  value={dateTo || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => onDateRangeChange(dateFrom || '', e.target.value)}
                  className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  aria-label="To date"
                />
              </div>
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => onDateRangeChange('', '')}
                className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                Clear Date Filter
              </button>
            )}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
