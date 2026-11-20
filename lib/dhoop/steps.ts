/**
 * The way to the subsidy, as the National Portal for Rooftop Solar sets it out
 * (https://pmsuryaghar.gov.in/, read 20 Nov 2026).
 *
 * The ten stages and their names are the portal's own "Application Journey" for a consumer
 * (#/consumer-how-to-apply). The eligibility and document rules are from its FAQ (#/faq,
 * questions 1, 3, 4 and 12) and from the notice on its home page about names that do not
 * match. The plain-language line under each stage is Dhoop's summary: people should confirm it
 * on the portal. This file has no server-only imports, so screens can use it too.
 */

/** Who has to act at a stage. */
export type Actor = 'you' | 'electricity company' | 'vendor' | 'government';

export const SUBSIDY_STEPS: readonly { title: string; who: Actor; detail: string }[] = [
  { title: 'Register on the portal', who: 'you', detail: 'At pmsuryaghar.gov.in, with the mobile number your electricity company has for you. The portal sends an OTP to it, and you type that in yourself.' },
  { title: 'Submit the application', who: 'you', detail: 'Choose your state, district and electricity company, and enter the consumer number from your bill.' },
  { title: 'Feasibility approval', who: 'electricity company', detail: 'Your electricity company checks that your connection can take solar. You wait for its approval.' },
  { title: 'Choose a vendor', who: 'you', detail: 'Pick an installer from the portal\'s list of registered vendors for your electricity company. Only they qualify for the subsidy.' },
  { title: 'Installation starts', who: 'vendor', detail: 'The vendor installs the system. A bank loan, if you take one, is paid to the vendor.' },
  { title: 'Installation details', who: 'vendor', detail: 'The details and photographs of the finished system are entered on the portal.' },
  { title: 'Inspection', who: 'electricity company', detail: 'The electricity company inspects the installation and the net meter.' },
  { title: 'Commissioning', who: 'electricity company', detail: 'It certifies the system. The commissioning certificate appears on the portal.' },
  { title: 'Ask for the subsidy', who: 'you', detail: 'Enter your bank details with a cancelled cheque or a copy of your passbook. The name must be the same as on your electricity bill.' },
  { title: 'Subsidy paid', who: 'government', detail: 'The subsidy is paid straight into your bank account.' },
];

export type Answer = 'yes' | 'no' | 'unknown';

/** What a household is asked before it starts. Each answer is yes, no or not known yet. */
export interface Eligibility {
  /** A home, not a shop or a factory. The scheme is for residential consumers and residents' welfare associations only. */
  home: Answer;
  /** The electricity connection is in the applicant's own name. */
  name: Answer;
  /** The bank account is in exactly the same name as the electricity bill. */
  bank: Answer;
  /** The roof is theirs to use. */
  roof: Answer;
}

export const ELIGIBILITY_CHECKS: readonly { key: keyof Eligibility; ask: string; good: string; fix: string }[] = [
  {
    key: 'home',
    ask: 'Is this for a home, and not a shop or a factory?',
    good: 'A home',
    fix: 'The scheme is only for homes and for residents\' welfare associations. A shop or a factory cannot apply on this portal.',
  },
  {
    key: 'name',
    ask: 'Is the electricity connection in your own name?',
    good: 'Connection in your name',
    fix: 'Apply in the name the connection is in, or ask the electricity company to change the name on the connection first.',
  },
  {
    key: 'bank',
    ask: 'Is your bank account in exactly the same name as on the electricity bill?',
    good: 'Bank account in the same name',
    fix: 'Have the name made the same at the bank or at the electricity company. When they differ, the portal asks for a signed undertaking and a name proof such as Aadhaar or a voter card before it pays.',
  },
  {
    key: 'roof',
    ask: 'Is the roof yours to use?',
    good: 'Roof is yours to use',
    fix: 'A tenant, or a flat without its own roof, needs the written permission of the owner or the housing society first.',
  },
];

/** Where a household stands: ready to apply, something to put right first, or something still to find out. */
export function eligibilityVerdict(e: Eligibility): { verdict: 'ready' | 'fix' | 'check'; fixes: string[]; toCheck: string[] } {
  const fixes = ELIGIBILITY_CHECKS.filter((c) => e[c.key] === 'no').map((c) => c.fix);
  const toCheck = ELIGIBILITY_CHECKS.filter((c) => e[c.key] === 'unknown').map((c) => c.ask);
  return { verdict: fixes.length ? 'fix' : toCheck.length ? 'check' : 'ready', fixes, toCheck };
}

/** What to have at hand before sitting down at the portal. Only the bank document is compulsory there. */
export const KEEP_READY = [
  'The mobile number your electricity company has for you. The portal sends its OTP there.',
  'Your consumer number, from the electricity bill.',
  'A cancelled cheque or a copy of your passbook, in the same name as the bill.',
  'Your Aadhaar number, if you want the scheme\'s bank loan.',
] as const;

/** Said once, whenever the application comes up. Dhoop's own caution, not the portal's wording. */
export const FRAUD_WARNING =
  'Nobody from the scheme asks for an OTP or for money on the phone. You type the OTP yourself, on the portal only, and the subsidy is paid only into your own bank account.';

/** The scheme's toll-free helpline, from the foot of the portal. */
export const HELPLINE = '15555';
