type EmptyStateProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export default function EmptyState({ children, className = '', style }: EmptyStateProps) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  );
}
