import { useState, type FormEvent } from 'react';
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
