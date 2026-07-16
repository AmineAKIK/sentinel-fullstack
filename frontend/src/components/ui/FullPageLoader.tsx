import Spinner from './Spinner';

type FullPageLoaderProps = {
  size?: number;
};

export default function FullPageLoader({ size = 28 }: FullPageLoaderProps) {
  return (
    <div
      className="full-page-loader"
      role="status"
      aria-live="polite"
      aria-label="Chargement en cours"
    >
      <Spinner size={size} borderWidth={3} />
      <span className="sr-only">Chargement en cours</span>
    </div>
  );
}
