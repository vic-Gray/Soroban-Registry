import type { SortBy } from '@/app/contracts/sort-utils';

interface SortDropdownProps {
  value: SortBy;
  onChange: (value: SortBy) => void;
  showRelevance?: boolean;
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'created_at', label: 'Date' },
  { value: 'name', label: 'Name' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'rating', label: 'Rating' },
];

export function SortDropdown({ value, onChange, showRelevance }: SortDropdownProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortBy)}
      className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer hover:border-primary/40 transition-colors"
      aria-label="Sort contracts"
    >
      {SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          Sort: {option.label}
        </option>
      ))}
      {showRelevance && (
        <option value="relevance">Sort: Relevance</option>
      )}
    </select>
  );
}
