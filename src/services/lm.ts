import { createApiService } from './api';

export async function callLMStudio(messages: any[], lmBase: string, lmModel: string, maxTokens = 1500, timeout = 120000) {
  try {
    // 1. Extraemos la última pregunta
    const lastMessage = messages[messages.length - 1]?.content || "";
    
    // 2. Extraemos el historial (todos los mensajes menos el último)
    const history = messages.slice(0, -1);

    // 3. Instanciamos nuestro servicio API centralizado
    const api = createApiService();
    
    // 4. Llamamos a la API unificada del backend
    // Nota: Si tienes la máquina seleccionada en el frontend, puedes pasarla aquí como segundo parámetro
    const data = await api.chat.askRAG(lastMessage, undefined, history);
    
    // 5. Adaptamos la respuesta para que el componente de React de Nico la entienda
    // (Simulamos la estructura del fetch original para no romper el UI)
    return {
      ok: true,
      json: async () => data
    };
    
  } catch (err) {
    console.error("❌ Error en la comunicación con el motor RAG de BARB:", err);
    throw err;
  }
}

export default { callLMStudio };