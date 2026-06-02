import type { ClipItemType } from '@core/model'
import type { IconName } from './Icon'

export interface TypeMeta {
  icon: IconName
  label: string
}

export const TYPE_META: Record<ClipItemType, TypeMeta> = {
  text: { icon: 'text', label: 'Text' },
  richText: { icon: 'richText', label: 'Rich text' },
  image: { icon: 'image', label: 'Image' },
  file: { icon: 'file', label: 'File' },
  url: { icon: 'url', label: 'Link' },
  color: { icon: 'color', label: 'Colour' },
  code: { icon: 'code', label: 'Code' },
}
