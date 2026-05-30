// src/lib/providers/anthropic-claude-cli.js
// Anthropic provider that uses the operator's Max plan subscription credit
// by spawning the official `claude` CLI binary as a child process (D-020).
//
// Why this looks different from every other provider in the gateway:
// Anthropic does not currently allow OAuth tokens to be used directly
// against the Messages API. The `claude` CLI is the only legitimate path
// to subscription-credit-billed inference from a server context. Other
// providers (OpenAI, Gemini, etc.) use direct HTTPS API calls.

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const DEFAULT_TIMEOUT_MS = 60_000

/**
 * Call Anthropic via the claude CLI in print mode (`claude -p`).
 *
 * @param {object} opts
 * @param {Array<{role: string, content: string}>} opts.messages
 *        OpenAI-style message array.
 * @param {string} [opts.model]    Optional model override (e.g. claude-sonnet-4-5).
 * @param {number} [opts.timeoutMs] Per-call timeout. Default 60s.
 * @returns {Promise<{
 *   id: string,
 *   model: string,
 *   content: string,
 *   raw_stdout: string,
 *   raw_stderr: string,
 *   exit_code: number,
 *   latency_ms: number
 * }>}
 */
export async function callAnthropicViaClaudeCli({
  messages,
  model,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('claude-cli: messages array is required')
  }

  const prompt = messagesToPrompt(messages)
  const args = ['-p', prompt]
  if (model) {
    args.push('--model', model)
  }

  const startedAt = Date.now()
  const result = await runCli(CLAUDE_BIN, args, { timeoutMs })
  const latencyMs = Date.now() - startedAt

  if (result.code !== 0) {
    const err = new Error(
      `claude CLI exited with code ${result.code}: ${result.stderr.slice(0, 500)}`
    )
    err.exitCode = result.code
    err.stdout = result.stdout
    err.stderr = result.stderr
    err.latencyMs = latencyMs
    throw err
  }

  return {
    id: `chatcmpl-${randomUUID()}`,
    model: model || 'claude-default-cli',
    content: result.stdout.trim(),
    raw_stdout: result.stdout,
    raw_stderr: result.stderr,
    exit_code: result.code,
    latency_ms: latencyMs,
  }
}

/**
 * Collapse an OpenAI-style messages array into a single prompt string the
 * claude CLI can consume. Phase 2A keeps this simple; multi-turn fidelity is
 * preserved by labeling each turn with its role.
 */
function messagesToPrompt(messages) {
  const parts = []
  for (const m of messages) {
    const content = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? m.content.map(c => (typeof c === 'string' ? c : c?.text || '')).join('')
        : ''
    if (!content) continue
    const label = m.role === 'system' ? 'System'
      : m.role === 'assistant' ? 'Assistant'
      : 'User'
    parts.push(`${label}: ${content}`)
  }
  return parts.join('\n\n')
}

function runCli(bin, args, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill('SIGKILL') } catch {}
      reject(new Error(`claude CLI timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8') })

    child.on('error', err => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', code => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}
