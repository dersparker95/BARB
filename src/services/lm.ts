// @ts-nocheck

// =============================================================================
// INTEGRACIÓN — LM STUDIO (FALLBACK LOCAL)
// =============================================================================
//
// Provee conexión directa con LM Studio como motor de respaldo cuando el
// backend central de FastAPI no está disponible. Sigue el estándar de la
// API de OpenAI para mantener compatibilidad de payloads.
//

/**
 * Ejecuta una solicitud de chat completions directamente contra LM Studio,
 * sin pasar por el backend central.
 *
 * Args:
 *     messages:
 *         Historial de mensajes en formato OpenAI.
 *     lmBase:
 *         URL base del servidor LM Studio.
 *     lmModel:
 *         Identificador del modelo local a utilizar.
 *     maxTokens:
 *         Límite de tokens en la respuesta.
 *     timeout:
 *         Tiempo máximo de espera en milisegundos antes de abortar.
 *
 * Returns:
 *     Objeto Response nativo del fetch, para ser consumido con `.json()`
 *     por los componentes que lo invocan.
 */
export async function callLMStudio(
  messages: any[],
  lmBase: string,
  lmModel: string = 'local-model',
  maxTokens = 1500,
  timeout = 120000
) {
  try {
    // Normaliza la URL base para evitar barras duplicadas.
    const safeLmBase = (lmBase || 'http://localhost:1234/v1').replace(/\/$/, '');

    // Aborta la solicitud si el motor local no responde dentro del timeout.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${safeLmBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: lmModel,
        messages: messages,
        max_tokens: maxTokens,
        temperature: 0.3,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Error del motor LM Studio: ${response.status}`);
    }

    return response;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('LM Studio tardó demasiado en responder (timeout).');
    } else {
      console.error('Error de red al intentar contactar a LM Studio directamente:', err);
    }
    throw err;
  }
}

export default { callLMStudio };
