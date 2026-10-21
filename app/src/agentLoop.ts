// The AI helper's loop. A plain loop, no framework, readable top to bottom:
//
//   1. Send the conversation so far to Claude (through the backend, which
//      holds the API key).
//   2. If Claude asked for tools, run each one from agentTools.ts. Redact the
//      result, write a log line, and add the result to the conversation.
//   3. Go again, until Claude stops asking for tools or a limit is hit.
//
// The rules come from Neil's agent/TOOLS.md: only tools listed there run,
// every result is redacted before Claude sees it (Section 4), and the limits
// in Section 5 end the run with a hard stop.
import { blankFacts, HardStop, NORMAL_REASONS, TOOLS, type AgentWorld, type RunState, type ToolResult } from './agentTools'
import { redact } from './redact'

// TOOLS.md, Section 5.
export const MAX_TOOL_CALLS = 25
export const MAX_REFUSALS_IN_A_ROW = 3
const STUCK = 'I got stuck. Please try the manual option.'

// The conversation, in a simple shape (the one Anthropic's API uses). The
// backend translates it for Gemini (backend/agent.py). `signature` is a code
// Gemini hands back with each answer and needs returned unchanged; the phone
// just carries it.
export type Block =
  | { type: 'text'; text: string; signature?: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; signature?: string }
  | { type: 'tool_result'; tool_use_id: string; content: string }
export type Message = { role: 'user' | 'assistant'; content: string | Block[] }

// Sends the conversation to Claude and returns Claude's answer. Throws when
// there is no internet.
export type AskClaude = (messages: Message[]) => Promise<Block[]>

// TOOLS.md, Section 6: one line per tool call, IDs only, never any text.
export type LogLine = {
  time: string
  tool: string
  inputs: string
  outcome: 'ok' | 'refuse' | 'stop'
  reason: string
  version: number | null // approved_version at the time
}

export type RunEnd =
  | { finished: true; message: string } // Claude said it was done
  | { finished: false; message: string; rule: string } // a hard stop

// Values under these keys are ours (IDs, dates, fixed code words), never
// anything a person wrote, so they are left as they are. Every other piece of
// text in a result is redacted. The refusal reason is ours too: fixed words
// plus the IDs Claude itself sent.
const KEEP = /(_id|_ids|_date|^date|_type|^saved_at|^drafts_kept|^check|^reason)$/

// `names` are the person's names we already know (from About you and from the
// letter), blanked wherever they appear, like in a paper called "Maria Garcia
// bank statement".
function redactAll(value: unknown, key: string, names: string[]): unknown {
  if (typeof value === 'string') return KEEP.test(key) ? value : redact(value, names).text
  if (Array.isArray(value)) return value.map((item) => redactAll(item, key, names))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactAll(v, k, names)]))
  }
  return value
}

// Section 4: every tool result is redacted, always. If redacting fails, nothing is sent.
function redactResult(result: ToolResult, names: string[]): ToolResult {
  try {
    return redactAll(result, '', names) as ToolResult
  } catch {
    throw new HardStop('Section 4: redaction failed', 'Something went wrong while hiding your private details, so nothing was sent.')
  }
}

// For the log: the names of the inputs, with the value only when it is an ID.
function inputsForLog(input: Record<string, unknown>): string {
  return Object.entries(input)
    .map(([key, value]) => (/_ids?$/.test(key) ? `${key}=${JSON.stringify(value)}` : `${key}=(text)`))
    .join(' ')
}

// Runs one tool by name. A name that is not in TOOLS.md is a soft refuse.
async function runTool(name: string, input: Record<string, unknown>, world: AgentWorld, state: RunState) {
  if (!Object.hasOwn(TOOLS, name)) return { ok: false, reason: `no tool named ${name} in TOOLS.md` }
  return TOOLS[name].run(input, world, state)
}

export async function runAgent(
  world: AgentWorld,
  state: RunState,
  askClaude: AskClaude,
  onLog: (line: LogLine) => void
): Promise<RunEnd> {
  // The first message is only which letter to work on. What to do comes from
  // Neil's prompt, which the backend adds. When the reply has the renewal form
  // in it (a renewal, or a stop letter that asks for it), it also says the app
  // fills it in, and which facts a paper could still fill in. Without this,
  // the Oct 20 run on a stop letter only saw "MC_239A".
  const start: Record<string, unknown> = { letter_id: world.letter.id, letter_type: world.letter.letterType }
  if (world.renewal) start.renewal_form = { filled_in_by_app: true, blank_facts: blankFacts(world.renewal.answers()) }
  const messages: Message[] = [{ role: 'user', content: JSON.stringify(start) }]
  let toolCalls = 0
  let refusalsInARow = 0
  let names: string[] = []
  const log = (tool: string, inputs: string, outcome: LogLine['outcome'], reason = '') =>
    onLog({ time: new Date().toISOString(), tool, inputs, outcome, reason, version: state.packet?.version ?? null })

  try {
    // The person's names: from About you, plus any the redactor finds on the letter.
    try {
      names = [...world.privateNames, ...redact(world.letter.text).names]
    } catch {
      throw new HardStop('Section 4: redaction failed', 'Something went wrong while hiding your private details, so nothing was sent.')
    }
    for (;;) {
      // 1. Ask Claude what to do next.
      let reply: Block[]
      try {
        reply = await askClaude(messages)
      } catch {
        throw new HardStop('Section 5: internet lost', 'The internet connection was lost. Your work is saved; try again later or use the manual option.')
      }
      messages.push({ role: 'assistant', content: reply })

      // Claude asked for no tools: it is done.
      const asks = reply.filter((b) => b.type === 'tool_use')
      if (asks.length === 0) {
        const words = reply.map((b) => (b.type === 'text' ? b.text : '')).join(' ').trim()
        return { finished: true, message: words }
      }

      // 2. Run each tool Claude asked for.
      const results: Block[] = []
      for (const ask of asks) {
        toolCalls += 1
        if (toolCalls > MAX_TOOL_CALLS) throw new HardStop('Section 5: more than 25 tool calls', STUCK)
        const inputs = inputsForLog(ask.input ?? {})

        let result: ToolResult
        try {
          result = await runTool(ask.name, ask.input ?? {}, world, state)
        } catch (error) {
          // Log which tool it was, whatever went wrong, before the run ends.
          log(ask.name, inputs, 'stop', error instanceof HardStop ? error.rule : 'unexpected error')
          throw error
        }
        const safe = redactResult(result, names)
        log(ask.name, inputs, result.ok ? 'ok' : 'refuse', result.ok ? '' : String(result.reason))

        // Count ordinary refusals in a row. Date rejections have their own
        // counter, and "cancelled" or "declined" are normal answers.
        if (result.ok) refusalsInARow = 0
        else if (!result.date_rejected && !NORMAL_REASONS.includes(String(result.reason))) refusalsInARow += 1
        if (refusalsInARow > MAX_REFUSALS_IN_A_ROW) throw new HardStop('Section 5: more than 3 soft refusals in a row', STUCK)

        results.push({ type: 'tool_result', tool_use_id: ask.id, content: JSON.stringify(safe) })
      }
      // 3. Hand the results back to Claude and go again.
      messages.push({ role: 'user', content: results })
    }
  } catch (error) {
    if (error instanceof HardStop) {
      log('(stop)', '', 'stop', error.rule)
      return { finished: false, message: error.message, rule: error.rule }
    }
    // Anything unexpected also ends the run, with a plain message.
    console.error(error)
    log('(stop)', '', 'stop', 'unexpected error')
    return { finished: false, message: 'Something went wrong. Please try the manual option.', rule: 'unexpected error' }
  }
}
