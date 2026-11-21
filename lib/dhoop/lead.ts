import { SQFT_PER_M2 } from './config';
import { inr } from './solar';
import type { Session } from './store';

/**
 * How likely a household is to go ahead, for the installers who would pay to be put in front
 * of it. This is where Dhoop can earn: an installer's costliest problem is telling a buyer from
 * a looker, and a conversation with Dhoop shows which is which.
 *
 * A plain sum of points, on purpose. An installer can see why a lead is rated as it is, and
 * nothing is hidden in a model. Nothing here is learnt from data, because there is none yet:
 * the points are a first judgement of what separates someone who means to buy from someone
 * who is looking. Set them again from real outcomes (which leads took a quote, which had a
 * system fitted) as soon as there are some.
 *
 * It reads only what the session already holds, so it costs nothing and cannot disagree with
 * the screen. No server-only imports: the installers' page uses it too.
 */
export type Tier = 'high' | 'medium' | 'low';

/** The points each sign carries. One table, shown to installers as it is. */
export const LEAD_POINTS = {
  visitBooked: 30,
  feasibilityApproved: 25,
  quotesAsked: 22,
  applied: 18,
  registered: 10,
  bill: 10,
  roof: 10,
  system: 10,
  conditionsMet: 10,
  loan: 6,
  vendors: 6,
  mostForAsking: 6,
  roofChecked: 4,
  conditionsAsked: 4,
  sizesCompared: 4,
  stayedOrCameBack: 4,
  longRun: 3,
} as const;

/** From this many points a lead is high, or medium. Below the second it is low. */
export const LEAD_TIERS = { high: 60, medium: 30 } as const;

export interface Lead {
  /** 0 to 100. */
  score: number;
  tier: Tier;
  /** What the rating rests on, the strongest first, in words an installer can act on. */
  reasons: { text: string; points: number }[];
  /** What the household has not done yet. */
  missing: string[];
  /** What an installer should do with this lead. */
  next: string;
  /** How many things were asked of Dhoop, and of how many kinds. */
  asks: number;
  topics: number;
}

export function leadFor(s: Session): Lead {
  const P = LEAD_POINTS;
  const reasons: Lead['reasons'] = [];
  const missing: string[] = [];
  const add = (points: number, text: string) => reasons.push({ points, text });

  // What a household does only when it means to buy.
  if (s.booking) add(P.visitBooked, `Booked a site visit: ${s.booking.day}, ${s.booking.time}`);
  if (s.survey) add(P.quotesAsked, 'Asked for installer quotes');
  else missing.push('Has not asked for quotes');
  const stages = s.application?.stagesDone ?? 0;
  if (stages === 3) add(P.feasibilityApproved, 'Feasibility approved on the portal: needs a vendor now');
  else if (stages === 2) add(P.applied, 'Has applied on the subsidy portal');
  else if (stages === 1) add(P.registered, 'Has registered on the subsidy portal');

  // What an installer needs before quoting.
  if (s.bill) add(P.bill, s.bill.amount > 0 ? `Shared the bill: ${inr(s.bill.amount)} a month` : `Shared the bill: ${Math.round(s.bill.monthlyUnits)} units a month`);
  else missing.push('No electricity bill yet');
  if (s.roof) {
    add(P.roof, `Roof measured: ${Math.round(s.roof.areaM2 * SQFT_PER_M2).toLocaleString('en-IN')} sq ft`);
    if (s.roof.foundBy === 'tap' || s.roof.foundBy === 'voice' || (s.roofSteps?.length ?? 0) > 0) add(P.roofChecked, 'Checked or corrected the roof themselves');
  } else missing.push('No roof measured yet');
  if (s.design) add(P.system, `System designed: ${s.design.kw} kW, about ${inr(s.design.grossCost)}`);
  else missing.push('No system sized yet');
  const e = s.application?.eligibility;
  if (e) {
    const answers = [e.home, e.name, e.bank, e.roof];
    if (answers.every((a) => a === 'yes')) add(P.conditionsMet, 'Meets all four subsidy conditions');
    else {
      add(P.conditionsAsked, 'Went through the subsidy conditions');
      if (answers.includes('no')) missing.push('One subsidy condition is not met yet');
    }
  }

  // Questions about money and people, which a looker seldom asks.
  if (s.loan) add(P.loan, 'Asked about the bank loan');
  if (s.vendors) add(P.vendors, 'Asked who installs nearby');
  if (s.compare) add(P.sizesCompared, 'Compared two system sizes');
  if (s.longRun) add(P.longRun, 'Asked what it earns over 25 years');

  // How much was asked, and for how long.
  const topics = new Set(s.log.map((l) => l.kind)).size;
  const asks = Math.max(s.log.length, (s.turns ?? []).filter((t) => t.role === 'user').length);
  if (asks >= 3) add(Math.min(P.mostForAsking, Math.floor(asks / 2)), `Asked ${asks} things on ${topics} ${topics === 1 ? 'topic' : 'topics'}`);
  if (s.updatedAt - s.createdAt >= 3_600_000) add(P.stayedOrCameBack, 'Still at it after an hour, or came back');

  reasons.sort((a, b) => b.points - a.points);
  const score = Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0));
  // A household that has already chosen its vendor on the portal is nobody's lead any more.
  const taken = stages >= 4;
  const tier: Tier = taken ? 'low' : score >= LEAD_TIERS.high ? 'high' : score >= LEAD_TIERS.medium ? 'medium' : 'low';
  const next = taken
    ? 'Has already chosen a vendor on the portal. No action.'
    : s.booking
      ? `Visit booked with ${s.booking.installer}. Confirm it and bring a quote.`
      : tier === 'high'
        ? s.survey
          ? 'Call today and send a quote.'
          : 'Ready to buy, and has not asked for quotes yet.'
        : tier === 'medium'
          ? s.survey
            ? 'Send a quote. Still deciding.'
            : 'Interested. Has not asked for quotes yet.'
          : 'Looking around. No action yet.';
  return { score, tier, reasons, missing, next, asks, topics };
}

/** The town at the end of a place's name ("Kundalahalli, Bengaluru" gives "Bengaluru"): as much of an address as a lead that was not passed on may show. */
export function townOf(label?: string): string {
  const parts = (label ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? 'Place not given';
}
