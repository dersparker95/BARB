// =============================================================================
// IMPORTS
// =============================================================================

import React, { useMemo, useState } from 'react'
import { Message, SourceHit } from '../types'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

// =============================================================================
// COMPONENTE: INDICADOR DE ESCRITURA
// =============================================================================

export const Thinking: React.FC = () => (
  <div className="thinking">
    <span />
    <span />
    <span />
  </div>
)

// =============================================================================
// COMPONENTE: FUENTES CITADAS
// =============================================================================

const Sources: React.FC<{ sources?: SourceHit[]; elapsed?: string; fromAPI?: boolean }> = ({ sources, elapsed, fromAPI }) => {
  if (!sources || sources.length === 0) {
    if (!elapsed) return null;
    return <div className="msg-elapsed">⏱ {elapsed}s{fromAPI ? ' · API' : ' · Local'}</div>
  }
  return (
    <div className="msg-sources">
      <div className="msg-sources-list">
        {sources.map((s, i) => (
          <span key={i} className="msg-source-tag">
            📎 {s.documentName || 'Manual'}{s.pageNumber ? ` (p.${s.pageNumber})` : ''}
          </span>
        ))}
      </div>
      {elapsed && <div className="msg-elapsed">⏱ {elapsed}s{fromAPI ? ' · API' : ' · Local'}</div>}
    </div>
  )
}

// =============================================================================
// COMPONENTE: MARKDOWN SEGURO
// =============================================================================

// Renderiza un subconjunto seguro de Markdown (negritas y saltos de línea) sin
// recurrir a dangerouslySetInnerHTML, evitando así vectores de XSS.
const SafeMarkdown: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  return (
    <>
      {text.split('\n').map((line, lineIndex) => {
        // Aísla los segmentos delimitados por **negritas** del resto del texto.
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <span key={lineIndex} className="md-line">
            {parts.map((part, partIndex) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={partIndex} className="md-strong">{part.slice(2, -2)}</strong>;
              }
              return part;
            })}
          </span>
        );
      })}
    </>
  );
};

// =============================================================================
// COMPONENTE PRINCIPAL: CHAT BUBBLE
// =============================================================================

const ChatBubble: React.FC<{
  msg: Message;
  side?: 'user' | 'bot';
  sources?: SourceHit[];
  elapsed?: string;
  fromAPI?: boolean;
  onFeedback?: (msg: Message, rating: 'good' | 'bad') => void;
}> = ({ msg, side = 'bot', sources, elapsed, fromAPI, onFeedback }) => {
  const isUser = side === 'user'
  const { lang } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])

  // Prioriza las fuentes embebidas por el backend RAG sobre las recibidas por prop.
  const finalSources = msg.sources || sources || []

  // Usa la hora actual si el mensaje no trae timestamp.
  const timeString = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // Refleja el feedback de inmediato en la UI mientras se confirma en el backend.
  const [feedback, setFeedback] = useState<'good' | 'bad' | null>(null)

  const handleFeedback = (type: 'good' | 'bad') => {
    if (feedback) return; // Restringe el voto a una sola vez por mensaje.
    setFeedback(type);
    if (onFeedback) {
      onFeedback(msg, type);
    }
  }

  return (
    <div className={`msg ${side}`}>
      <div className={`msg-avatar ${side}`}>{isUser ? 'OP' : '🤖'}</div>
      <div className="msg-content">
        <div className="msg-bubble">
          <SafeMarkdown text={msg.content || ''} />

          {finalSources.length > 0 && <Sources sources={finalSources} elapsed={elapsed} fromAPI={fromAPI} />}
        </div>

        <div className="msg-footer">
          <span className="msg-time">{timeString}</span>

          {/* Los botones de feedback solo aplican a respuestas de BARB, no a mensajes del usuario. */}
          {!isUser && (
            <div className="feedback-actions">
              {feedback === 'good' && <span className="feedback-msg feedback-msg--good">{t.chatBubble?.thanksFeedback || '¡Gracias por el feedback!'}</span>}
              {feedback === 'bad' && <span className="feedback-msg feedback-msg--bad">{t.chatBubble?.registeredFeedback || 'Registrado para mejorar.'}</span>}

              {!feedback && (
                <>
                  <button
                    onClick={() => handleFeedback('good')}
                    title={t.chatBubble?.goodResponse || 'Buena respuesta'}
                    className="feedback-btn"
                  >
                    👍
                  </button>
                  <button
                    onClick={() => handleFeedback('bad')}
                    title={t.chatBubble?.badResponse || 'Mala respuesta'}
                    className="feedback-btn"
                  >
                    👎
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatBubble