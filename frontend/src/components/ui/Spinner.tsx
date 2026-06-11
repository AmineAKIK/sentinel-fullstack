type SpinnerProps = {
  size?: number;
  borderWidth?: number;
};

export default function Spinner({ size, borderWidth }: SpinnerProps) {
  return (
    <span
      className="spinner"
      aria-hidden="true"
      style={{
        ...(size ? { width: size, height: size } : {}),
        ...(borderWidth ? { borderWidth } : {}),
      }}
    />
  );
}
