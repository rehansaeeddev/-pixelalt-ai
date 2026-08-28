import { useCallback, type ReactNode } from "react";

/**
 * s-choice's `details` prop is excluded from JSX typings (must be set as a DOM
 * property, not an attribute), so it's assigned imperatively via ref here.
 */
export function Choice({ value, details, children }: { value: string; details: string; children: ReactNode }) {
  const ref = useCallback(
    (el: (HTMLElement & { details?: string }) | null) => {
      if (el) el.details = details;
    },
    [details],
  );

  return (
    <s-choice value={value} ref={ref}>
      {children}
    </s-choice>
  );
}
