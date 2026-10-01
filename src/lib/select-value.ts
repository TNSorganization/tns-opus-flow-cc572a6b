export const NO_SELECTION_VALUE = "__none__";

export function toSelectValue(value?: string | null) {
  return value || NO_SELECTION_VALUE;
}

export function fromSelectValue(value: string) {
  return !value || value === NO_SELECTION_VALUE ? null : value;
}
