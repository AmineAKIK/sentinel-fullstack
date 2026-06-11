type KpiCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClassName?: string;
};

export default function KpiCard({ label, value, sub, valueClassName = '' }: KpiCardProps) {
  return (
    <div className="card kpi-card">
      <span className="kpi-label">{label}</span>
      <strong className={`kpi-value${valueClassName ? ` ${valueClassName}` : ''}`}>{value}</strong>
      {sub !== undefined && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}
