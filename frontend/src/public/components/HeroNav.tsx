import { createContext, useContext, useEffect } from 'react'

/**
 * Lets a page's photo hero tell the layout it is on screen, so the navbar can float
 * see-through over it (white text) until the visitor scrolls.
 */
export const HeroNavContext = createContext<(change: 1 | -1) => void>(() => {})

/** Call from a full-width photo hero at the top of a page. */
export function useHeroNav() {
  const register = useContext(HeroNavContext)
  useEffect(() => {
    register(1)
    return () => register(-1)
  }, [register])
}
