import React, { useEffect, useState, useRef } from 'react'

// 🔥 BLINDAJE DE TIPOS: Definimos exactamente qué forma tiene nuestro evento
interface ToastEventDetail {
  msg: string
  ms: number
}

// Función global exportable
export const showToast = (msg: string, ms = 3500) => {
  window.dispatchEvent(
    new CustomEvent<ToastEventDetail>('show-toast', { 
      detail: { msg, ms } 
    })
  )
}

const Toast: React.FC = () => {
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: '', show: false })
  
  // Memoria del temporizador para evitar que los Toasts se superpongan y se oculten antes de tiempo
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    // Le decimos a TypeScript que este evento no es "any", es nuestro CustomEvent
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<ToastEventDetail>
      const { msg, ms } = customEvent.detail

      // 🛡️ ESCUDO DE CARRERAS: Si ya había un Toast mostrándose y su reloj estaba corriendo, lo cancelamos
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }

      // Mostramos el nuevo mensaje
      setToast({ msg, show: true })

      // Iniciamos un nuevo reloj exclusivo para este mensaje
      timerRef.current = window.setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }))
      }, ms)
    }

    window.addEventListener('show-toast', handler)
    
    // Limpieza de memoria (Clean-up) cuando el componente se destruye
    return () => {
      window.removeEventListener('show-toast', handler)
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  return (
    <div 
      id="toast" 
      className={toast.show ? 'show' : ''}
      // 🔥 ACCESIBILIDAD: Obliga a los lectores de pantalla a anunciar este mensaje interrumpiendo otras tareas
      role="alert" 
      aria-live="assertive"
    >
      {toast.msg}
    </div>
  )
}

export default Toast