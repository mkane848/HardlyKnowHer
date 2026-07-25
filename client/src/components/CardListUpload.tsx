import { useEffect, useState, type FormEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useRecommendations } from '../api/queries';

export function CardListUpload() {
  const rawList = useAppStore((s) => s.rawList);
  const submittedList = useAppStore((s) => s.submittedList);
  const setRawList = useAppStore((s) => s.setRawList);
  const submitList = useAppStore((s) => s.submitList);

  const [fileName, setFileName] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Same cache entry the results section reads — no state passed between them.
  const { isFetching } = useRecommendations(submittedList);

  // A request that runs past a few seconds is almost always the free instance
  // waking up. Say so, rather than leaving a spinner to look like a hang.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!isFetching) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [isFetching]);

  async function handleFile(file: File) {
    const text = await file.text();
    setRawList(text);
    setFileName(file.name);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!rawList.trim()) {
      setValidationError('Paste or upload a card list first.');
      return;
    }
    setValidationError(null);
    submitList(rawList);
  }

  return (
    <form className="upload-panel" onSubmit={handleSubmit}>
      <label className="upload-label" htmlFor="card-list">
        Your card list
      </label>
      <textarea
        id="card-list"
        className="upload-textarea"
        placeholder={'1 Sol Ring\n1 Arcane Signet\n1 Rampant Growth\n1 Eternal Witness\n...'}
        value={rawList}
        onChange={(event) => setRawList(event.target.value)}
        rows={12}
        spellCheck={false}
      />
      {validationError && <p className="status-error">{validationError}</p>}
      {slow && (
        <p className="status-waking" aria-live="polite">
          Waking the server — it sleeps after a spell of inactivity, so the first request can take up
          to a minute.
        </p>
      )}
      <div className="upload-actions">
        <label className="file-button">
          Upload .txt
          <input
            type="file"
            accept=".txt,.csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
        {fileName && <span className="file-name">{fileName}</span>}
        <button type="submit" className="primary-button" disabled={isFetching}>
          {isFetching ? 'Finding synergies…' : 'Suggest Commanders'}
        </button>
      </div>
    </form>
  );
}
