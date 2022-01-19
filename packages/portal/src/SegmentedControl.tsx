import * as React from 'react';

type ControlProps = {
  options: string[];
  value: string;
  onChange: (val: string) => void;
};

export default function SegmentedControl({
  options,
  value,
  onChange,
}: ControlProps) {
  const idx = options.indexOf(value);
  return (
    <div data-dcdn-segmented-control="">
      <span
        data-dcdn-segmented-control-highlight=""
        style={{
          transform: 'translateX(' + 94 * idx + 'px)',
        }}
      ></span>

      {options.map((opt, index) => (
        <div data-dcdn-segmented-control-option="" key={opt}>
          <input
            type="radio"
            id={opt}
            name="actions"
            value={opt}
            checked={value === opt}
            onChange={(evt) => onChange(opt)}
          />
          <label htmlFor={opt}>
            <span>{opt}</span>
          </label>
        </div>
      ))}
    </div>
  );
}
