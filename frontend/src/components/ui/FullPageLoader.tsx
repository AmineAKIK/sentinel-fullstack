import Spinner from './Spinner';

type FullPageLoaderProps = {
  size?: number;
};

export default function FullPageLoader({ size = 28 }: FullPageLoaderProps) {
  return (
    <div className="full-page-loader">
      <Spinner size={size} borderWidth={3} />
    </div>
  );
}
