export const PLAN_CREDITS: Record<string, number> = {
  free: 30,
  starter: 12000,
  growth: 60000,
  scale: 240000,
};

export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
};

export const PLAN_PRICE_LABEL: Record<string, string> = {
  free: "$0",
  starter: "$99/year",
  growth: "$499/year",
  scale: "$990/year",
};

export const PLAN_ANNUAL_PRICE: Record<string, number> = {
  starter: 99,
  growth: 499,
  scale: 990,
};

// What the same credits would cost bought as one-time top-ups — used to show the annual-plan savings.
export const PLAN_ONE_TIME_PRICE: Record<string, number> = {
  starter: 120,
  growth: 600,
  scale: 2400,
};
