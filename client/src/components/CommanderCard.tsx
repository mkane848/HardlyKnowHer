import { useEffect, useId, useRef, useState } from 'react';
import { ComboFinder } from './ComboFinder';
import { CardDetailDialog } from './CardDetailDialog';
import { useAppStore } from '../store/useAppStore';
import { identityName, sortWubrg } from '../lib/mtg';
import { visibleThemeSupport, visibleTribeSupport } from '../lib/suggestions';
import { ManaSymbol } from './ManaSymbol';
import type { CommanderSuggestionDTO, SupportingCardDTO } from '../types';

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

export function CommanderCard({ suggestion }: { suggestion: CommanderSuggestionDTO }) {
  const [expanded, setExpanded] = useState(false);
  const [showFullArt, setShowFullArt] = useState(false);
  const detailsId = useId();
  const dismiss = useAppStore((s) => s.dismiss);

  // Themes/tribes the collection profile matched globally can still end up
  // with zero cards once narrowed to ones that fit this commander's colour
  // identity — that's not a real reason to suggest it, so it's filtered out
  // here rather than shown as an empty group.
  const tribeSupport = visibleTribeSupport(suggestion);
  const themeSupport = visibleThemeSupport(suggestion);
  const tribeTypes = tribeSupport.map((t) => t.type);
  const themeLabels = themeSupport.map((t) => t.label);

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
  }, [suggestion.oracleText]);

  const hasReasons = themeSupport.length > 0 || tribeSupport.length > 0 || suggestion.gameChangerCards.length > 0;

  return (
    <article className={`commander-card${expanded ? ' is-expanded' : ''}`}>
      {suggestion.imageUri && (
        <div className={`commander-art${showFullArt ? ' is-showing-full-art' : ''}`}>
          <button
            type="button"
            className="commander-art-trigger"
            onClick={() => setShowFullArt((open) => !open)}
            aria-label={
              showFullArt ? `Hide full art for ${suggestion.name}` : `Show full art for ${suggestion.name}`
            }
            aria-pressed={showFullArt}
          >
            <img className="commander-image" src={suggestion.imageUri} alt={suggestion.name} loading="lazy" />
          </button>
          <img className="commander-art-preview" src={suggestion.imageUri} alt="" aria-hidden loading="lazy" />
        </div>
      )}
      <button
        type="button"
        className="dismiss-button"
        onClick={() => dismiss(suggestion.oracleId)}
        aria-label={`Dismiss ${suggestion.name}`}
        title="Dismiss this suggestion"
      >
        <span aria-hidden="true">×</span>
      </button>

      <div className="commander-body">
        <h3 className="commander-name">{suggestion.name}</h3>

        <div className="pip-row">
          {suggestion.colorIdentity.length === 0 ? (
            <ManaSymbol color="C" />
          ) : (
            sortWubrg(suggestion.colorIdentity).map((color) => <ManaSymbol key={color} color={color} />)
          )}
          <span className="identity-name">{identityName(suggestion.colorIdentity)}</span>
        </div>

        {suggestion.typeLine && <p className="commander-type">{suggestion.typeLine}</p>}

        {/* Rules text in a card's own reading order: name, types, then the
            text box. Clamped so one wordy commander can't dominate the grid,
            and tappable at any length to open the full card. */}
        {suggestion.oracleText && (
          <CardDetailDialog suggestion={suggestion}>
            <button
              type="button"
              className="commander-oracle-button"
              aria-label={`Show the full card for ${suggestion.name}`}
            >
              <span ref={oracleRef} className="commander-oracle">
                {suggestion.oracleText}
              </span>
              {isClamped && <span className="oracle-more">Read more</span>}
            </button>
          </CardDetailDialog>
        )}

        <div className="badge-row">
          <span className="badge badge-bracket">{suggestion.bracket.range}</span>
          {suggestion.isGameChanger && <span className="badge badge-gc">Game Changer</span>}
        </div>

        <p className="commander-meta">
          Fits {suggestion.includedCardCount} card{suggestion.includedCardCount === 1 ? '' : 's'} from your list
        </p>

        {tribeTypes.length > 0 && (
          <p className="commander-tags">
            <span className="commander-tags-label">Tribal</span> {tribeTypes.join(', ')}
          </p>
        )}
        {themeLabels.length > 0 && (
          <p className="commander-tags">
            <span className="commander-tags-label">Themes</span> {themeLabels.join(', ')}
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
            {tribeSupport.length > 0 && (
              <section className="explain-section">
                <h4 className="explain-heading">Tribal overlap</h4>
                {tribeSupport.map((tribe) => (
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

            {themeSupport.length > 0 && (
              <section className="explain-section">
                <h4 className="explain-heading">Themes you're already building</h4>
                {themeSupport.map((theme) => (
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

            {suggestion.gameChangerCards.length > 0 && (
              <section className="explain-section">
                <h4 className="explain-heading">Driving the Bracket estimate</h4>
                <p className="explain-group-desc">
                  These cards are on Wizards' Game Changers list, which is what this estimate counts.
                </p>
                <SupportingCardList cards={suggestion.gameChangerCards} />
              </section>
            )}

            <ComboFinder commanderName={suggestion.name} />

            <p className="explain-caveat">
              Matches come from card text and creature types, not a model of how the deck actually plays.
              Treat this as a starting point.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
