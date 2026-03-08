import { useState } from 'react';
import { useFilterStore } from '../../store';
import { SearchResults } from './SearchResults';

export function SearchBar() {
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const setFilter = useFilterStore((state) => state.setFilter);
  const [focused, setFocused] = useState(false);

  return (
    <div className="relative mx-auto w-full max-w-xl">
      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 shadow-glass backdrop-blur">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5 flex-none text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>

        <input
          aria-label="Search flights"
          value={searchQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            window.setTimeout(() => setFocused(false), 100);
          }}
          onChange={(event) => {
            setFilter({ searchQuery: event.target.value });
          }}
          placeholder="Search flights, routes, airports..."
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
        />

        {searchQuery && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setFilter({ searchQuery: '' })}
            className="text-xs text-slate-400 transition hover:text-white"
          >
            Clear
          </button>
        )}
      </label>

      {focused && <SearchResults query={searchQuery} onSelect={() => setFocused(false)} />}
    </div>
  );
}
