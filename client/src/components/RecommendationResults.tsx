import { useAppStore } from '../store/useAppStore';
import { useRecommendations } from '../api/queries';
import { CommanderCard } from './CommanderCard';

export function RecommendationResults() {
  const submittedList = useAppStore((s) => s.submittedList);
  const { data: result, error } = useRecommendations(submittedList);

  if (error) {
    return <p className="status-error">{error instanceof Error ? error.message : 'Something went wrong.'}</p>;
  }

  if (!result) {
    return null;
  }

  return (
    <section className="results">
      <div className="results-summary">
        <span>
          {result.totalMatched} of {result.totalParsed} cards matched
        </span>
        {result.notFound.length > 0 && (
          <details>
            <summary>{result.notFound.length} not found</summary>
            <ul>
              {result.notFound.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {result.suggestions.length === 0 ? (
        <p className="status-empty">
          No strong Commander synergies found yet — try uploading a larger or more varied list.
        </p>
      ) : (
        <div className="suggestion-grid">
          {result.suggestions.map((suggestion) => (
            <CommanderCard key={suggestion.oracleId} suggestion={suggestion} />
          ))}
        </div>
      )}
    </section>
  );
}
