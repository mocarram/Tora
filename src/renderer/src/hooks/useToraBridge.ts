import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { watchTheme } from '../lib/theme'

/**
 * Boots the renderer against the main process: loads initial data and wires the
 * single event stream to the store. Also keeps the document theme in sync with
 * the user's theme preference.
 */
export function useToraBridge(): void {
  const init = useStore((s) => s.init)
  const applyEvent = useStore((s) => s.applyEvent)
  const setBoards = useStore((s) => s.setBoards)
  const setSettings = useStore((s) => s.setSettings)
  const setLocked = useStore((s) => s.setLocked)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const refreshStats = useStore((s) => s.refreshStats)
  const setUpdateStatus = useStore((s) => s.setUpdateStatus)
  const theme = useStore((s) => s.settings?.theme ?? 'system')

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => watchTheme(theme), [theme])

  useEffect(() => {
    const off = window.tora.onEvent((event) => {
      switch (event.kind) {
        case 'item-added':
        case 'item-updated':
        case 'item-removed':
        case 'items-cleared':
          applyEvent()
          break
        case 'boards-changed':
          void window.tora.listBoards().then(setBoards)
          applyEvent()
          break
        case 'settings-changed':
          setSettings(event.settings)
          if (!event.settings.appLockEnabled) setLocked(false)
          break
        case 'sync-status':
          void refreshStats()
          break
        case 'panel-hidden':
          if (useStore.getState().settings?.appLockEnabled) setLocked(true)
          break
        case 'open-settings':
          setSettingsOpen(true)
          break
        case 'update-status':
          setUpdateStatus(event.status)
          break
        case 'locked':
          setLocked(true)
          break
        case 'unlocked':
          setLocked(false)
          break
        default:
          break
      }
    })
    return off
  }, [
    applyEvent,
    setBoards,
    setSettings,
    setLocked,
    setSettingsOpen,
    refreshStats,
    setUpdateStatus,
  ])
}
