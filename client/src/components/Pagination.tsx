interface Props {
  pageIndex: number;
  pageCount: number;
  onPageChange: (index: number) => void;
  /** Distinguishes the several pagers that can share one screen (the grid,
   * plus one per combo group) for screen readers. */
  label: string;
}

/**
 * How many numbered buttons to show around the current page before falling
 * back to an ellipsis. First and last are always reachable, so the widest
 * this ever renders is: first, gap, three around current, gap, last.
 */
const WINDOW = 1;

/**
 * Builds the page numbers to render, with `null` marking a skipped run.
 *
 * Every page is reachable by number when there are few enough of them; once
 * there are many, the first, last and a window around the current page stay
 * clickable and the rest collapse. Without that a few hundred suggestions at
 * nine per page would render a row of numbers wider than the screen.
 */
function pageItems(pageIndex: number, pageCount: number): (number | null)[] {
  const pages = new Set<number>([0, pageCount - 1]);
  for (let i = pageIndex - WINDOW; i <= pageIndex + WINDOW; i++) {
    if (i >= 0 && i < pageCount) pages.add(i);
  }

  const ordered = [...pages].sort((a, b) => a - b);
  const items: (number | null)[] = [];
  let previous: number | null = null;
  for (const page of ordered) {
    if (previous !== null && page - previous > 1) items.push(null);
    items.push(page);
    previous = page;
  }
  return items;
}

/** Previous/Next plus direct page selection, shared by the suggestion grid
 * and each combo group. */
export function Pagination({ pageIndex, pageCount, onPageChange, label }: Props) {
  if (pageCount <= 1) return null;

  const items = pageItems(pageIndex, pageCount);

  return (
    <nav className="pagination" aria-label={label}>
      <button
        type="button"
        className="page-button"
        onClick={() => onPageChange(pageIndex - 1)}
        disabled={pageIndex === 0}
      >
        ← Previous
      </button>

      <span className="page-numbers">
        {items.map((page, i) =>
          page === null ? (
            // Purely decorative: the pages it stands for are still reachable
            // by stepping, so it is hidden rather than announced as content.
            <span key={`gap-${i}`} className="page-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={page}
              type="button"
              className={`page-number${page === pageIndex ? ' is-current' : ''}`}
              onClick={() => onPageChange(page)}
              aria-label={`Page ${page + 1}`}
              aria-current={page === pageIndex ? 'page' : undefined}
            >
              {page + 1}
            </button>
          )
        )}
      </span>

      <button
        type="button"
        className="page-button"
        onClick={() => onPageChange(pageIndex + 1)}
        disabled={pageIndex >= pageCount - 1}
      >
        Next →
      </button>
    </nav>
  );
}
