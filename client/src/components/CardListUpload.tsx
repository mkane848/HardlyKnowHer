import { useState, type FormEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { fetchRecommendations } from '../api/client';

export function CardListUpload() {
  const rawList = useAppStore((s) => s.rawList);
  const isLoading = useAppStore((s) => s.isLoading);
  const setRawList = useAppStore((s) => s.setRawList);
  const setResult = useAppStore((s) => s.setResult);
  const setLoading = useAppStore((s) => s.setLoading);
  const setError = useAppStore((s) => s.setError);

  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    const text = await file.text();
    setRawList(text);
    setFileName(file.name);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!rawList.trim()) {
      setError('Paste or upload a card list first.');
      return;
    }
    setLoading(true);
    try {
      const result = await fetchRecommendations(rawList);
      setResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
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
        <button type="submit" className="primary-button" disabled={isLoading}>
          {isLoading ? 'Finding synergies…' : 'Suggest Commanders'}
        </button>
      </div>
    </form>
  );
}
