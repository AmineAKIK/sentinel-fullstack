type ErrorBannerProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
};

export default function ErrorBanner({ children, className = '', style, id }: ErrorBannerProps) {
  return (
    <div
      id={id}
      className={`error-message${className ? ` ${className}` : ''}`}
      style={style}
      role="alert"
      aria-live="assertive"
    >
      {children}
    </div>
  );
}
