import type { ReactNode } from 'react';
import { COLOR_LABELS, WUBRG } from '../lib/mtg';
import { ManaSymbol } from './ManaSymbol';
import {
  EMPTY_FILTERS,
  cycleSelection,
  hasActiveFilters,
  modeOf,
  type FilterMode,
  type FilterSelection,
  type SuggestionFilters,
} from '../lib/filters';
import { SORT_MODE_LABELS, type SortMode } from '../lib/sort';

interface Props {
  filters: SuggestionFilters;
  onChange: (filters: SuggestionFilters) => void;
  availableBrackets: string[];
  availableThemes: string[];
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  shown: number;
  total: number;
}

const MODE_ICON: Record<FilterMode, string> = { include: '+', exclude: '−' };

/** Each facet chip cycles off → include → exclude → off on click, so a
 * single control covers "must have" and "must not have" without doubling
 * the number of buttons on screen. */
function FacetChip({
  label,
  mode,
  onClick,
  describe,
}: {
  label: ReactNode;
  mode: FilterMode | null;
  onClick: () => void;
  describe: (mode: FilterMode | null) => string;
}) {
  return (
    <button
      type="button"
      className={`toggle-chip toggle-chip-${mode ?? 'off'}`}
      onClick={onClick}
      aria-label={describe(mode)}
      title={describe(mode)}
    >
      {mode && (
        <span className="chip-mode-icon" aria-hidden="true">
          {MODE_ICON[mode]}
        </span>
      )}
      {label}
    </button>
  );
}

function nextModeDescription(current: FilterMode | null): string {
  if (current === null) return 'not filtered — click to require';
  if (current === 'include') return 'required — click to exclude instead';
  return 'excluded — click to clear';
}

export function ResultFilters({
  filters,
  onChange,
  availableBrackets,
  availableThemes,
  sortMode,
  onSortModeChange,
  shown,
  total,
}: Props) {
  const active = hasActiveFilters(filters);

  function updateFacet(key: keyof SuggestionFilters, selection: FilterSelection) {
    onChange({ ...filters, [key]: selection });
  }

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <span className="filter-label" id="filter-colors-label">
          Colors
        </span>
        <div className="toggle-group" role="group" aria-labelledby="filter-colors-label">
          {WUBRG.map((color) => {
            const mode = modeOf(filters.colors, color);
            const name = COLOR_LABELS[color];
            return (
              <button
                key={color}
                type="button"
                className={`toggle-pip toggle-pip-${mode ?? 'off'}`}
                onClick={() => updateFacet('colors', cycleSelection(filters.colors, color))}
                aria-label={`${name}: ${nextModeDescription(mode)}`}
                title={`${name}: ${nextModeDescription(mode)}`}
              >
                <ManaSymbol color={color} decorative />
              </button>
            );
          })}
        </div>
        <span className="filter-hint">click once to require a colour, again to exclude it</span>
      </div>

      {availableBrackets.length > 1 && (
        <div className="filter-row">
          <span className="filter-label" id="filter-bracket-label">
            Bracket
          </span>
          <div className="toggle-group" role="group" aria-labelledby="filter-bracket-label">
            {availableBrackets.map((bracket) => {
              const mode = modeOf(filters.brackets, bracket);
              return (
                <FacetChip
                  key={bracket}
                  label={bracket.replace('Bracket ', '')}
                  mode={mode}
                  onClick={() => updateFacet('brackets', cycleSelection(filters.brackets, bracket))}
                  describe={(m) => `Bracket ${bracket.replace('Bracket ', '')}: ${nextModeDescription(m)}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {availableThemes.length > 0 && (
        <div className="filter-row">
          <span className="filter-label" id="filter-theme-label">
            Themes
          </span>
          <div className="toggle-group" role="group" aria-labelledby="filter-theme-label">
            {availableThemes.map((theme) => {
              const mode = modeOf(filters.themes, theme);
              return (
                <FacetChip
                  key={theme}
                  label={theme}
                  mode={mode}
                  onClick={() => updateFacet('themes', cycleSelection(filters.themes, theme))}
                  describe={(m) => `${theme}: ${nextModeDescription(m)}`}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="filter-footer">
        <span className="filter-count">
          {shown === total ? `${total} commanders` : `${shown} of ${total} commanders`}
        </span>

        <label className="sort-control">
          <span className="filter-label">Sort</span>
          <select
            value={sortMode}
            onChange={(event) => onSortModeChange(event.target.value as SortMode)}
          >
            {(Object.entries(SORT_MODE_LABELS) as [SortMode, string][]).map(([mode, label]) => (
              <option key={mode} value={mode}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {active && (
          <button type="button" className="filter-clear" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
