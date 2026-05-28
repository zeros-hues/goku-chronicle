interface EmptyStateProps {
  query: string;
}

export default function EmptyState({ query }: EmptyStateProps) {
  return (
    <div className="cp-empty">
      <span className="cp-empty-icon">◌</span>
      <p>
        {query
          ? <>No commands match <strong>&ldquo;{query}&rdquo;</strong></>
          : 'No commands available'
        }
      </p>
    </div>
  );
}
