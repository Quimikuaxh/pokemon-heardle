const KEY_ITEMS = [
  { label: 'Canción correcta', className: 'bg-hit' },
  { label: 'Juego correcto', className: 'bg-near' },
  { label: 'Fallo', className: 'bg-miss' },
  { label: 'Saltado', className: 'bg-skipbg' },
]

/** Leyenda de colores del historial; solo en escritorio (en movil no hay sitio). */
// Solo desde xl (1280 px): entre 1024 y 1279 su columna deja sin sitio al historial con pistas.
export function Legend() {
  return (
    <aside aria-label="Leyenda" className="hidden w-[200px] flex-col gap-3 pt-3 text-[13px] text-muted xl:flex">
      <span className="font-mono text-[11px] font-bold tracking-[1px] text-ink">CLAVE</span>
      {KEY_ITEMS.map((item) => (
        <span key={item.label} className="flex items-center gap-2.5">
          <span aria-hidden="true" className={`size-3.5 rounded-[3px] ${item.className}`} />
          {item.label}
        </span>
      ))}
    </aside>
  )
}
