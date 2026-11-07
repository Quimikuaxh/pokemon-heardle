/** Logo en una sola linea con la fuente Pokemon Solid (DEC-46); el contorno azul va en la clase global `.logo`. */
export function Logo({ className = '' }: { className?: string }) {
  return <h1 className={`logo font-logo m-0 whitespace-nowrap text-[23px] lg:text-[44px] ${className}`.trim()}>Pokémon Heardle</h1>
}
