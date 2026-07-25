import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { COLOR_LABELS, WUBRG } from '../lib/mtg';
import { ManaSymbol } from './ManaSymbol';
import { hasActiveFilters, type SuggestionFilters } from '../lib/filters';

interface Props {
  filters: SuggestionFilters;
  onChange: (filters: SuggestionFilters) => void;
  availableBrackets: string[];
  availableThemes: string[];
  shown: number;
  total: number;
}

export function ResultFilters({
  filters,
  onChange,
  availableBrackets,
  availableThemes,
  shown,
  total,
}: Props) {
  const active = hasActiveFilters(filters);

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <span className="filter-label" id="filter-colors-label">
          Colors
        </span>
        <ToggleGroup.Root
          type="multiple"
          className="toggle-group"
          aria-labelledby="filter-colors-label"
          value={filters.colors}
          onValueChange={(colors) => onChange({ ...filters, colors })}
        >
          {WUBRG.map((color) => (
            <ToggleGroup.Item
              key={color}
              value={color}
              className="toggle-pip"
              aria-label={COLOR_LABELS[color]}
              title={COLOR_LABELS[color]}
            >
              <ManaSymbol color={color} decorative />
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        <span className="filter-hint">shows commanders playable in the selected colors</span>
      </div>

      {availableBrackets.length > 1 && (
        <div className="filter-row">
          <span className="filter-label" id="filter-bracket-label">
            Bracket
          </span>
          <ToggleGroup.Root
            type="multiple"
            className="toggle-group"
            aria-labelledby="filter-bracket-label"
            value={filters.brackets}
            onValueChange={(brackets) => onChange({ ...filters, brackets })}
          >
            {availableBrackets.map((bracket) => (
              <ToggleGroup.Item key={bracket} value={bracket} className="toggle-chip">
                {bracket.replace('Bracket ', '')}
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
        </div>
      )}

      {availableThemes.length > 0 && (
        <div className="filter-row">
          <span className="filter-label" id="filter-theme-label">
            Themes
          </span>
          <ToggleGroup.Root
            type="multiple"
            className="toggle-group"
            aria-labelledby="filter-theme-label"
            value={filters.themes}
            onValueChange={(themes) => onChange({ ...filters, themes })}
          >
            {availableThemes.map((theme) => (
              <ToggleGroup.Item key={theme} value={theme} className="toggle-chip">
                {theme}
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
        </div>
      )}

      <div className="filter-footer">
        <span className="filter-count">
          {shown === total ? `${total} commanders` : `${shown} of ${total} commanders`}
        </span>
        {active && (
          <button
            type="button"
            className="filter-clear"
            onClick={() => onChange({ colors: [], brackets: [], themes: [] })}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
