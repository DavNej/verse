/**
 * The popup's primary action button.
 *
 * Shared with the options page at M2, which is why it lives in src/components/
 * rather than inside the popup entrypoint.
 */

import type { ReactNode } from 'react';

type VerseButtonProps = {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

export function VerseButton({ children, onClick, disabled = false }: VerseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-lg bg-red-600 px-4 py-2.5 font-medium text-sm text-white transition-colors hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-red-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
    >
      {children}
    </button>
  );
}
