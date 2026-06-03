import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ToraApi, type ToraEvent, type ToraMethod } from '@shared/ipc'

/**
 * Secure bridge. The renderer gets exactly one frozen object, `window.tora`.
 * Every method forwards to a single typed invoke channel; events arrive on a
 * single event channel. No Node, fs, or ipcRenderer is exposed directly.
 */

function invoke<T>(method: ToraMethod, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(IPC.invoke, method, args) as Promise<T>
}

// Build the method-forwarding surface. Listed explicitly so the contract is
// auditable and the renderer gets full typing via the `ToraApi` cast.
const methods: ToraMethod[] = [
  'queryItems',
  'getFullContent',
  'copyItem',
  'pasteItem',
  'queuePaste',
  'pinItem',
  'deleteItem',
  'editItem',
  'clearAll',
  'listBoards',
  'createBoard',
  'renameBoard',
  'deleteBoard',
  'reorderBoards',
  'addItemToBoard',
  'removeItemFromBoard',
  'reorderBoardItems',
  'getItemBoards',
  'getSettings',
  'updateSettings',
  'getStorageStats',
  'setCaptureEnabled',
  'getPermissions',
  'requestAccessibility',
  'unlock',
  'getSyncStatus',
  'triggerSync',
  'hidePanel',
  'setWindowMode',
  'setHideSuppressed',
  'getUpdateStatus',
  'checkForUpdates',
  'installUpdate',
  'getAppVersion',
]

const api = {} as Record<string, unknown>
for (const method of methods) {
  api[method] = (...args: unknown[]) => invoke(method, ...args)
}

api.onEvent = (listener: (event: ToraEvent) => void): (() => void) => {
  const channelListener = (_e: unknown, payload: ToraEvent): void => listener(payload)
  ipcRenderer.on(IPC.event, channelListener)
  return () => ipcRenderer.removeListener(IPC.event, channelListener)
}

const bridge: ToraApi = Object.freeze(api) as unknown as ToraApi
contextBridge.exposeInMainWorld('tora', bridge)
