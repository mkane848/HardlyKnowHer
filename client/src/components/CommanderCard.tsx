import { useId, useState } from 'react';
import { ComboFinder } from './ComboFinder';
import type { CommanderSuggestionDTO, SupportingCardDTO } from '../types';

const COLOR_LABELS: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

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
  const detailsId = useId();

  const hasReasons =
    suggestion.themeSupport.length > 0 ||
    suggestion.tribeSupport.length > 0 ||
    suggestion.gameChangerCards.length > 0;

  return (
    <article className={`commander-card${expanded ? ' is-expanded' : ''}`}>
      {suggestion.imageUri && (
        <img className="commander-image" src={suggestion.imageUri} alt={suggestion.name} loading="lazy" />
      )}
      <div className="commander-body">
        <h3 className="commander-name">{suggestion.name}</h3>

        <div className="pip-row">
          {suggestion.colorIdentity.length === 0 ? (
            <span className="pip pip-c" title="Colorless">
              C
            </span>
          ) : (
            suggestion.colorIdentity.map((color) => (
              <span key={color} className={`pip pip-${color.toLowerCase()}`} title={COLOR_LABELS[color] ?? color}>
                {color}
              </span>
            ))
          )}
        </div>

        {suggestion.typeLine && <p className="commander-type">{suggestion.typeLine}</p>}

        <div className="badge-row">
          <span className="badge badge-bracket">{suggestion.bracket.range}</span>
          {suggestion.isGameChanger && <span className="badge badge-gc">Game Changer</span>}
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
            {suggestion.oracleText && (
              <section className="explain-section">
                <h4 className="explain-heading">What it does</h4>
                <p className="explain-oracle">{suggestion.oracleText}</p>
              </section>
            )}

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
