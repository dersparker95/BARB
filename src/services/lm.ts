// @ts-nocheck

/**
 * Servicio de conexión directa con LM Studio.
 * Actúa como "Cerebro de Emergencia" si el backend central de FastAPI se cae.
 * Utiliza el estándar de la API de OpenAI.
 */
export async function callLMStudio(
  messages: any[], 
  lmBase: string, 
  lmModel: string = 'local-model', 
  maxTokens = 1500, 
  timeout = 120000
) {
  try {
    // 1. Limpiamos la URL para evitar errores de doble barra (//)
    const safeLmBase = (lmBase || 'http://localhost:1234/v1').replace(/\/$/, '');

    // 2. Blindaje anti-cuelgues: Si la IA local se satura, abortamos la petición
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // 3. Llamada DIRECTA a LM Studio (sin pasar por FastAPI)
    const response = await fetch(`${safeLmBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: lmModel,
        messages: messages,
        max_tokens: maxTokens,
        temperature: 0.3, // Temperatura baja para respuestas técnicas precisas
        stream: false // Mantenemos false para compatibilidad con la estructura actual del UI
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Error del motor LM Studio: ${response.status}`);
    }

    // Retornamos el objeto Response nativo. 
    // De esta forma, Debug.tsx y DocChat.tsx pueden hacer `await resp.json()` sin problemas.
    return response;
    
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error("❌ LM Studio tardó demasiado en responder (Timeout).");
    } else {
      console.error("❌ Error de red al intentar contactar a LM Studio directamente:", err);
    }
    throw err;
  }
}

export default { callLMStudio };