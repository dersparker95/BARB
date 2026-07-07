// =============================================================================
// IMPORTS
// =============================================================================

import React, { useEffect, useState, useRef } from 'react'

// =============================================================================
// TIPOS
// =============================================================================

interface ToastEventDetail {
  msg: string
  ms: number
}

// =============================================================================
// API PÚBLICA: DISPARADOR DE TOASTS
// =============================================================================

export const showToast = (msg: string, ms = 3500) => {
  window.dispatchEvent(
    new CustomEvent<ToastEventDetail>('show-toast', { 
      detail: { msg, ms } 
    })
  )
}

// =============================================================================
// COMPONENTE PRINCIPAL: TOAST
// =============================================================================

const Toast: React.FC = () => {
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: '', show: false })
  
  // Referencia al temporizador activo, necesaria para cancelarlo si llega un
  // nuevo toast antes de que el anterior termine de mostrarse.
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    // Castea el evento nativo a CustomEvent<ToastEventDetail> para tipar su detail.
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<ToastEventDetail>
      const { msg, ms } = customEvent.detail

      // Cancela el temporizador anterior para que un toast nuevo no se oculte
      // por el reloj de uno previo que seguía corriendo.
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }

      setToast({ msg, show: true })

      timerRef.current = window.setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }))
      }, ms)
    }

    window.addEventListener('show-toast', handler)
    
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
      // Fuerza a los lectores de pantalla a anunciar este mensaje de inmediato,
      // interrumpiendo cualquier otro anuncio en curso.
      role="alert" 
      aria-live="assertive"
    >
      {toast.msg}
    </div>
  )
}

export default Toast