import { useSyncExternalStore } from 'react'
import type { GameController, GameState } from '../game/controller'

export function useGameState(controller: GameController): GameState {
  return useSyncExternalStore(controller.subscribe, controller.getState)
}
