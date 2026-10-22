// The renewal form (MC 210 RV), filled in for the person.
//
// Instead of telling people to "flip through the pages", the app asks the
// form's questions in plain words, one at a time, and writes the answers into
// the official form (app/public/forms/mc210rv.pdf, the state's fillable PDF).
// The person does not need the paper copy the county mailed: the app makes a
// new, complete copy of the same form, ready to sign.
//
// Neil's decision, Oct 20. It replaces the old plan of a checklist plus page 17.
import { PDFCheckBox, PDFDocument, PDFTextField, StandardFonts } from 'pdf-lib'
import { longDate, printable, usDate, type AboutYou, type PaperFacts } from './packet'
import { t } from './language'
import { inWords } from './words'
import { medicareParts, onFileRows, type OnFileRow } from './countyForm'

// The name boxes of the three income lines on page 5. The form names the
// second and third ones the other way round.
const INCOME_NAME_FIELDS = ['income_name_1', 'income_name_3', 'income_name_2']

// The answers, by question id. Yes/no questions hold "yes" or "no". An empty
// string means the person tapped "I don't know"; a missing key means the
// question was not answered yet.
export type RenewalAnswers = Record<string, string>

// A paper whose photo can answer some questions (proofRead.ts reads it).
export type ProofKind = 'social_security' | 'pension' | 'bank' | 'medicare_card' | 'life_insurance'

export type Question = {
  id: string
  ask: string // the question, in plain words
  help?: string // where to find the answer
  kind: 'yesno' | 'text' | 'money' | 'date' | 'choice'
  choices?: string[] // for "choice"
  many?: boolean // a choice where more than one can be picked
  placeholder?: string
  proof?: ProofKind // a photo of this paper can answer it
  showIf?: (answers: RenewalAnswers) => boolean // a follow-up, asked only after a "yes"
}

const yes = (id: string) => (answers: RenewalAnswers) => answers[id] === 'yes'

export const RENEWAL_QUESTIONS: Question[] = [
  { id: 'date_of_birth', kind: 'date', ask: 'What is your date of birth?' },

  { id: 'household_change', kind: 'yesno', ask: 'Did anyone move in with you, or move out, in the last 12 months?' },
  { id: 'household_change_who', kind: 'text', ask: 'Who moved in or out?', placeholder: 'Their full name', showIf: yes('household_change') },
  { id: 'household_change_what', kind: 'choice', choices: ['Moved in', 'Moved out'], ask: 'Did they move in or move out?', showIf: yes('household_change') },

  { id: 'social_security', kind: 'yesno', ask: 'Do you get Social Security?' },
  {
    id: 'social_security_amount',
    kind: 'money',
    ask: 'How much Social Security do you get each month, before anything is taken out?',
    help: 'Your Social Security letter shows it. Take a photo of the letter and we will read it for you.',
    proof: 'social_security',
    showIf: yes('social_security'),
  },
  { id: 'pension', kind: 'yesno', ask: 'Do you get a pension or other retirement payments?' },
  {
    id: 'pension_amount',
    kind: 'money',
    ask: 'How much is your pension each month, before taxes?',
    help: 'Your pension statement shows it.',
    proof: 'pension',
    showIf: yes('pension'),
  },
  { id: 'job', kind: 'yesno', ask: 'Do you work for pay?' },
  { id: 'job_amount', kind: 'money', ask: 'About how much do you earn each month, before taxes?', help: 'Your pay stubs show it.', showIf: yes('job') },
  { id: 'other_income', kind: 'yesno', ask: 'Do you get any other money, like VA benefits or rent from a tenant?' },
  { id: 'other_income_source', kind: 'text', ask: 'Where does that money come from?', placeholder: 'Like: VA benefits', showIf: yes('other_income') },
  { id: 'other_income_amount', kind: 'money', ask: 'How much is it each month?', showIf: yes('other_income') },
  {
    id: 'income_changes',
    kind: 'yesno',
    ask: 'Does your income change from month to month?',
    help: 'For example, if you work different hours each month. Social Security and pensions usually stay the same.',
    showIf: (a) => ['social_security', 'pension', 'job', 'other_income'].some((id) => a[id] === 'yes'),
  },
  { id: 'free_help', kind: 'yesno', ask: 'Does anyone give you free rent, utilities or food?' },
  { id: 'free_help_what', kind: 'choice', many: true, choices: ['Rent', 'Utilities', 'Food'], ask: 'What do they give you for free?', showIf: yes('free_help') },

  { id: 'bank', kind: 'yesno', ask: 'Do you have a bank or credit union account?' },
  {
    id: 'bank_name',
    kind: 'text',
    ask: 'What is the name of your bank?',
    help: 'Take a photo of your newest bank statement and we will read it for you.',
    proof: 'bank',
    showIf: yes('bank'),
  },
  {
    id: 'bank_balance',
    kind: 'money',
    ask: 'How much money is in the account right now?',
    help: 'Your newest bank statement shows it.',
    proof: 'bank',
    showIf: yes('bank'),
  },
  { id: 'car', kind: 'yesno', ask: 'Do you own a car?' },
  { id: 'car_make', kind: 'text', ask: 'What kind of car is it, and what year?', placeholder: 'Like: Toyota Corolla 2012', showIf: yes('car') },
  { id: 'car_worth', kind: 'money', ask: 'About how much is the car worth?', help: 'A good guess is fine.', showIf: yes('car') },
  { id: 'car_owe', kind: 'money', ask: 'How much do you still owe on it?', help: 'Type 0 if it is paid off.', showIf: yes('car') },
  { id: 'other_property', kind: 'yesno', ask: 'Do you own a house or land besides the home you live in?' },
  { id: 'other_property_details', kind: 'text', ask: 'Where is it, and about how much is it worth?', showIf: yes('other_property') },
  {
    id: 'life_insurance',
    kind: 'yesno',
    ask: 'Do you have life insurance that has a cash value?',
    help: 'Your policy statement says if it has a cash value. If you are not sure, tap Yes and take a photo of the statement.',
  },
  { id: 'life_insurance_company', kind: 'text', ask: 'Which company is it with?', proof: 'life_insurance', showIf: yes('life_insurance') },
  {
    id: 'life_insurance_value',
    kind: 'money',
    ask: 'What is the cash value?',
    help: 'Your policy statement shows it.',
    proof: 'life_insurance',
    showIf: yes('life_insurance'),
  },

  { id: 'medicare', kind: 'yesno', ask: 'Do you have Medicare?' },
  {
    id: 'medicare_number',
    kind: 'text',
    ask: 'What is your Medicare number?',
    help: 'It is on your red, white and blue Medicare card: 11 letters and numbers. Take a photo of the card and we will read it.',
    placeholder: 'Like: 1EG4-TE5-MK73',
    proof: 'medicare_card',
    showIf: yes('medicare'),
  },
  {
    id: 'medicare_part_b_premium',
    kind: 'money',
    ask: 'How much do you pay each month for Medicare Part B?',
    help: 'Your Social Security letter shows it, as the amount taken out for Medicare.',
    proof: 'social_security',
    showIf: yes('medicare'),
  },
  { id: 'part_d', kind: 'yesno', ask: 'Do you pay for a Medicare drug plan (Part D)?', showIf: yes('medicare') },
  { id: 'part_d_premium', kind: 'money', ask: 'How much is your drug plan each month?', showIf: (a) => a.medicare === 'yes' && a.part_d === 'yes' },

  { id: 'long_term_care', kind: 'yesno', ask: 'Do you live in a nursing home or care home?' },
  { id: 'facility_name', kind: 'text', ask: 'What is the name of the place?', showIf: yes('long_term_care') },
  { id: 'facility_address', kind: 'text', ask: 'What is its address?', showIf: yes('long_term_care') },

  { id: 'other_insurance', kind: 'yesno', ask: 'Do you have any other health insurance, like dental, vision, or a supplement plan?' },
  { id: 'other_insurance_company', kind: 'text', ask: 'Which insurance company?', showIf: yes('other_insurance') },
  { id: 'other_insurance_type', kind: 'text', ask: 'What kind of insurance is it?', placeholder: 'Like: dental', showIf: yes('other_insurance') },
  { id: 'other_insurance_premium', kind: 'money', ask: 'How much do you pay for it each month?', showIf: yes('other_insurance') },
]

// The facts the AI helper may fill in from a paper it read (Neil's
// fill_renewal_answers tool, agent/TOOLS.md). Only facts printed on a paper;
// never a question about the person's life.
export const FROM_PAPERS = [
  'social_security_amount',
  'pension_amount',
  'bank_name',
  'bank_balance',
  'medicare_number',
  'medicare_part_b_premium',
  'life_insurance_value',
]

// Short names for those facts, for "We read these from your papers".
export const FROM_PAPER_NAMES: Record<string, string> = {
  social_security_amount: 'Social Security each month',
  pension_amount: 'Pension each month',
  bank_name: 'Your bank',
  bank_balance: 'Money in the bank',
  medicare_number: 'Medicare number',
  medicare_part_b_premium: 'Medicare Part B each month',
  life_insurance_value: 'Life insurance cash value',
  date_of_birth: 'Date of birth', // read from the letter itself (usePapers.ts)
}

// The paper the date of birth is read from.
export const LETTER_PAPER = 'Your letter'

// The yes/no question each of those belongs to. A fact read from a paper
// means the answer to it is yes.
export const PARENT: Record<string, string> = {
  social_security_amount: 'social_security',
  pension_amount: 'pension',
  bank_name: 'bank',
  bank_balance: 'bank',
  medicare_number: 'medicare',
  medicare_part_b_premium: 'medicare',
  life_insurance_value: 'life_insurance',
}

// The questions that apply, given the answers so far.
export const visibleQuestions = (answers: RenewalAnswers) =>
  RENEWAL_QUESTIONS.filter((q) => !q.showIf || q.showIf(answers))

// The facts a paper could show that are still blank, for the questions that
// apply to this person (no bank account: no bank name).
export function blankFacts(answers: RenewalAnswers): string[] {
  const applies = new Set(visibleQuestions(answers).map((q) => q.id))
  return FROM_PAPERS.filter((q) => applies.has(q) && !answers[q])
}

// Which kind of proof a paper is, from its name ("Your newest bank statement": bank).
export const proofKind = (paperName: string) =>
  (Object.keys(PROOF_PAPERS) as ProofKind[]).find((kind) => PROOF_PAPERS[kind] === paperName) ?? null

// The next question to ask: the first one that applies and has no answer yet.
// null when every question that applies is answered.
export function nextQuestion(answers: RenewalAnswers): Question | null {
  return visibleQuestions(answers).find((q) => !(q.id in answers)) ?? null
}

// The papers the county needs as proof, from the answers ("You must attach
// current proof" on the form). The names match paperHelp.ts, so each paper
// gets its "what it is" and "where to find it".
export const PROOF_PAPERS: Record<ProofKind, string> = {
  social_security: 'Your Social Security letter',
  pension: 'Your pension statement',
  bank: 'Your newest bank statement',
  medicare_card: 'Your Medicare card',
  life_insurance: 'Your life insurance statement',
}

export function renewalPapers(answers: RenewalAnswers): string[] {
  const papers: string[] = []
  if (answers.social_security === 'yes') papers.push(PROOF_PAPERS.social_security)
  if (answers.pension === 'yes') papers.push(PROOF_PAPERS.pension)
  if (answers.job === 'yes') papers.push('Your newest pay stubs')
  if (answers.bank === 'yes') papers.push(PROOF_PAPERS.bank)
  if (answers.life_insurance === 'yes') papers.push(PROOF_PAPERS.life_insurance)
  if (answers.car === 'yes') papers.push('The registration for your car')
  if (answers.other_property === 'yes') papers.push('Papers for the house or land you own')
  return papers
}

// "1240" or "$1,240.5" becomes "1,240.50". Anything that is not a number stays as typed.
export function money(value: string | undefined): string {
  const number = Number((value ?? '').replace(/[$,\s]/g, ''))
  if (!value || !Number.isFinite(number)) return value ?? ''
  return number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// What will be written on the form, as short lines for "Look over your
// reply", in the person's language (language.ts). The form itself stays in English.
export function renewalLines(answers: RenewalAnswers): string[] {
  const a = answers
  const BLANK = t('left blank (you can write it in)')
  const notSaid = t('not said')
  const dollars = (value: string | undefined) => (value ? `$${money(value)}` : BLANK)
  const monthly = (value: string | undefined) => (value ? t('${amount} a month', { amount: money(value) }) : BLANK)
  const lines: string[] = []
  if (a.date_of_birth) lines.push(t('Date of birth: {date}', { date: inWords(a.date_of_birth, false) }))
  lines.push(
    a.household_change === 'yes'
      ? a.household_change_what === 'Moved out'
        ? t('Household: {who} moved out', { who: a.household_change_who || t('someone') })
        : t('Household: {who} moved in', { who: a.household_change_who || t('someone') })
      : t('Household: no one moved in or out'),
  )
  if (a.social_security === 'yes') lines.push(t('Social Security: {amount}', { amount: monthly(a.social_security_amount) }))
  if (a.pension === 'yes') lines.push(t('Pension: {amount}', { amount: monthly(a.pension_amount) }))
  if (a.job === 'yes') lines.push(t('Work: {amount}', { amount: monthly(a.job_amount) }))
  if (a.other_income === 'yes') lines.push(`${a.other_income_source || t('Other money')}: ${monthly(a.other_income_amount)}`)
  if (a.free_help === 'yes') {
    const what = (a.free_help_what || '').split(', ').filter(Boolean).map((w) => t(w)).join(', ')
    lines.push(t('Free help with: {what}', { what: what || notSaid }))
  }
  if (a.bank === 'yes') lines.push(t('Bank account: {bank}, {amount}', { bank: a.bank_name || t('bank not named'), amount: dollars(a.bank_balance) }))
  if (a.car === 'yes') {
    lines.push(t('Car: {car}, worth {worth}, owe {owe}', { car: a.car_make || notSaid, worth: dollars(a.car_worth), owe: dollars(a.car_owe) }))
  }
  if (a.other_property === 'yes') lines.push(t('Other house or land: {what}', { what: a.other_property_details || notSaid }))
  if (a.life_insurance === 'yes') {
    lines.push(
      t('Life insurance: {company}, cash value {amount}', {
        company: a.life_insurance_company || t('company not named'),
        amount: dollars(a.life_insurance_value),
      }),
    )
  }
  if (a.medicare === 'yes') {
    lines.push(t('Medicare number: {number}', { number: a.medicare_number || BLANK }))
    lines.push(t('Medicare Part B: {amount}', { amount: monthly(a.medicare_part_b_premium) }))
    if (a.part_d === 'yes') lines.push(t('Drug plan (Part D): {amount}', { amount: monthly(a.part_d_premium) }))
  }
  if (a.long_term_care === 'yes') lines.push(t('Lives at: {place}', { place: a.facility_name || t('care home') }))
  if (a.other_insurance === 'yes') {
    lines.push(
      t('Other insurance: {company} ({type}), {amount}', {
        company: a.other_insurance_company || t('company not named'),
        type: a.other_insurance_type || notSaid,
        amount: monthly(a.other_insurance_premium),
      }),
    )
  }
  if (lines.length === (a.date_of_birth ? 2 : 1)) lines.push(t('No income, accounts or property to report'))
  return lines
}

// Writes the answers into the official form. Returns the filled form, not
// flattened yet (packet.ts flattens it and adds pages 1 to 17 to the packet).
export async function fillRenewalForm(
  formBytes: Uint8Array,
  input: { answers: RenewalAnswers; about: AboutYou; facts: PaperFacts; today: string },
): Promise<PDFDocument> {
  const doc = await PDFDocument.load(formBytes)
  const form = doc.getForm()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fields = new Map(form.getFields().map((field) => [field.getName(), field]))
  // A field missing from the form is skipped instead of stopping everything.
  const write = (name: string, value: string | undefined) => {
    const field = fields.get(name)
    if (!(field instanceof PDFTextField) || !value) return
    // A value on several lines (the name and address) needs a box that wraps,
    // in a smaller size so every line fits.
    if (value.includes('\n')) {
      field.enableMultiline()
      field.setFontSize(8)
    } else {
      // Long words in a narrow box get smaller, instead of being cut off
      // ("Golden State Credit Union" in the property box, Oct 21).
      // Some boxes wrap onto a hidden second line instead, so the size is
      // always set here: 10, or smaller until it fits.
      const width = field.acroField.getWidgets()[0]?.getRectangle().width ?? 0
      const text = printable(value)
      let size = 10
      while (width && size > 5 && font.widthOfTextAtSize(text, size) > width - 4) size -= 0.5
      field.setFontSize(size)
    }
    field.setText(printable(value))
  }
  const tick = (name: string) => {
    const field = fields.get(name)
    if (field instanceof PDFCheckBox) field.check()
  }

  const { answers: a, about, facts: f } = input
  const name = about.name
  const cityLine = `${about.city}, CA ${about.zip}`
  const address = `${about.street}, ${cityLine}`

  // Page 1: the case, from the letter the person confirmed.
  write('Notice date', f.notice_date)
  write('Case number', f.case_number)
  write('Case name', name)
  write('Worker name', f.worker_name)
  write('Worker phone number', f.worker_phone)
  write('Recipient name and address', `${name}\n${address}`) // the box has room for two lines
  write('Recipient 1', name)
  write('Recipient 1: Date of birth', usDate(a.date_of_birth))
  write('Date to respond by', longDate(f.due_date))
  write('Date to respond by1', longDate(f.due_date))

  // Page 2: contact information, from About you.
  write('contact_name', name)
  write('contact_home_street', about.street)
  write('contact_home_address', cityLine)
  write('contact_phone', about.phone)
  write('contact_written', 'English')
  write('contact_speak', 'English')
  tick('a-1')

  // Pages 3 and 4: the household.
  write("Case holder's name", name)
  write("Case holder's name2", name)
  write('household_name_1', name)
  write('household_relation_1', 'Self')
  write('household_address_1', address)
  if (a.household_change === 'yes') {
    write('update_household_name_1', a.household_change_who)
    write('update_household_what_1', a.household_change_what)
  } else {
    tick('household_correct_1-1')
  }

  // Pages 5, 9 and 11: what the county printed in its "Review" boxes, copied
  // back in, with the person's Yes ("still right") or No beside each line
  // (countyForm.ts). Below, a line that is still right is not written again
  // as an update: the form says to write only new or changed information.
  const onFile = onFileRows(a)
  const stillRight = (test: (row: OnFileRow) => boolean) => onFile.some((row) => row.correct === true && test(row))
  const yesNo = (row: OnFileRow) => (row.correct ? 1 : 2) // the left box is Yes
  const amountsOn = (row: OnFileRow) => row.amounts.map((amount) => money(amount)).join(' / ')
  onFile
    .filter((row) => row.section === 'income')
    .slice(0, 3)
    .forEach((row, i) => {
      write(INCOME_NAME_FIELDS[i], name)
      write(`income_source_${i + 1}`, row.kind)
      write(`income_gross_${i + 1}`, row.amounts[0] ? money(row.amounts[0]) : '')
      write(`income_often_${i + 1}`, row.often)
      tick(`income_correct_${i + 1}-${yesNo(row)}`)
    })
  onFile
    .filter((row) => row.section === 'resources')
    .slice(0, 3)
    .forEach((row, i) => {
      write(`resources_name_${i + 1}`, name)
      write(`resources_type_${i + 1}`, row.kind)
      write(`resources_details_${i + 1}`, row.details)
      write(`resources_amount_${i + 1}`, amountsOn(row))
      tick(`resources_correct_${i + 1}-${yesNo(row)}`)
    })
  onFile
    .filter((row) => row.section === 'medicare')
    .slice(0, 2)
    .forEach((row, i) => {
      const parts = medicareParts(row)
      write(`medicare_name_${i + 1}`, name)
      for (const part of ['a', 'b', 'c', 'd'] as const) write(`medicare_part${part}_${i + 1}`, parts[part] ? money(parts[part]) : '')
      tick(`medicare_correct_${i + 1}-${yesNo(row)}`)
    })
  const COUNTY_INCOME = ['Social Security', 'Pension', 'Earnings from work']

  // Page 6: new or changed income, one row each, up to the form's three rows.
  const incomes: [string, string | undefined][] = []
  if (a.social_security === 'yes' && !stillRight((r) => r.kind === 'Social Security')) incomes.push(['Social Security', a.social_security_amount])
  if (a.pension === 'yes' && !stillRight((r) => r.kind === 'Pension')) incomes.push(['Pension', a.pension_amount])
  if (a.job === 'yes' && !stillRight((r) => r.kind === 'Earnings from work')) incomes.push(['Earnings from work', a.job_amount])
  if (a.other_income === 'yes' && !stillRight((r) => r.section === 'income' && !COUNTY_INCOME.includes(r.kind))) {
    incomes.push([a.other_income_source || 'Other income', a.other_income_amount])
  }
  incomes.slice(0, 3).forEach(([source, amount], i) => {
    write(`update_income_name_${i + 1}`, name)
    write(`update_income_source_${i + 1}`, source)
    write(`update_income_gross_${i + 1}`, amount ? money(amount) : '')
    write(`update_income_often_${i + 1}`, 'Monthly')
    tick(`update_income_continue_${i + 1}-1`)
  })

  // Page 6, below the rows: does the income change from month to month?
  if (a.income_changes === 'yes') {
    tick('c-1')
    write('c-1-1', name)
  } else if (a.income_changes === 'no') {
    tick('c-2')
  }

  // Page 7: free rent, utilities or food.
  if (a.free_help === 'yes') {
    tick('d-1')
    write('d-1-1', name)
    const what = a.free_help_what ?? ''
    if (/rent/i.test(what)) tick('d-1-2-1')
    if (/utilit/i.test(what)) tick('d-1-2-2')
    if (/food/i.test(what)) tick('d-1-2-3')
  } else if (a.free_help === 'no') {
    tick('d-2')
  }

  // Page 10: new or changed bank accounts, life insurance, other property, and the car.
  const resources: [string, string | undefined, string][] = []
  if (a.bank === 'yes' && !stillRight((r) => /account/.test(r.kind))) {
    resources.push(['Bank account', a.bank_name, a.bank_balance ? `Balance: $${money(a.bank_balance)}` : ''])
  }
  if (a.life_insurance === 'yes' && !stillRight((r) => r.kind === 'Life insurance')) {
    resources.push(['Life insurance', a.life_insurance_company, a.life_insurance_value ? `Cash value: $${money(a.life_insurance_value)}` : ''])
  }
  if (a.other_property === 'yes' && !stillRight((r) => r.kind === 'House or land')) resources.push(['House or land', a.other_property_details, ''])
  resources.slice(0, 3).forEach(([type, details, report], i) => {
    write(`update_resources_name_${i + 1}`, name)
    write(`update_resources_type_${i + 1}`, type)
    write(`update_resources_details_${i + 1}`, details)
    write(`update_resources_report_${i + 1}`, report)
  })
  // "Previously reported vehicles: do you need to change the value or amount
  // owed?" No, if the county's line for the car is still right.
  const carOnFile = onFile.find((row) => row.kind === 'Vehicle')
  if (carOnFile?.correct) {
    tick('f-2')
  } else if (a.car === 'yes') {
    if (carOnFile) tick('f-1')
    write('vehicle_name', name)
    write('vehicle_make', a.car_make)
    write('vehicle_worth', a.car_worth ? money(a.car_worth) : '')
    write('vehicle_owe', a.car_owe ? money(a.car_owe) : '')
  }

  // Page 11: new or changed Medicare.
  if (a.medicare === 'yes' && !stillRight((r) => r.section === 'medicare')) {
    write('update_medicare_name_1', name)
    write('update_medicare_number_1', a.medicare_number)
    write('update_medicare_partb_1', a.medicare_part_b_premium ? money(a.medicare_part_b_premium) : '')
    if (a.part_d === 'yes') write('update_medicare_partd_1', a.part_d_premium ? money(a.part_d_premium) : '')
  }

  // Page 12: long-term care.
  if (a.long_term_care === 'yes') {
    write('update_longterm_person1_name', name)
    write('update_longterm_person1_facilityname', a.facility_name)
    write('update_longterm_person1_facilityaddress', a.facility_address)
  }

  // Page 13: other health insurance.
  if (a.other_insurance === 'yes') {
    write('update_other_health_name_1', name)
    write('update_other_health_insurance_1', a.other_insurance_company)
    write('update_other_health_type_1', a.other_insurance_type)
    write('update_other_health_amount_1', a.other_insurance_premium ? money(a.other_insurance_premium) : '')
    write('update_other_health_often_1', 'Monthly')
  }

  // Page 17: the date beside the signature.
  write('sig_date', usDate(input.today))

  form.updateFieldAppearances(font)
  return doc
}
