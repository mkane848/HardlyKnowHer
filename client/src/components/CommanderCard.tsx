import { useEffect, useId, useRef, useState } from 'react';
import { ComboFinder } from './ComboFinder';
import { CardDetailDialog } from './CardDetailDialog';
import { useAppStore } from '../store/useAppStore';
import { identityName, sortWubrg } from '../lib/mtg';
import { ManaSymbol } from './ManaSymbol';
import type { BracketEstimateDTO, CommanderCardDTO, CommanderSuggestionDTO, SupportingCardDTO } from '../types';

function cardCount(cards: SupportingCardDTO[]): number {
  return cards.reduce((sum, card) => sum + card.quantity, 0);
}

function SupportingCardList({ cards }: { cards: SupportingCardDTO[] }) {
  return (
    <ul className="support-cards">
      {cards.map((card) => (
        <li key={card.name} className="support-card">
          {card.quantity > 1 && <span className="support-qty">{card.quantity}×</span>}
          <span className="support-name">{card.name}</span>
          {card.isGameChanger && (
            <span className="support-gc" title="On the Game Changers list">
              GC
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * One card's own name, type line and rules text within a commander unit.
 * A solo commander renders one of these; a Partner/Background pair renders
 * two, one per card — each is jointly "the commander" (702.124e), so neither
 * gets top billing over the other.
 */
function CommanderFace({ card, bracket }: { card: CommanderCardDTO; bracket: BracketEstimateDTO }) {
  // Whether the clamped rules text is actually cut off, so "Read more" only
  // appears when there is more to read. Measured rather than guessed from
  // character count: how many lines an ability takes depends on the column
  // width, which changes as the grid reflows — hence the ResizeObserver
  // rather than a single measurement on mount.
  const oracleRef = useRef<HTMLSpanElement>(null);
  const [isClamped, setIsClamped] = useState(false);

  useEffect(() => {
    const node = oracleRef.current;
    if (!node) return;

    const measure = () => setIsClamped(node.scrollHeight > node.clientHeight + 1);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [card.oracleText]);

  return (
    <div className="commander-face">
      <h3 className="commander-name">{card.name}</h3>
      {card.typeLine && <p className="commander-type">{card.typeLine}</p>}

      {/* Rules text in a card's own reading order: name, types, then the
          text box. Clamped so one wordy commander can't dominate the grid,
          and tappable at any length to open the full card. */}
      {card.oracleText && (
        <CardDetailDialog card={card} bracket={bracket}>
          <button type="button" className="commander-oracle-button" aria-label={`Show the full card for ${card.name}`}>
            <span ref={oracleRef} className="commander-oracle">
              {card.oracleText}
            </span>
            {isClamped && <span className="oracle-more">Read more</span>}
          </button>
        </CardDetailDialog>
      )}
    </div>
  );
}

export function CommanderCard({ suggestion }: { suggestion: CommanderSuggestionDTO }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const dismiss = useAppStore((s) => s.dismiss);

  const displayName = suggestion.cards.map((c) => c.name).join(' + ');
  const isGameChanger = suggestion.cards.some((c) => c.isGameChanger);

  const hasReasons =
    suggestion.themeSupport.length > 0 ||
    suggestion.tribeSupport.length > 0 ||
    suggestion.keywordSupport.length > 0 ||
    suggestion.gameChangerCards.length > 0;

  const isPair = suggestion.cards.length > 1;

  return (
    <article className={`commander-card${expanded ? ' is-expanded' : ''}${isPair ? ' is-pair' : ''}`}>
      {isPair ? (
        <div className="commander-image-row">
          {suggestion.cards.map(
            (card) =>
              card.imageUri && (
                <img key={card.oracleId} className="commander-image" src={card.imageUri} alt={card.name} loading="lazy" />
              )
          )}
        </div>
      ) : (
        suggestion.cards[0].imageUri && (
          <img
            className="commander-image"
            src={suggestion.cards[0].imageUri}
            alt={suggestion.cards[0].name}
            loading="lazy"
          />
        )
      )}
      <button
        type="button"
        className="dismiss-button"
        onClick={() => dismiss(suggestion.unitId)}
        aria-label={`Dismiss ${displayName}`}
        title="Dismiss this suggestion"
      >
        <span aria-hidden="true">×</span>
      </button>

      <div className="commander-body">
        <div className="pip-row">
          {suggestion.colorIdentity.length === 0 ? (
            <ManaSymbol color="C" />
          ) : (
            sortWubrg(suggestion.colorIdentity).map((color) => <ManaSymbol key={color} color={color} />)
          )}
          <span className="identity-name">{identityName(suggestion.colorIdentity)}</span>
        </div>

        {suggestion.cards.map((card) => (
          <CommanderFace key={card.oracleId} card={card} bracket={suggestion.bracket} />
        ))}

        <div className="badge-row">
          <span className="badge badge-bracket">{suggestion.bracket.range}</span>
          {isGameChanger && <span className="badge badge-gc">Game Changer</span>}
        </div>

        <p className="commander-meta">
          Fits {suggestion.includedCardCount} card{suggestion.includedCardCount === 1 ? '' : 's'} from your list
        </p>

        {suggestion.matchedCreatureTypes.length > 0 && (
          <p className="commander-tags">
            <span className="commander-tags-label">Tribal</span> {suggestion.matchedCreatureTypes.join(', ')}
          </p>
        )}
        {suggestion.matchedThemes.length > 0 && (
          <p className="commander-tags">
            <span className="commander-tags-label">Themes</span> {suggestion.matchedThemes.join(', ')}
          </p>
        )}
        {suggestion.matchedKeywords.length > 0 && (
          <p className="commander-tags">
            <span className="commander-tags-label">Keywords</span> {suggestion.matchedKeywords.join(', ')}
          </p>
        )}

        <p className="commander-bracket-note">{suggestion.bracket.note}</p>

        {hasReasons && (
          <button
            type="button"
            className="explain-toggle"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? 'Hide why' : 'Why this commander?'}
            <span aria-hidden="true" className="explain-chevron">
              {expanded ? '▲' : '▼'}
            </span>
          </button>
        )}

        {hasReasons && expanded && (
          <div className="explain-panel" id={detailsId}>
            {/* No "What it does" section here — the rules text is on the card
                face now, so repeating it would just push the reasoning down. */}
            {suggestion.tribeSupport.length > 0 && (
              <section className="explain-section">
                <h4 className="explain-heading">Tribal overlap</h4>
                {suggestion.tribeSupport.map((tribe) => (
                  <div key={tribe.type} className="explain-group">
                    <p className="explain-group-title">
                      {tribe.type} <span className="explain-count">{cardCount(tribe.cards)} in your list</span>
                    </p>
                    <p className="explain-group-desc">
                      Shares a creature type with this commander, so tribal payoffs line up.
                    </p>
                    <SupportingCardList cards={tribe.cards} />
                  </div>
                ))}
              </section>
            )}

            {suggestion.themeSupport.length > 0 && (
              <section className="explain-section">
                <h4 className="explain-heading">Themes you're already building</h4>
                {suggestion.themeSupport.map((theme) => (
                  <div key={theme.key} className="explain-group">
                    <p className="explain-group-title">
                      {theme.label} <span className="explain-count">{cardCount(theme.cards)} in your list</span>
                    </p>
                    <p className="explain-group-desc">{theme.description}</p>
                    <SupportingCardList cards={theme.cards} />
                  </div>
                ))}
              </section>
            )}

            {suggestion.keywordSupport.length > 0 && (
              <section className="explain-section">
                <h4 className="explain-heading">Shared keywords</h4>
                {suggestion.keywordSupport.map((kw) => (
                  <div key={kw.keyword} className="explain-group">
                    <p className="explain-group-title">
                      {kw.keyword} <span className="explain-count">{cardCount(kw.cards)} in your list</span>
                    </p>
                    <p className="explain-group-desc">
                      This commander has {kw.keyword}, and enough of your list does too for it to be a real pattern,
                      not a coincidence.
                    </p>
                    <SupportingCardList cards={kw.cards} />
                  </div>
                ))}
              </section>
            )}

            {suggestion.gameChangerCards.length > 0 && (
              <section className="explain-section">
                <h4 className="explain-heading">Driving the Bracket estimate</h4>
                <p className="explain-group-desc">
                  These cards are on Wizards' Game Changers list, which is what this estimate counts.
                </p>
                <SupportingCardList cards={suggestion.gameChangerCards} />
              </section>
            )}

            <ComboFinder commanderNames={suggestion.cards.map((c) => c.name)} />

            <p className="explain-caveat">
              Matches come from card text, keywords, and creature types, not a model of how the deck actually
              plays. Treat this as a starting point.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
