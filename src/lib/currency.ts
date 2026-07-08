export type Currency = "XCFA" | "USD";

export function formatMoney(n: number, currency: Currency = "XCFA") {
  const abs = Math.abs(n);
  const compact =
    abs >= 1_000_000
      ? (n / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2).replace(/\.0+$/, "") + "M"
      : abs >= 1_000
        ? (n / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0+$/, "") + "K"
        : n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return currency === "USD" ? `$${compact}` : `₣${compact}`;
}

export function formatMoneyFull(n: number, currency: Currency = "XCFA") {
  const v = n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currency === "USD" ? `$${v}` : `₣${v} XCFA`;
}
