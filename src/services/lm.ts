export async function callLMStudio(messages: any[], lmBase: string, lmModel: string, maxTokens = 1500, timeout = 120000) {
  const controller = new AbortController();
  // Elevamos el timeout a 120 segundos por si LM Studio procesa respuestas largas
  const timer = setTimeout(() => controller.abort(), timeout);
  
  try {
    // 1. Extraemos solo el texto de la última pregunta del usuario
    const lastMessage = messages[messages.length - 1]?.content || "";

    // 2. Le pegamos a la ruta relativa unificada a través del proxy de Vite
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: lastMessage,
        language: "es" 
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timer);
    return resp;
    
  } catch (err) {
    clearTimeout(timer);
    console.error("❌ Error conectando al backend unificado:", err);
    throw err;
  }
}

export default { callLMStudio };
