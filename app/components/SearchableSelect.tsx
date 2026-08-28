import { useMemo, useRef, useState } from "react";

type Option = { value: string; label: string };

type SearchableSelectProps = {
  label: string;
  name: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
};

export function SearchableSelect({ label, name, value, options, onChange }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const select = (option: Option) => {
    onChange(option.value);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="app-combobox">
      <label className="app-combobox__label">{label}</label>
      <input type="hidden" name={name} value={value} />
      <input
        ref={inputRef}
        type="text"
        className="app-combobox__input"
        placeholder={selectedLabel}
        value={open ? query : selectedLabel}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open ? (
        <div className="app-combobox__list">
          {filtered.length === 0 ? (
            <div className="app-combobox__empty">No matches</div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  option.value === value ? "app-combobox__option app-combobox__option--selected" : "app-combobox__option"
                }
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(option)}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
