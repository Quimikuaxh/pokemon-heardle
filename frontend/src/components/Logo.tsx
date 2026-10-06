/** Logo en una sola linea con la fuente Pokemon Solid (DEC-46); el contorno azul va en la clase global `.logo`. */
export function Logo({ className = '' }: { className?: string }) {
  return <h1 className={`logo font-logo whitespace-nowrap text-2xl lg:text-[40px] ${className}`.trim()}>Pokémon Heardle</h1>
}
