import { useState } from 'react';
import { fetchCombos } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import type { ComboDTO, ComboLookupResponse } from '../types';

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
 */
export function ComboFinder({ commanderName }: { commanderName: string }) {
  const rawList = useAppStore((state) => state.rawList);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ComboLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setStatus('loading');
    setError(null);
    try {
      setResult(await fetchCombos(rawList, commanderName));
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Combo lookup failed.');
      setStatus('error');
    }
  }

  const nothingFound = result && result.ready.length === 0 && result.almost.length === 0;

  return (
    <section className="explain-section">
      <h4 className="explain-heading">Combos</h4>

      {status === 'idle' && (
        <>
          <p className="explain-group-desc">
            Check Commander Spellbook for combos between this commander and the cards in your list that
            fit its colour identity.
          </p>
          <button type="button" className="combo-button" onClick={search}>
            Find combos
          </button>
        </>
      )}

      {status === 'loading' && <p className="explain-group-desc">Asking Commander Spellbook…</p>}

      {status === 'error' && (
        <>
          <p className="combo-error">{error}</p>
          <button type="button" className="combo-button" onClick={search}>
            Try again
          </button>
        </>
      )}

      {status === 'done' && result && (
        <>
          <p className="explain-group-desc">
            Searched {result.searchedCardCount} card{result.searchedCardCount === 1 ? '' : 's'} from your
            list{result.cached ? ' (cached)' : ''}.
          </p>

          {nothingFound && <p className="explain-group-desc">No combos found with these cards.</p>}

          {result.ready.length > 0 && (
            <div className="explain-group">
              <p className="explain-group-title">
                Ready to go <span className="explain-count">{result.ready.length}</span>
              </p>
              <p className="explain-group-desc">Every piece is already in your list.</p>
              <ComboList combos={result.ready} />
            </div>
          )}

          {result.almost.length > 0 && (
            <div className="explain-group">
              <p className="explain-group-title">
                Almost there <span className="explain-count">{result.almost.length}</span>
              </p>
              <p className="explain-group-desc">A card or two short.</p>
              <ComboList combos={result.almost} showMissing />
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
