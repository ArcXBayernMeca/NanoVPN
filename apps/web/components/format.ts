export const formatUsd = (microUsd: number) => `$${(microUsd / 1_000_000).toFixed(4)}`;
export const formatMb = (bytes: number) => `${(bytes / 1_000_000).toFixed(2)} MB`;
