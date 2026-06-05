import React from 'react'
import PlantTopology from '../components/PlantTopology'

const Topology: React.FC = () => {
  return (
    // 🔥 FIX DE RENDERIZADO: Aseguramos que la página abarque el 100% del Layout
    // para que el mapa topológico (que necesita mucho espacio) no se rompa ni colapse.
    <div className="w-full h-full flex flex-col relative overflow-hidden">
      <PlantTopology />
    </div>
  )
}

export default Topology