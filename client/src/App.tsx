import { CardListUpload } from './components/CardListUpload';
import { RecommendationResults } from './components/RecommendationResults';

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="app-eyebrow">Commander Recommender</p>
        <h1 className="app-title">Find the Commander hiding in your collection</h1>
        <p className="app-subtitle">
          Paste or upload a card list. We'll look for synergies across it and suggest legal Commanders, each
          with an estimated power Bracket.
        </p>
      </header>

      <main className="app-main">
        <CardListUpload />
        <RecommendationResults />
      </main>

      <footer className="app-footer">
        <p>Card data via Scryfall. Bracket estimates are a heuristic, not an official ruling.</p>
      </footer>
    </div>
  );
}

export default App;
