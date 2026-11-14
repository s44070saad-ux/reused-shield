// Server-side credit accounting. Plans live in profiles.plan; usage is an
// append-only ledger (usage_events) summed per calendar month. Routes check
// BEFORE doing the expensive work and charge AFTER it succeeds — a failed
// audit never costs the user a credit.
import type { SupabaseClient } from "@supabase/supabase-js";
import { planById, CREDIT_COSTS, type PlanDef, type CreditAction } from "./config";

export async function getUserPlan(sb: SupabaseClient, userId: string): Promise<PlanDef> {
  const { data } = await sb.from("profiles").select("plan").eq("user_id", userId).single();
  return planById(data?.plan);
}

export function monthStartISO(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function creditsUsedThisMonth(sb: SupabaseClient, userId: string): Promise<number> {
  const { data } = await sb
    .from("usage_events")
    .select("cost")
    .eq("user_id", userId)
    .gte("created_at", monthStartISO());
  return (data ?? []).reduce((sum, r: any) => sum + (r.cost ?? 0), 0);
}

export interface CreditCheck { ok: boolean; plan: PlanDef; used: number; cost: number; remaining: number }

export async function checkCredits(sb: SupabaseClient, userId: string, action: CreditAction): Promise<CreditCheck> {
  const plan = await getUserPlan(sb, userId);
  const used = await creditsUsedThisMonth(sb, userId);
  const cost = CREDIT_COSTS[action];
  const remaining = plan.monthlyCredits - used;
  return { ok: remaining >= cost, plan, used, cost, remaining };
}

export async function chargeCredits(sb: SupabaseClient, userId: string, action: CreditAction): Promise<void> {
  await sb.from("usage_events").insert({ user_id: userId, action, cost: CREDIT_COSTS[action] });
}

export function outOfCreditsMessage(check: CreditCheck, action: CreditAction): string {
  return `You're out of credits on the ${check.plan.name} plan (${check.used}/${check.plan.monthlyCredits} used this month; a ${action} costs ${check.cost}). Credits reset on the 1st — or upgrade your plan for more.`;
}
