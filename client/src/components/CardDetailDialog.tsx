import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { identityName, sortWubrg } from '../lib/mtg';
import { ManaSymbol } from './ManaSymbol';
import { ManaCost } from './ManaCost';
import type { CommanderSuggestionDTO } from '../types';

interface Props {
  suggestion: CommanderSuggestionDTO;
  children: ReactNode;
}

/**
 * The full card, laid out the way a card is: art, then name and mana cost,
 * then type line, then the complete rules text and power/toughness.
 *
 * Radix Dialog handles the parts that are easy to get wrong by hand — focus
 * trapping, restoring focus to the trigger on close, Escape, scroll locking,
 * and the aria wiring between trigger, title and description.
 *
 * Deliberately stops short of reimplementing Scryfall: printings, rulings,
 * prices and legality across every format are all a click away on the real
 * page, which this links to rather than approximating badly.
 */
export function CardDetailDialog({ suggestion, children }: Props) {
  const { power, toughness } = suggestion;
  const hasStats = power !== null && toughness !== null;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <div className="dialog-card">
            {suggestion.imageUri && (
              <img className="dialog-art" src={suggestion.imageUri} alt="" loading="lazy" />
            )}

            <div className="dialog-body">
              <div className="dialog-titlebar">
                <Dialog.Title className="dialog-name">{suggestion.name}</Dialog.Title>
                {suggestion.manaCost && <ManaCost cost={suggestion.manaCost} />}
              </div>

              {suggestion.typeLine && <p className="dialog-type">{suggestion.typeLine}</p>}

              {suggestion.oracleText && <p className="dialog-oracle">{suggestion.oracleText}</p>}

              {hasStats && (
                <p className="dialog-stats">
                  {power}/{toughness}
                </p>
              )}

              <dl className="dialog-meta">
                <div>
                  <dt>Color identity</dt>
                  <dd>
                    <span className="dialog-pips">
                      {suggestion.colorIdentity.length === 0 ? (
                        <ManaSymbol color="C" decorative />
                      ) : (
                        sortWubrg(suggestion.colorIdentity).map((color) => (
                          <ManaSymbol key={color} color={color} decorative />
                        ))
                      )}
                    </span>
                    {identityName(suggestion.colorIdentity)}
                  </dd>
                </div>
                <div>
                  <dt>Commander</dt>
                  <dd>Legal{suggestion.isGameChanger ? ' · Game Changer' : ''}</dd>
                </div>
                <div>
                  <dt>Bracket estimate</dt>
                  <dd>
                    {suggestion.bracket.range} — {suggestion.bracket.label}
                  </dd>
                </div>
              </dl>

              {suggestion.scryfallUri && (
                <a
                  className="dialog-link"
                  href={suggestion.scryfallUri}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  View on Scryfall — printings, rulings, prices
                </a>
              )}
            </div>
          </div>

          <Dialog.Close className="dialog-close" aria-label="Close">
            <span aria-hidden="true">×</span>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
