// What each paper is, where people usually find it, and what to say if they
// don't have one. Shown one paper at a time in the reply steps, so nobody has
// to guess what "retirement account statement" means.

export type PaperHelp = {
  what: string // what the paper is, in plain words
  where: string // where people usually find it
  noneLabel?: string // the button for "I don't have this" (only when that's a real answer)
  noneLine?: string // what the cover letter then says, in the person's own voice
}

const HELP: [RegExp, PaperHelp][] = [
  [/renewal form|mc ?210/i, {
    what: 'The renewal form that came in the mail with your letter. Fill it in and sign it.',
    where: "If you can't find it, call your worker and ask them to send a new one.",
  }],
  [/property form|property insert/i, {
    what: 'A short form about anything you own, like a house, a car or money in the bank. It came with your renewal form.',
    where: 'Look in the same envelope as your renewal form.',
  }],
  [/medicare premium/i, {
    what: 'A paper that shows what you pay each month for Medicare.',
    where: 'Your yearly Social Security benefit letter shows it. So does a Medicare Part B bill.',
  }],
  [/income|pay stub|pension|social security letter/i, {
    what: 'A paper that shows how much money you get each month.',
    where: 'Your Social Security award letter (it comes every year, usually in December), a pension statement, or a recent pay stub.',
    noneLabel: "I don't have any income",
    noneLine: 'I do not have any income.',
  }],
  [/bank/i, {
    what: 'The statement from your bank that shows how much is in your account.',
    where: 'It comes in the mail every month, or you can ask your bank for a copy. Send the newest one.',
    noneLabel: "I don't have a bank account",
    noneLine: 'I do not have a bank account.',
  }],
  [/home address|your address|residence|utility|rent receipt/i, {
    what: 'A paper with your name and your address on it.',
    where: 'A power, water or gas bill, a rent receipt, or your lease.',
  }],
  [/life insurance, stocks/i, {
    what: 'Statements for life insurance, stocks, bonds or a retirement account, if you have any.',
    where: 'These come in the mail from the insurance company or the company that holds the account.',
    noneLabel: "I don't have any of these",
    noneLine: 'I do not have life insurance, stocks, bonds or a retirement account.',
  }],
  [/life insurance/i, {
    what: 'Your life insurance policy, or a statement that shows what it is worth.',
    where: 'Look for papers from your insurance company, or call them and ask for a statement.',
    noneLabel: "I don't have life insurance",
    noneLine: 'I do not have life insurance.',
  }],
  [/retirement|ira|401|stocks|bonds/i, {
    what: 'A statement for a retirement account, like an IRA or a 401(k), or for stocks or bonds.',
    where: 'These come in the mail every few months from the company that holds the account.',
    noneLabel: "I don't have any of these",
    noneLine: 'I do not have a retirement account, stocks or bonds.',
  }],
  [/vehicle|car/i, {
    what: 'The registration card for each car you own.',
    where: "It's usually in the glove box, or in a letter from the DMV.",
    noneLabel: "I don't own a car",
    noneLine: 'I do not own a car or other vehicle.',
  }],
  [/property tax/i, {
    what: 'Your property tax bill.',
    where: 'The county sends it once a year, usually in the fall.',
    noneLabel: "I don't own a house or land",
    noneLine: 'I do not own a house or land.',
  }],
  [/real estate|house or land|other property/i, {
    what: 'Papers for any house or land you own, other than the home you live in.',
    where: 'A property tax bill or a deed.',
    noneLabel: "I don't own any other house or land",
    noneLine: 'I do not own any house or land other than the home I live in.',
  }],
  [/sold|gave away|closed an account/i, {
    what: 'Proof that you sold or gave away something you owned, or closed a bank account.',
    where: 'A bill of sale, a letter from the bank, or a deed.',
  }],
  [/driver|photo id/i, {
    what: "Your California driver's license or another photo ID.",
    where: 'Take a photo of the front of the card.',
  }],
  [/social security number/i, {
    what: 'Your Social Security number.',
    where: 'It is on your Social Security card. You can also call your worker and tell them instead.',
  }],
  [/immigration/i, {
    what: 'Your immigration papers or card.',
    where: 'Take a photo of both sides.',
  }],
  [/disability/i, {
    what: 'A paper that shows you have a disability, like a Social Security disability award letter.',
    where: 'Social Security mails the award letter. A doctor can also write a letter.',
  }],
]

export function helpFor(item: string): PaperHelp {
  return (
    HELP.find(([pattern]) => pattern.test(item))?.[1] ?? {
      what: item,
      where: "Look at your letter for details, or call your worker and ask what they need.",
    }
  )
}

// The boxes on pages 2 and 3 of the official MC 355 form (Rev. 07/18), in
// plain words. The person ticks the ones checked on their letter.
export const MC355_BOXES = [
  'Proof of income, like a pay stub, or a Social Security or pension letter',
  'Your newest bank statement',
  'Statements for life insurance, stocks, bonds or a retirement account',
  'The registration for each car you own',
  'Papers for any house or land besides the home you live in',
  'Proof of your address, like a rent receipt or a utility bill',
  "Your driver's license or a photo ID",
  'Your Social Security number',
  'Your immigration papers (both sides)',
  'Proof you sold or gave away property, or closed an account',
  'A Social Security disability award letter',
]
