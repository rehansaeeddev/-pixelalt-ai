import { useState } from "react";
import { Card } from "./Card";
import { AppButton } from "./AppButton";

type Step = {
  label: string;
  detail: string;
  done: boolean;
  action?: { label: string; href: string };
};

export function GettingStarted({ steps, estimatedMinutes = 3 }: { steps: Step[]; estimatedMinutes?: number }) {
  const [dismissed, setDismissed] = useState(false);
  const [expandedLabel, setExpandedLabel] = useState<string | null>(
    steps.find((s) => !s.done)?.label ?? null,
  );

  const doneCount = steps.filter((s) => s.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);

  if (percent === 100 || dismissed) return null;

  return (
    <Card>
      <div className="app-getting-started__header">
        <div className="app-getting-started__heading-row">
          <div className="app-getting-started__icon">
            <s-icon type="reward" tone="auto" />
          </div>
          <div>
            <h4 className="app-getting-started__title">Get started with ImageAlt</h4>
            <p className="app-getting-started__subtitle">
              {doneCount} of {steps.length} steps complete · ~{estimatedMinutes} min to finish
            </p>
          </div>
        </div>
        <div className="app-getting-started__header-actions">
          <span className="app-getting-started__percent">{percent}%</span>
          <div className="app-getting-started__bar app-getting-started__bar--inline">
            <div className="app-getting-started__bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <button
            type="button"
            className="app-getting-started__dismiss"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
      <ul className="app-getting-started__list">
        {steps.map((step) => {
          const expanded = expandedLabel === step.label;
          return (
            <li key={step.label} className="app-getting-started__item">
              <button
                type="button"
                className="app-getting-started__row"
                onClick={() => setExpandedLabel(expanded ? null : step.label)}
              >
                <span
                  className={
                    step.done
                      ? "app-getting-started__check app-getting-started__check--done"
                      : "app-getting-started__check"
                  }
                >
                  {step.done ? "✓" : ""}
                </span>
                <div className="app-getting-started__row-body">
                  <div className={step.done ? "app-getting-started__label app-getting-started__label--done" : "app-getting-started__label"}>
                    {step.label}
                  </div>
                  <div className="app-getting-started__detail">{step.detail}</div>
                </div>
                <s-icon
                  type={expanded ? "chevron-up" : "chevron-down"}
                  color="subdued"
                />
              </button>
              {expanded && step.action ? (
                <div className="app-getting-started__row-action">
                  <AppButton variant="primary" href={step.action.href}>
                    {step.action.label}
                  </AppButton>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
