// The AI helper's line to the backend. The loop (agentLoop.ts) calls askAI
// once per step; the backend adds Neil's instructions (prompts/agent.md) and
// asks Gemini what to do next.
import type { AskClaude, Block, Message } from './agentLoop'
import { TOOLS } from './agentTools'
import { API, fetchAI } from './online'

// The tool list sent with every step: the name, Neil's "What it does" text,
// and what each tool needs.
export const toolList = () =>
  Object.entries(TOOLS).map(([name, tool]) => ({ name, description: tool.whatItDoes, inputs: tool.inputs }))

export const askAI: AskClaude = async (messages: Message[]): Promise<Block[]> => {
  // fetchAI waits if the server is still waking up (online.ts).
  const response = await fetchAI(
    `${API}/agent`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, tools: toolList() }) },
    { timeout: 90_000 },
  )
  // Any failure ends the run with the "internet lost" message (agentLoop.ts).
  if (!response.ok) throw new Error(`the helper's server said ${response.status}`)
  const answer = await response.json()
  return answer.content as Block[]
}
