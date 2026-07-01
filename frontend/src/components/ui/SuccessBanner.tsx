type SuccessBannerProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export default function SuccessBanner({ children, className = '', style }: SuccessBannerProps) {
  return (
    <div
      className={`success-message${className ? ` ${className}` : ''}`}
      style={style}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {children}
    </div>
  );
}
