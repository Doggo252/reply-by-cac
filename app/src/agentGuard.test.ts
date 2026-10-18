import { expect, it } from 'vitest'
import { HardStop, newRunState, TOOLS, type AgentWorld, type Packet } from './agentTools'
import { runAgent, type LogLine } from './agentLoop'

function goodPacket(): Packet {
  return {
    id: 'packet-1',
    status: 'approved',
    version: 1,
    paperIds: [],
    draftIds: [],
    formFacts: {},
    check: { pass: true, version: 1, yellowBoxes: [] },
    signature: { png: new Uint8Array([1]), version: 1 },
    builtVersions: [],
  }
}

async function tryBuild(packet: Packet) {
  const world = { build: async () => 'saved' } as unknown as AgentWorld
  const state = newRunState()
  state.packet = packet
  try {
    await TOOLS.build_packet.run({ packet_id: 'packet-1' }, world, state)
    return null
  } catch (error) {
    if (error instanceof HardStop) return error.rule
    throw error
  }
}

it('builds when approved, checked and signed', async () => {
  const result = await tryBuild(goodPacket())
  expect(result).toBe(null)
})

it('refuses when not signed', async () => {
  const packet = goodPacket()
  packet.signature = null
  const result = await tryBuild(packet)
  expect(result).toContain('not signed')
})

it('refuses when not approved yet', async () => {
  const packet = goodPacket()
  packet.status = "proposed"
  const result = await tryBuild(packet)
  expect(result).toContain('no approved packet')
})

it('refuses when the check failed', async () => {
  const packet = goodPacket()
  packet.check!.pass = false
  const result = await tryBuild(packet)
  expect(result).toContain('has not passed')
})

it('refuses when the check was for an older version', async () => {
  const packet = goodPacket()
  packet.check!.version = 2
  const result = await tryBuild(packet)
  expect(result).toContain('check was for an older version')
})

it('refuses when the signature was for an older version', async () => {
  const packet = goodPacket()
  packet.signature!.version = 2
  const result = await tryBuild(packet)
  expect(result).toContain('signature was for an older version')
})

it('refuses to build the same version twice', async () => {
  const packet = goodPacket()
  packet.builtVersions = [0,1,2]
  const result = await tryBuild(packet)
  expect(result).toContain('already built')
})

it('writes the refusal in the action log', async () => {
  // A pretend AI that asks for build_packet right away, before any reply exists.
  let asked = false
  const ask = async () => {
    if (asked) return [{ type: 'text' as const, text: 'done' }]
    asked = true
    return [{ type: 'tool_use' as const, id: 'call-1', name: 'build_packet', input: { packet_id: 'packet-1' } }]
  }
  const world = { letter: { id: 'l1', letterType: 'MC_239A', facts: {}, text: '' }, privateNames: [] } as unknown as AgentWorld
  const log: LogLine[] = []
  const end = await runAgent(world, newRunState(), ask, (line) => log.push(line))

  expect(end.finished).toBe(false)
  const line = log.find((l) => l.tool === "build_packet")
  expect(line?.outcome).toBe('stop')
})