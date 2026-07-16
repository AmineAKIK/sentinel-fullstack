interface RobotFieldsGroupProps {
  side: 'left' | 'right' | 'single';
  idPrefix: string;
  robotNumber: string;
  robotHeads: number;
  disabled?: boolean;
  onChangeNumber: (value: string) => void;
  onChangeHeads: (value: number) => void;
}

const SIDE_LABELS: Record<RobotFieldsGroupProps['side'], { number: string; heads: string }> = {
  left: { number: 'Robot gauche *', heads: 'Nombre de têtes *' },
  right: { number: 'Robot droit *', heads: 'Nombre de têtes *' },
  single: { number: 'Numéro de robot *', heads: 'Nombre de têtes *' },
};

export default function RobotFieldsGroup({
  side,
  idPrefix,
  robotNumber,
  robotHeads,
  disabled,
  onChangeNumber,
  onChangeHeads,
}: RobotFieldsGroupProps) {
  const labels = SIDE_LABELS[side];
  const numberId = `${idPrefix}RobotNumber`;
  const headsId = `${idPrefix}RobotHeads`;

  return (
    <>
      <div className="form-group">
        <label className="form-label" htmlFor={numberId}>
          {labels.number}
        </label>
        <input
          id={numberId}
          className="form-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={robotNumber}
          onChange={(e) => onChangeNumber(e.target.value.replace(/\D/g, '').slice(0, 2))}
          disabled={disabled}
          placeholder=""
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={headsId}>
          {labels.heads}
        </label>
        <input
          id={headsId}
          className="form-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={robotHeads ? String(robotHeads) : ''}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, '').slice(0, 2);
            onChangeHeads(next === '' ? 0 : Number(next));
          }}
          disabled={disabled}
          placeholder=""
        />
      </div>
    </>
  );
}
