export async function callLMStudio(messages, lmBase, lmModel, maxTokens = 1500, timeout = 90000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        // 1. Extraemos solo el texto de la última pregunta del usuario
        const lastMessage = messages[messages.length - 1]?.content || "";
        // 2. Le pegamos a TU backend unificado (main.py) en lugar de a LM Studio directo
        const resp = await fetch(`http://localhost:9000/api/chat`, {
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
    }
    catch (err) {
        clearTimeout(timer);
        console.error("❌ Error conectando al backend unificado:", err);
        throw err;
    }
}
export default { callLMStudio };
