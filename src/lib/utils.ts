import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(v: number | null | undefined, unit = '', digits = 0) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(digits)}${unit}`;
}
