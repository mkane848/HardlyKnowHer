import type { CommanderSuggestionDTO } from '../types';

const COLOR_LABELS: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

export function CommanderCard({ suggestion }: { suggestion: CommanderSuggestionDTO }) {
  return (
    <article className="commander-card">
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
      </div>
    </article>
  );
}
