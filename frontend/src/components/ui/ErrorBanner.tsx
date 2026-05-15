type ErrorBannerProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export default function ErrorBanner({ children, className = '', style }: ErrorBannerProps) {
  return (
    <div
      className={`error-message${className ? ` ${className}` : ''}`}
      style={style}
      role="alert"
      aria-live="assertive"
    >
      {children}
    </div>
  );
}
