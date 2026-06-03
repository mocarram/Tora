import type { SVGProps } from 'react'

/**
 * Curated line-icon set. Stroke uses currentColor. No emoji anywhere in the UI.
 * Icons are intentionally geometric to match the Space Grotesk display face.
 */

export type IconName =
  | 'text'
  | 'richText'
  | 'image'
  | 'file'
  | 'url'
  | 'color'
  | 'code'
  | 'pin'
  | 'copy'
  | 'paste'
  | 'trash'
  | 'search'
  | 'plus'
  | 'settings'
  | 'layers'
  | 'star'
  | 'expand'
  | 'edit'
  | 'queue'
  | 'pause'
  | 'play'
  | 'lock'
  | 'check'
  | 'close'
  | 'chevron'

const PATHS: Record<IconName, string> = {
  text: 'M4 6h16M4 12h16M4 18h10',
  richText: 'M5 5h14M5 5v14M9 9h7M9 13h7M9 17h4',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  url: 'M10 14a4 4 0 0 0 6 0l2-2a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-2 2a4 4 0 0 0 6 6l1-1',
  color:
    'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 3-2a8 8 0 0 0-7-9zM7.5 12.5h.01M10 8h.01M14.5 8h.01',
  code: 'M9 8l-4 4 4 4M15 8l4 4-4 4',
  pin: 'M18 21l-6-4.5L6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  paste: 'M9 4h6v3H9zM7 5H5v15h14V5h-2M9 12h6M9 16h4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-1-3-2 .5a7 7 0 0 0-1.5-1.5L17 4h-3l-.5 2A7 7 0 0 0 12 6l-1.5-1.5L8 6l.5 2A7 7 0 0 0 7 9.5L5 9l-1 3 2 1a7 7 0 0 0 0 2l-2 1 1 3 2-.5A7 7 0 0 0 9.5 19L9 21h3l.5-2a7 7 0 0 0 2 0l1.5 1.5L19 19l-.5-2a7 7 0 0 0 1.5-1.5z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  star: 'M12 3l2.6 5.6 6.4.7-4.7 4.3 1.3 6.4L12 16.9 6.4 20l1.3-6.4L3 9.3l6.4-.7z',
  expand: 'M8 3H4v4M16 3h4v4M16 21h4v-4M8 21H4v-4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  queue: 'M4 7h12M4 12h12M4 17h7M20 14v6M17 17h6',
  pause: 'M9 5v14M15 5v14',
  play: 'M7 5l12 7-12 7z',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  check: 'M5 12l5 5L20 6',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  filled?: boolean
}

export function Icon({ name, size = 16, filled = false, ...rest }: IconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
