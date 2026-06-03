import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ClipItem } from '@core/model'
import { FAVOURITES_BOARD_ID } from '@core/model'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import styles from './BoardMenu.module.css'

const WIDTH = 232
const GAP = 8

interface BoardMenuProps {
  item: ClipItem
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}

/**
 * "Save to" popover anchored to a card's bookmark button. Lists Favourite (the
 * pin) first, then every board with a check for current membership; picking a
 * row toggles it and closes (single-pick). Portal-rendered so it escapes the
 * card's overflow, and it positions above or below the button depending on room.
 */
export function BoardMenu({ item, anchorRef, onClose }: BoardMenuProps): React.JSX.Element {
  const boards = useStore((s) => s.boards)
  const rootRef = useRef<HTMLDivElement>(null)
  const [memberships, setMemberships] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [pos, setPos] = useState<React.CSSProperties | null>(null)

  // Position relative to the button, opening toward whichever side has more room.
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const r = anchor.getBoundingClientRect()
    const left = Math.min(Math.max(r.right - WIDTH, GAP), window.innerWidth - WIDTH - GAP)
    const spaceAbove = r.top
    const spaceBelow = window.innerHeight - r.bottom
    if (spaceAbove >= spaceBelow) {
      setPos({ left, bottom: window.innerHeight - r.top + GAP, maxHeight: spaceAbove - GAP * 2 })
    } else {
      setPos({ left, top: r.bottom + GAP, maxHeight: spaceBelow - GAP * 2 })
    }
  }, [anchorRef])

  // Load current board membership for the checkmarks.
  useEffect(() => {
    let alive = true
    void window.tora.getItemBoards(item.id).then((ids) => {
      if (alive) setMemberships(new Set(ids))
    })
    return () => {
      alive = false
    }
  }, [item.id])

  // Dismiss on outside click and Escape (Escape cancels the new-board input first).
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !anchorRef.current?.contains(t)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (creating) setCreating(false)
        else onClose()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [anchorRef, onClose, creating])

  const togglePin = (): void => {
    void window.tora.pinItem(item.id, !item.isPinned)
    onClose()
  }

  const toggleBoard = (boardId: string): void => {
    if (memberships.has(boardId)) void window.tora.removeItemFromBoard({ boardId, itemId: item.id })
    else void window.tora.addItemToBoard({ boardId, itemId: item.id })
    onClose()
  }

  const createAndAdd = (): void => {
    const name = newName.trim()
    if (!name) return
    void window.tora.createBoard({ name }).then((board) => {
      void window.tora.addItemToBoard({ boardId: board.id, itemId: item.id })
    })
    onClose()
  }

  // Favourites is represented by the pin row, so drop it from the board list.
  const others = boards.filter((b) => b.id !== FAVOURITES_BOARD_ID)

  if (!pos) return <></>

  return createPortal(
    <div className={styles.menu} style={{ width: WIDTH, ...pos }} role="menu" ref={rootRef}>
      <button className={styles.row} role="menuitem" onClick={togglePin}>
        <Icon name="star" size={15} />
        <span className={styles.name}>Favourite</span>
        {item.isPinned && <Icon name="check" size={14} />}
      </button>

      {others.length > 0 && <div className={styles.divider} />}

      {others.map((b) => {
        const member = memberships.has(b.id)
        return (
          <button
            key={b.id}
            className={styles.row}
            role="menuitem"
            onClick={() => toggleBoard(b.id)}
          >
            <Icon name="layers" size={15} />
            <span className={styles.name}>{b.name}</span>
            {member && <Icon name="check" size={14} />}
          </button>
        )
      })}

      <div className={styles.divider} />

      {creating ? (
        <div className={styles.create}>
          <input
            className={styles.input}
            autoFocus
            placeholder="Board name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              // Keep keystrokes out of the global shortcut handler. Without this,
              // Enter creates the board, closes the menu (unmounting the input),
              // and the now-unfocused window handler also pastes the item.
              e.stopPropagation()
              if (e.key === 'Enter') createAndAdd()
            }}
          />
          <button
            className={styles.createSave}
            aria-label="Create board"
            disabled={!newName.trim()}
            onClick={createAndAdd}
          >
            <Icon name="check" size={14} />
          </button>
        </div>
      ) : (
        <button className={styles.row} role="menuitem" onClick={() => setCreating(true)}>
          <Icon name="plus" size={15} />
          <span className={styles.name}>New board</span>
        </button>
      )}
    </div>,
    document.body,
  )
}
