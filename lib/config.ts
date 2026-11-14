// Single source of truth for the product name.
// Working title only — NOT a locked brand. Rename here and it renames everywhere.
export const PRODUCT_NAME = "Reused Content Shield";
export const PRODUCT_TAGLINE = "Find out your reused-content risk before YouTube tells you.";
// Accounts allowed into /admin. Checked server-side on every admin API call.
export const ADMIN_EMAILS = ["saadxj8@gmail.com", "s44070saad@gmail.com"];
export const HONESTY_NOTE =
  "This score is a risk estimate from public signals only. Only YouTube decides monetization. This tool cannot see your private analytics or the actual content of your videos, and it cannot guarantee any outcome with YouTube.";

// ── Plans & credits ─────────────────────────────────────────────────────────
// Credits are priced by real API quota + deliverable value: an audit burns
// ~3 quota units, a Finder search ~304. Watched-channel monitoring is bundled
// into paid plans (auto-checks don't burn credits) and capped per plan.
export interface PlanDef {
  id: string;
  name: string;
  price: number; // USD / month
  monthlyCredits: number;
  watchLimit: number; // 0 = monitoring not included
  finderDaily: number; // fresh Finder searches per day (shared YouTube quota guard)
  tagline: string;
  features: string[];
}

export const PLANS: PlanDef[] = [
  {
    id: "free", name: "Free", price: 0, monthlyCredits: 10, watchLimit: 0, finderDaily: 2,
    tagline: "Test the water before you apply for monetization.",
    features: ["10 credits a month + 25 bonus credits in your first 30 days", "Channel audits + risk scores", "Pre-Publish Check", "Viral Content Finder (cached searches free)", "Provenance Vault + Appeal Pack"],
  },
  {
    id: "solo", name: "Solo", price: 19, monthlyCredits: 100, watchLimit: 3, finderDaily: 5,
    tagline: "For one creator running one or two channels.",
    features: ["100 credits a month", "Watch 3 channels — daily auto re-audits", "Email + in-app risk alerts", "Channel Breakdowns (facts & risk data)", "Everything in Free"],
  },
  {
    id: "pro", name: "Pro", price: 49, monthlyCredits: 300, watchLimit: 10, finderDaily: 10,
    tagline: "For serious automation channels and small teams.",
    features: ["300 credits a month", "Watch 10 channels — daily auto re-audits", "Email + in-app risk alerts", "Score trends + since-last-audit diffs", "Everything in Solo"],
  },
  {
    id: "agency", name: "Agency", price: 99, monthlyCredits: 1000, watchLimit: 30, finderDaily: 20,
    tagline: "For freelancers and agencies managing client channels.",
    features: ["1,000 credits a month", "Watch 30 channels — daily auto re-audits", "Email + in-app risk alerts", "Client-ready reports and breakdowns", "Everything in Pro"],
  },
];

export function planById(id: string | null | undefined): PlanDef {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export const CREDIT_COSTS = { audit: 2, prepublish: 2, breakdown: 5, finder: 10 } as const;
export type CreditAction = keyof typeof CREDIT_COSTS;

// New accounts get bonus credits on top of their plan for the first 30 days,
// so a Free user starts with 35 credits — enough for a real test drive.
export const SIGNUP_BONUS_CREDITS = 25;
export const SIGNUP_BONUS_DAYS = 30;
