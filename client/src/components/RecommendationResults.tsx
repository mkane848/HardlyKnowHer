import { useMemo, useState } from 'react';
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { useAppStore } from '../store/useAppStore';
import { useRecommendations } from '../api/queries';
import { applyFilters, availableFilterValues, EMPTY_FILTERS, hasActiveFilters } from '../lib/filters';
import { CommanderCard } from './CommanderCard';
import { ResultFilters } from './ResultFilters';
import type { CommanderSuggestionDTO } from '../types';

const PAGE_SIZE = 9;

export function RecommendationResults() {
  const submittedList = useAppStore((s) => s.submittedList);
  const dismissed = useAppStore((s) => s.dismissed);
  const restoreAll = useAppStore((s) => s.restoreAll);
  const { data: result, error } = useRecommendations(submittedList);

  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const suggestions = useMemo(() => result?.suggestions ?? [], [result]);

  // Dismissals and filters are separate ideas: dismissing is the user saying
  // "not this one", filtering is "not right now". Both narrow the grid, but
  // the counts below report them separately so neither hides the other.
  const kept = useMemo(
    () => suggestions.filter((s) => !dismissed.includes(s.oracleId)),
    [suggestions, dismissed]
  );
  const filtered = useMemo(() => applyFilters(kept, filters), [kept, filters]);
  const { brackets, themes, hasColorless, hasMulticolor } = useMemo(() => availableFilterValues(kept), [kept]);

  // TanStack Table is used headlessly here, purely for the pagination state
  // machine — page bounds, and resetting to page 1 when filtering changes the
  // row count under you. Filtering itself stays a plain function in lib, since
  // these filters cut across the whole row rather than down one column.
  const columns = useMemo<ColumnDef<CommanderSuggestionDTO>[]>(
    () => [{ id: 'suggestion', accessorKey: 'oracleId' }],
    []
  );

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  if (error) {
    return <p className="status-error">{error instanceof Error ? error.message : 'Something went wrong.'}</p>;
  }

  if (!result) {
    return null;
  }

  const pageCount = table.getPageCount();
  const { pageIndex } = table.getState().pagination;
  const rows = table.getRowModel().rows;

  return (
    <section className="results">
      <div className="results-summary">
        <span>
          {result.totalMatched} of {result.totalParsed} cards matched
        </span>
        {result.notFound.length > 0 && (
          <details>
            <summary>{result.notFound.length} not found</summary>
            <ul>
              {result.notFound.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </details>
        )}
        {dismissed.length > 0 && (
          <span className="dismissed-note">
            {dismissed.length} dismissed
            <button type="button" className="link-button" onClick={restoreAll}>
              Restore all
            </button>
          </span>
        )}
      </div>

      {suggestions.length === 0 ? (
        <p className="status-empty">
          No strong Commander synergies found yet — try uploading a larger or more varied list.
        </p>
      ) : (
        <>
          <ResultFilters
            filters={filters}
            onChange={setFilters}
            availableBrackets={brackets}
            availableThemes={themes}
            hasColorless={hasColorless}
            hasMulticolor={hasMulticolor}
            shown={filtered.length}
            total={kept.length}
          />

          {filtered.length === 0 ? (
            <p className="status-empty">
              {hasActiveFilters(filters)
                ? 'No commanders match these filters.'
                : 'You have dismissed every suggestion.'}{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => (hasActiveFilters(filters) ? setFilters(EMPTY_FILTERS) : restoreAll())}
              >
                {hasActiveFilters(filters) ? 'Clear filters' : 'Restore all'}
              </button>
            </p>
          ) : (
            <>
              <div className="suggestion-grid">
                {rows.map((row) => (
                  <CommanderCard key={row.original.oracleId} suggestion={row.original} />
                ))}
              </div>

              {pageCount > 1 && (
                <nav className="pagination" aria-label="Suggestion pages">
                  <button
                    type="button"
                    className="page-button"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    ← Previous
                  </button>
                  <span className="page-status" aria-live="polite">
                    Page {pageIndex + 1} of {pageCount}
                  </span>
                  <button
                    type="button"
                    className="page-button"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    Next →
                  </button>
                </nav>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
