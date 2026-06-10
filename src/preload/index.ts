import { contextBridge, ipcRenderer } from 'electron'
import { IPC, TORA_METHODS, type ToraApi, type ToraEvent, type ToraMethod } from '@shared/ipc'

/**
 * Secure bridge. The renderer gets exactly one frozen object, `window.tora`.
 * Every method forwards to a single typed invoke channel; events arrive on a
 * single event channel. No Node, fs, or ipcRenderer is exposed directly.
 */

function invoke<T>(method: ToraMethod, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(IPC.invoke, method, args) as Promise<T>
}

// Build the method-forwarding surface from the shared contract: TORA_METHODS
// is exhaustiveness-checked against ToraApi at compile time, so a new API
// method cannot be forgotten here (a forgotten entry used to surface only as
// a runtime `undefined` on window.tora).
const api = {} as Record<string, unknown>
for (const method of TORA_METHODS) {
  api[method] = (...args: unknown[]) => invoke(method, ...args)
}

api.onEvent = (listener: (event: ToraEvent) => void): (() => void) => {
  const channelListener = (_e: unknown, payload: ToraEvent): void => listener(payload)
  ipcRenderer.on(IPC.event, channelListener)
  return () => ipcRenderer.removeListener(IPC.event, channelListener)
}

const bridge: ToraApi = Object.freeze(api) as unknown as ToraApi
contextBridge.exposeInMainWorld('tora', bridge)
