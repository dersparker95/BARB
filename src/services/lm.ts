// =============================================================================
// INTEGRACIÓN — LM STUDIO (FALLBACK LOCAL)
// =============================================================================

interface LMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function callLMStudio(
  messages: LMMessage[],
  lmBase: string,
  lmModel: string = 'local-model',
  maxTokens: number = 1500,
  timeout: number = 120000
): Promise<Response> {
  try {
    const safeLmBase = (lmBase || 'http://localhost:1234/v1').replace(/\/$/, '')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(`${safeLmBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: lmModel,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Error del motor LM Studio: ${response.status}`)
    }

    return response
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('LM Studio tardó demasiado en responder (timeout).')
    } else {
      console.error('Error de red al intentar contactar a LM Studio directamente:', err)
    }
    throw err
  }
}

export default { callLMStudio };
