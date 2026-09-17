// src/components/ConfirmSubmitButton.tsx
"use client";

/** A plain submit button that asks window.confirm() before letting the
 *  form actually submit - the standard, dependency-free way to require
 *  confirmation in front of a Server Action form with no other client-side
 *  state. Cancelling the confirm just blocks that one submit; the form
 *  itself, and every other field in it, is untouched. */
export function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
}: {
  confirmMessage: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
