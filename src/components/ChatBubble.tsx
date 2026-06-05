// @ts-nocheck
import React from 'react'
import { Message, SourceHit } from '../types'

export const Thinking: React.FC = () => (
  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl w-fit border border-gray-100 shadow-sm">
    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse delay-75" />
    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse delay-150" />
  </div>
)

const Sources: React.FC<{ sources?: SourceHit[]; elapsed?: string; fromAPI?: boolean }> = ({ sources, elapsed, fromAPI }) => {
  if (!sources || sources.length === 0) {
    if (!elapsed) return null;
    return <div className="text-xs text-gray-400 mt-2">⏱ {elapsed}s{fromAPI ? ' · API' : ' · Local'}</div>
  }
  return (
    <div className="mt-3 pt-3 border-t border-[var(--border)] opacity-90">
      <div className="flex flex-wrap items-center gap-2 font-mono">
        {sources.map((s, i) => (
          <span 
            key={i} 
            className="px-2 py-1 rounded-md text-[10px] font-bold tracking-wide"
            style={{ background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid rgba(59,130,246,0.3)' }}
          >
            📎 {s.documentName || 'Manual'}{s.pageNumber ? ` (p.${s.pageNumber})` : ''}
          </span>
        ))}
      </div>
      {elapsed && <div className="text-[10px] text-gray-400 mt-2">⏱ {elapsed}s{fromAPI ? ' · API' : ' · Local'}</div>}
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
          <span key={lineIndex} className="block min-h-[14px] mb-1">
            {parts.map((part, partIndex) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                // Removemos los asteriscos y ponemos la etiqueta fuerte segura
                return <strong key={partIndex} className="font-bold text-[var(--ink1)]">{part.slice(2, -2)}</strong>;
              }
              return part;
            })}
          </span>
        );
      })}
    </>
  );
};

const ChatBubble: React.FC<{ msg: Message; side?: 'user' | 'bot'; sources?: SourceHit[]; elapsed?: string; fromAPI?: boolean }> = ({ msg, side = 'bot', sources, elapsed, fromAPI }) => {
  const isUser = side === 'user'
  
  // Leemos las fuentes desde msg.sources (RAG Backend) o desde el prop
  const finalSources = msg.sources || sources || []
  
  // Validación de fecha segura
  const timeString = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`msg ${side}`}>
      <div className={`msg-avatar ${side}`}>{isUser ? 'OP' : '🤖'}</div>
      <div>
        <div className="msg-bubble">
          {/* Usamos el parser seguro en lugar del HTML crudo */}
          <SafeMarkdown text={msg.content || ''} />
          
          {finalSources.length > 0 && <Sources sources={finalSources} elapsed={elapsed} fromAPI={fromAPI} />}
        </div>
        <div className="msg-time">{timeString}</div>
      </div>
    </div>
  )
}

export default ChatBubble