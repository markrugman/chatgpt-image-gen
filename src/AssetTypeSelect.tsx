import { objectTypes, type ObjectType } from "./assetPrompts";

export function AssetTypeSelect({
  value,
  onChange,
  disabled,
}: {
  value: ObjectType;
  onChange: (value: ObjectType) => void;
  disabled: boolean;
}) {
  return (
    <label>
      Object type
      <select
        aria-label="Object type"
        value={value}
        onChange={(e) => onChange(e.target.value as ObjectType)}
        disabled={disabled}
      >
        {objectTypes.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
      <small>
        Automatic identifies the type during analysis; recreation uses the type
        in the JSON. Choose a type to override.
      </small>
    </label>
  );
}
