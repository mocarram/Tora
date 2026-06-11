import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Board } from '@core/model'
import { FAVOURITES_BOARD_ID } from '@core/model'
import { Icon } from './Icon'
import styles from './BoardPills.module.css'
import menuStyles from './BoardMenu.module.css'

const ITEM_MIME = 'application/x-tora-item'
const BOARD_MIME = 'application/x-tora-board'
const MENU_WIDTH = 180

/**
 * Deterministic muted dot colour per board: the model has no colour field, so
 * pick from the per-type palette by a stable hash of the board id.
 */
const DOT_VARS = [
  '--type-url',
  '--type-code',
  '--type-color',
  '--type-file',
  '--type-image',
  '--type-richText',
] as const
function dotVar(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return DOT_VARS[Math.abs(h) % DOT_VARS.length] as string
}

interface BoardPillsProps {
  boards: Board[]
  activeBoardId: string | null
  /** Board whose context menu is open (App suppresses panel auto-hide), or null. */
  menuBoardId: string | null
  onMenuBoard: (boardId: string | null) => void
  onBoard: (boardId: string | null) => void
  onNewBoard: () => void
  onAddToBoard: (boardId: string, itemId: string) => void
  onReorderBoards: (orderedIds: string[]) => void
  onRenameBoard: (board: Board) => void
  onDeleteBoard: (board: Board) => void
}

/**
 * Board strip above the deck: History (the whole library) first,
 * then Favourites, then user boards, then the + button. Pills accept clip
 * drops, drag to reorder, and carry a Rename/Delete menu opened by
 * right-click or keyboard (Shift+F10 / the ContextMenu key).
 */
function BoardPillsImpl({
  boards,
  activeBoardId,
  menuBoardId,
  onMenuBoard,
  onBoard,
  onNewBoard,
  onAddToBoard,
  onReorderBoards,
  onRenameBoard,
  onDeleteBoard,
}: BoardPillsProps): React.JSX.Element {
  const [dropBoard, setDropBoard] = useState<string | null>(null)
  const [dragBoard, setDragBoard] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // The pill that opened the menu, so Escape can hand focus back to it.
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const menuBoard = menuBoardId ? (boards.find((b) => b.id === menuBoardId) ?? null) : null

  const openMenu = (board: Board, x: number, y: number, trigger: HTMLButtonElement): void => {
    triggerRef.current = trigger
    setMenuPos({
      x: Math.min(x, window.innerWidth - MENU_WIDTH - 8),
      y: Math.min(y, window.innerHeight - 96),
    })
    onMenuBoard(board.id)
  }

  // Focus the first menu item when the menu opens, so keyboard users land in it.
  useEffect(() => {
    if (menuBoard && menuPos) menuRef.current?.querySelector('button')?.focus()
  }, [menuBoard, menuPos])

  // Dismiss the context menu on outside click or Escape (Escape returns focus
  // to the pill that opened it; an outside click keeps the click's own target).
  useEffect(() => {
    if (!menuBoard) return
    const onDown = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) onMenuBoard(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onMenuBoard(null)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [menuBoard, onMenuBoard])

  const reorder = (fromId: string, toId: string): void => {
    if (fromId === toId) return
    const ids = boards.map((b) => b.id)
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0] as string)
    onReorderBoards(ids)
  }

  return (
    <div className={styles.strip} role="group" aria-label="Boards">
      <button
        aria-pressed={activeBoardId === null}
        className={`${styles.pill} ${activeBoardId === null ? styles.active : ''}`}
        onClick={() => onBoard(null)}
      >
        <Icon name="layers" size={13} />
        <span>History</span>
      </button>

      {boards.map((b) => {
        const isFav = b.id === FAVOURITES_BOARD_ID
        return (
          <button
            key={b.id}
            aria-pressed={activeBoardId === b.id}
            className={`${styles.pill} ${activeBoardId === b.id ? styles.active : ''} ${
              dropBoard === b.id ? styles.dropTarget : ''
            }`}
            draggable={!isFav}
            onClick={() => onBoard(b.id)}
            onContextMenu={(e) => {
              if (isFav) return
              e.preventDefault()
              openMenu(b, e.clientX, e.clientY, e.currentTarget)
            }}
            onKeyDown={(e) => {
              // Keyboard path to the same menu: Shift+F10 or the ContextMenu key.
              if (isFav) return
              if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                openMenu(b, r.left, r.bottom + 4, e.currentTarget)
              }
            }}
            onDragStart={(e) => {
              e.dataTransfer.setData(BOARD_MIME, b.id)
              e.dataTransfer.effectAllowed = 'move'
              setDragBoard(b.id)
            }}
            onDragEnd={() => setDragBoard(null)}
            onDragOver={(e) => {
              if (
                e.dataTransfer.types.includes(ITEM_MIME) ||
                e.dataTransfer.types.includes(BOARD_MIME)
              ) {
                e.preventDefault()
                setDropBoard(b.id)
              }
            }}
            onDragLeave={() => setDropBoard((cur) => (cur === b.id ? null : cur))}
            onDrop={(e) => {
              e.preventDefault()
              setDropBoard(null)
              const itemId = e.dataTransfer.getData(ITEM_MIME)
              if (itemId) {
                onAddToBoard(b.id, itemId)
                return
              }
              const boardId = e.dataTransfer.getData(BOARD_MIME)
              if (boardId) reorder(boardId, b.id)
            }}
          >
            {isFav ? (
              <Icon name="star" size={13} />
            ) : (
              <span
                className={styles.dot}
                style={{ background: `var(${dotVar(b.id)})` }}
                aria-hidden="true"
              />
            )}
            <span>{b.name}</span>
            {dragBoard && dragBoard !== b.id ? <span className={styles.reorderHint} /> : null}
          </button>
        )
      })}

      <button className={styles.add} aria-label="New board" title="New board" onClick={onNewBoard}>
        <Icon name="plus" size={14} />
      </button>

      {menuBoard && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              className={menuStyles.menu}
              style={{ left: menuPos.x, top: menuPos.y, width: MENU_WIDTH }}
              role="menu"
              aria-label={`${menuBoard.name} actions`}
            >
              <button
                className={menuStyles.row}
                role="menuitem"
                onClick={() => {
                  onMenuBoard(null)
                  onRenameBoard(menuBoard)
                }}
              >
                <Icon name="edit" size={14} />
                <span className={menuStyles.name}>Rename</span>
              </button>
              <button
                className={`${menuStyles.row} ${styles.menuDanger}`}
                role="menuitem"
                onClick={() => {
                  onMenuBoard(null)
                  onDeleteBoard(menuBoard)
                }}
              >
                <Icon name="trash" size={14} />
                <span className={menuStyles.name}>Delete</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

// Memoized for the same reason as Sidebar: App re-renders on every store
// change, but the strip only depends on boards/active/menu + stable handlers.
export const BoardPills = memo(BoardPillsImpl)
