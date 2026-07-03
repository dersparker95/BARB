// @ts-nocheck
import React, { useState } from 'react'
import { Message, SourceHit } from '../types'

export const Thinking: React.FC = () => (
  <div className="thinking">
    <span />
    <span />
    <span />
  </div>
)

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

// 🔥 Escudo de Seguridad: Evitamos dangerouslySetInnerHTML para prevenir ataques XSS
// y renderizamos Markdown básico (negritas y saltos de línea) de forma segura en React
const SafeMarkdown: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  return (
    <>
      {text.split('\n').map((line, lineIndex) => {
        // Separamos el texto buscando el patrón de **negritas**
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <span key={lineIndex} className="md-line">
            {parts.map((part, partIndex) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                // Removemos los asteriscos y ponemos la etiqueta fuerte segura
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

const ChatBubble: React.FC<{
  msg: Message;
  side?: 'user' | 'bot';
  sources?: SourceHit[];
  elapsed?: string;
  fromAPI?: boolean;
  onFeedback?: (msg: Message, rating: 'good' | 'bad') => void;
}> = ({ msg, side = 'bot', sources, elapsed, fromAPI, onFeedback }) => {
  const isUser = side === 'user'

  // Leemos las fuentes desde msg.sources (RAG Backend) o desde el prop
  const finalSources = msg.sources || sources || []

  // Validación de fecha segura
  const timeString = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // Estado local para manejar el feedback visualmente de inmediato
  const [feedback, setFeedback] = useState<'good' | 'bad' | null>(null)

  const handleFeedback = (type: 'good' | 'bad') => {
    if (feedback) return; // Solo permite votar una vez
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
          {/* Usamos el parser seguro en lugar del HTML crudo */}
          <SafeMarkdown text={msg.content || ''} />

          {finalSources.length > 0 && <Sources sources={finalSources} elapsed={elapsed} fromAPI={fromAPI} />}
        </div>

        <div className="msg-footer">
          <span className="msg-time">{timeString}</span>

          {/* Botones de Feedback (Solo visibles en los mensajes de BARB) */}
          {!isUser && (
            <div className="feedback-actions">
              {feedback === 'good' && <span className="feedback-msg feedback-msg--good">¡Gracias por el feedback!</span>}
              {feedback === 'bad' && <span className="feedback-msg feedback-msg--bad">Registrado para mejorar.</span>}

              {!feedback && (
                <>
                  <button
                    onClick={() => handleFeedback('good')}
                    title="Buena respuesta"
                    className="feedback-btn"
                  >
                    👍
                  </button>
                  <button
                    onClick={() => handleFeedback('bad')}
                    title="Mala respuesta"
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