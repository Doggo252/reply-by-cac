// The AI helper's line to the backend. The loop (agentLoop.ts) calls askAI
// once per step; the backend adds Neil's instructions (prompts/agent.md) and
// asks Gemini what to do next.
import type { AskClaude, Block, Message } from './agentLoop'
import { TOOLS } from './agentTools'

// The tool list sent with every step: the name, Neil's "What it does" text,
// and what each tool needs.
export const toolList = () =>
  Object.entries(TOOLS).map(([name, tool]) => ({ name, description: tool.whatItDoes, inputs: tool.inputs }))

export const askAI: AskClaude = async (messages: Message[]): Promise<Block[]> => {
  const response = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, tools: toolList() }),
  })
  // Any failure ends the run with the "internet lost" message (agentLoop.ts).
  if (!response.ok) throw new Error(`the helper's server said ${response.status}`)
  const answer = await response.json()
  return answer.content as Block[]
}
