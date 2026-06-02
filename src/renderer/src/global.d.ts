import type { ToraApi } from '@shared/ipc'

declare global {
  interface Window {
    tora: ToraApi
  }
}

export {}
