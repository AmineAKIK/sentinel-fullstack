type DetailFieldProps = {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export default function DetailField({ label, children, className = '', style }: DetailFieldProps) {
  return (
    <div className={`detail-field${className ? ` ${className}` : ''}`} style={style}>
      <span className="detail-field-label">{label}</span>
      <span className="detail-field-value">{children}</span>
    </div>
  );
}
