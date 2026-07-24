import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useCombos } from '../api/queries';
import type { ComboDTO } from '../types';

function ComboList({ combos, showMissing }: { combos: ComboDTO[]; showMissing?: boolean }) {
  return (
    <ul className="combo-list">
      {combos.map((combo, index) => (
        <li key={combo.id ?? index} className="combo-item">
          <p className="combo-cards">{combo.cards.join(' + ')}</p>
          {combo.produces.length > 0 && (
            <p className="combo-produces">
              <span className="combo-arrow" aria-hidden="true">
                →
              </span>{' '}
              {combo.produces.join(', ')}
            </p>
          )}
          {showMissing && combo.missing.length > 0 && (
            <p className="combo-missing">Missing: {combo.missing.join(', ')}</p>
          )}
          {combo.description && <p className="combo-steps">{combo.description}</p>}
          {combo.permalink && (
            <a className="combo-link" href={combo.permalink} target="_blank" rel="noreferrer noopener">
              View on Commander Spellbook
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Explicit, click-to-run combo lookup. Nothing is requested from Commander
 * Spellbook until the user asks for it, so browsing suggestions never
 * generates traffic against their API.
 *
 * The lookup is keyed on the submitted list rather than the textarea's
 * current contents, so editing the box after getting results doesn't quietly
 * ask about a different deck than the one on screen.
 */
export function ComboFinder({ commanderName }: { commanderName: string }) {
  const submittedList = useAppStore((s) => s.submittedList);
  const [requested, setRequested] = useState(false);
  const { data, error, isFetching, refetch } = useCombos(commanderName, submittedList, requested);

  // `data` is served from cache even while disabled, so collapsing this panel
  // and reopening it shows the previous answer instead of asking again.
  const showIdle = !data && !isFetching && !error;
  const nothingFound = data && data.ready.length === 0 && data.almost.length === 0;

  return (
    <section className="explain-section">
      <h4 className="explain-heading">Combos</h4>

      {showIdle && (
        <>
          <p className="explain-group-desc">
            Check Commander Spellbook for combos between this commander and the cards in your list that
            fit its colour identity.
          </p>
          <button type="button" className="combo-button" onClick={() => setRequested(true)}>
            Find combos
          </button>
        </>
      )}

      {isFetching && <p className="explain-group-desc">Asking Commander Spellbook…</p>}

      {error && !isFetching && (
        <>
          <p className="combo-error">{error instanceof Error ? error.message : 'Combo lookup failed.'}</p>
          <button type="button" className="combo-button" onClick={() => refetch()}>
            Try again
          </button>
        </>
      )}

      {data && !isFetching && (
        <>
          <p className="explain-group-desc">
            Searched {data.searchedCardCount} card{data.searchedCardCount === 1 ? '' : 's'} from your list
            {data.cached ? ' (cached)' : ''}.
          </p>

          {nothingFound && <p className="explain-group-desc">No combos found with these cards.</p>}

          {data.ready.length > 0 && (
            <div className="explain-group">
              <p className="explain-group-title">
                Ready to go <span className="explain-count">{data.ready.length}</span>
              </p>
              <p className="explain-group-desc">Every piece is already in your list.</p>
              <ComboList combos={data.ready} />
            </div>
          )}

          {data.almost.length > 0 && (
            <div className="explain-group">
              <p className="explain-group-title">
                Almost there <span className="explain-count">{data.almost.length}</span>
              </p>
              <p className="explain-group-desc">A card or two short.</p>
              <ComboList combos={data.almost} showMissing />
            </div>
          )}

          <p className="combo-credit">
            Combo data from{' '}
            <a href="https://commanderspellbook.com/" target="_blank" rel="noreferrer noopener">
              Commander Spellbook
            </a>
            .
          </p>
        </>
      )}
    </section>
  );
}
