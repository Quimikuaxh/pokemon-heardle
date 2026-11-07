const KEY_ITEMS = [
  { label: 'Canción correcta', className: 'bg-hit' },
  { label: 'Juego correcto', className: 'bg-near' },
  { label: 'Fallo', className: 'bg-miss' },
  { label: 'Saltado', className: 'bg-skip-bar' },
]

/** Leyenda de colores del historial como teclas de la hoja derecha (DEC-58); solo en escritorio (en movil no hay sitio). */
export function Legend() {
  return (
    <aside aria-label="Leyenda" className="hidden flex-wrap items-center gap-2.5 lg:flex">
      <span className="font-mono text-[11px] font-bold tracking-[2px] text-dex-text">CLAVE</span>
      {KEY_ITEMS.map((item) => (
        <span key={item.label} className="flex items-center gap-2 rounded-lg border-[3px] border-edge bg-dex-deep px-3 py-[7px] text-[13px] font-semibold text-dex-text">
          <span aria-hidden="true" className={`size-3.5 rounded-[3px] border-2 border-edge ${item.className}`} />
          {item.label}
        </span>
      ))}
    </aside>
  )
}
