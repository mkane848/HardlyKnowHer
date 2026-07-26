import { useEffect, useId, useRef, useState } from 'react';
import { ComboFinder } from './ComboFinder';
import { CardDetailDialog } from './CardDetailDialog';
import { CardImageDialog } from './CardImageDialog';
import { useAppStore } from '../store/useAppStore';
import { identityName, sortWubrg } from '../lib/mtg';
import { visibleKeywordSupport, visibleThemeSupport, visibleTribeSupport } from '../lib/suggestions';
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
          {/* The name opens the card itself — the list is where you're
              checking "which cards did it actually mean?", and a name alone
              often isn't enough to remember what one does. */}
          <CardImageDialog name={card.name} imageUri={card.imageUri} scryfallUri={card.scryfallUri}>
            <button type="button" className="support-name" aria-label={`Show the card ${card.name}`}>
              {card.name}
            </button>
          </CardImageDialog>
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
 * How strongly this suggestion scored relative to the best match in the
 * current (filtered) results — not an absolute number, which the scoring
 * formula gives no natural ceiling for and so wouldn't mean anything on its
 * own. Shown as a badge; hovering (or tapping, for touch) reveals a
 * breakdown of what drove it.
 *
 * The tooltip stays in the DOM and is shown/hidden with CSS (:hover,
 * :focus-within) so desktop hover needs no JS at all — `open` only exists to
 * make tap-to-toggle work on touch devices, which have no hover state.
 */
function MatchBadge({ suggestion, maxScore }: { suggestion: CommanderSuggestionDTO; maxScore: number }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const percent = maxScore > 0 ? Math.round((suggestion.score / maxScore) * 100) : 100;

  const signals: string[] = [];
  if (suggestion.matchedCreatureTypes.length > 0) {
    signals.push(`${suggestion.matchedCreatureTypes.length} tribal`);
  }
  if (suggestion.matchedThemes.length > 0) {
    signals.push(`${suggestion.matchedThemes.length} theme${suggestion.matchedThemes.length === 1 ? '' : 's'}`);
  }
  if (suggestion.matchedKeywords.length > 0) {
    signals.push(`${suggestion.matchedKeywords.length} keyword${suggestion.matchedKeywords.length === 1 ? '' : 's'}`);
  }

  return (
    <span className={`match-badge-wrap${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="badge badge-match"
        aria-describedby={tooltipId}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        {percent}% match
      </button>
      {/* The card count is the pool each signal is measured against, not
          credit in its own right — colours decide what is eligible and score
          nothing, so the wording must not imply that playing more of your
          list is itself what earned the score. */}
      <span role="tooltip" id={tooltipId} className="match-tooltip">
        {percent < 100
          ? `${percent}% as strong a match as the top suggestion here`
          : 'The strongest match in your current results'}
        {signals.length > 0 ? `: ${signals.join(', ')} signal${signals.length === 1 ? '' : 's'}` : ''}, weighed against
        the {suggestion.includedCardCount} card{suggestion.includedCardCount === 1 ? '' : 's'} it can play from your
        list. Colours decide which cards count, never how good the match is.
      </span>
    </span>
  );
}

/** One face's own art, opening a whole-card image preview when tapped. */
function CommanderArt({ card }: { card: CommanderCardDTO }) {
  if (!card.imageUri) return null;
  return (
    <CardImageDialog name={card.name} imageUri={card.imageUri} scryfallUri={card.scryfallUri}>
      <button type="button" className="commander-art-trigger" aria-label={`Show the full card for ${card.name}`}>
        <img className="commander-image" src={card.imageUri} alt={card.name} loading="lazy" />
      </button>
    </CardImageDialog>
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

export function CommanderCard({
  suggestion,
  maxScore,
}: {
  suggestion: CommanderSuggestionDTO;
  /** The highest score among the currently-visible suggestions, for the
   * match badge's relative percentage. */
  maxScore: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const dismiss = useAppStore((s) => s.dismiss);

  const displayName = suggestion.cards.map((c) => c.name).join(' + ');
  const isGameChanger = suggestion.cards.some((c) => c.isGameChanger);
  const isPair = suggestion.cards.length > 1;

  // Themes/tribes/keywords the collection profile matched globally can still
  // end up with zero cards once narrowed to ones that fit this commander's
  // colour identity — that's not a real reason to suggest it, so it's
  // filtered out here rather than shown as an empty group.
  const tribeSupport = visibleTribeSupport(suggestion);
  const themeSupport = visibleThemeSupport(suggestion);
  const keywordSupport = visibleKeywordSupport(suggestion);
  const tribeTypes = tribeSupport.map((t) => t.type);
  const themeLabels = themeSupport.map((t) => t.label);
  const keywordLabels = keywordSupport.map((k) => k.keyword);

  const hasReasons =
    themeSupport.length > 0 ||
    tribeSupport.length > 0 ||
    keywordSupport.length > 0 ||
    suggestion.gameChangerCards.length > 0;

  return (
    <article className={`commander-card${expanded ? ' is-expanded' : ''}${isPair ? ' is-pair' : ''}`}>
      {isPair ? (
        <div className="commander-image-row">
          {suggestion.cards.map((card) => (
            <CommanderArt key={card.oracleId} card={card} />
          ))}
        </div>
      ) : (
        <CommanderArt card={suggestion.cards[0]} />
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
          <MatchBadge suggestion={suggestion} maxScore={maxScore} />
          <span className="badge badge-bracket">{suggestion.bracket.range}</span>
          {isGameChanger && <span className="badge badge-gc">Game Changer</span>}
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
        {keywordLabels.length > 0 && (
          <p className="commander-tags">
            <span className="commander-tags-label">Keywords</span> {keywordLabels.join(', ')}
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

            {keywordSupport.length > 0 && (
              <section className="explain-section">
                <h4 className="explain-heading">Shared keywords</h4>
                {keywordSupport.map((kw) => (
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
