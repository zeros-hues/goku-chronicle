interface EmptyStateProps {
  query: string;
  onCreateEntry?: () => void;
  onSearchEntries?: () => void;
}

export default function EmptyState({ query, onCreateEntry, onSearchEntries }: EmptyStateProps) {
  return (
    <div className="cp-empty">
      <span className="cp-empty-icon">◌</span>
      <p>
        {query
          ? <>No commands match <strong>&ldquo;{query}&rdquo;</strong></>
          : 'No commands available'
        }
      </p>
      {query && (
        <div className="cp-empty-actions">
          {onCreateEntry && (
            <button className="cp-empty-action" onClick={onCreateEntry}>
              Create entry: &ldquo;{query}&rdquo;
            </button>
          )}
          {onSearchEntries && (
            <button className="cp-empty-action" onClick={onSearchEntries}>
              Search entries for &ldquo;{query}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
