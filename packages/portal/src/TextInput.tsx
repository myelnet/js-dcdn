import * as React from 'react';

type TextInputProps = {
  name: string;
  value: string;
  invalid?: boolean;
  placeholder?: string;
  onChange: (val: string) => void;
};

export default function TextInput({
  name,
  value,
  placeholder,
  invalid,
  onChange,
}: TextInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };
  return (
    <input
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={handleChange}
      data-dcdn-textinput={invalid ? 'invalid' : ''}
    />
  );
}
