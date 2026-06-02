import { useMemo } from 'react'
import hljs from 'highlight.js/lib/common'
import type { ClipItem } from '@core/model'
import { formatBytes, truncateMiddle } from '@core/format'
import styles from './CardPreview.module.css'

/**
 * Renders the type-specific body of a clip card. Pure presentation; the actual
 * heavy payload (full image/file) is loaded on demand for the large preview.
 */
export function CardPreview({ item }: { item: ClipItem }): React.JSX.Element {
  switch (item.metadata.kind) {
    case 'code':
      return <CodePreview text={item.previewText} language={item.metadata.language} />
    case 'color':
      return <ColorPreview hex={item.metadata.hex} />
    case 'url':
      return (
        <UrlPreview url={item.metadata.url} host={item.metadata.host} title={item.metadata.title} />
      )
    case 'image':
      return (
        <ImagePreview
          width={item.metadata.width}
          height={item.metadata.height}
          thumbnailRef={item.metadata.thumbnailRef}
          dataUrl={undefined}
        />
      )
    case 'file':
      return <FilePreview names={item.metadata.names} bytes={item.byteSize} />
    default:
      return <p className={styles.text}>{item.previewText}</p>
  }
}

function CodePreview({
  text,
  language,
}: {
  text: string
  language: string | null
}): React.JSX.Element {
  const html = useMemo(() => {
    try {
      return language && hljs.getLanguage(language)
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value
    } catch {
      return null
    }
  }, [text, language])

  return (
    <pre className={styles.code}>
      {html ? (
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <code className="hljs">{text}</code>
      )}
    </pre>
  )
}

function ColorPreview({ hex }: { hex: string }): React.JSX.Element {
  return (
    <div className={styles.color}>
      <span className={styles.swatch} style={{ background: hex }} aria-hidden="true" />
      <span className={`${styles.colorHex} mono`}>{hex.toUpperCase()}</span>
    </div>
  )
}

function UrlPreview({
  url,
  host,
  title,
}: {
  url: string
  host: string
  title?: string | undefined
}): React.JSX.Element {
  return (
    <div className={styles.url}>
      <div className={styles.favicon} aria-hidden="true">
        {host.charAt(0).toUpperCase()}
      </div>
      <div className={styles.urlText}>
        {title ? <span className={styles.urlTitle}>{title}</span> : null}
        <span className={`${styles.urlLink} mono`}>{truncateMiddle(url, 52)}</span>
      </div>
    </div>
  )
}

function ImagePreview({
  width,
  height,
  thumbnailRef,
  dataUrl,
}: {
  width: number
  height: number
  thumbnailRef?: string | undefined
  dataUrl?: string | undefined
}): React.JSX.Element {
  const src = dataUrl ?? (thumbnailRef ? `tora-blob://${thumbnailRef}` : undefined)
  return (
    <div className={styles.image}>
      {src ? (
        <img src={src} alt="" className={styles.thumb} loading="lazy" />
      ) : (
        <div className={styles.thumbPlaceholder} aria-hidden="true" />
      )}
      <span className={`${styles.imageDims} mono`}>
        {width}x{height}
      </span>
    </div>
  )
}

function FilePreview({ names, bytes }: { names: string[]; bytes: number }): React.JSX.Element {
  const primary = names[0] ?? 'file'
  const extra = names.length - 1
  return (
    <div className={styles.file}>
      <span className={styles.fileName}>{primary}</span>
      <span className={`${styles.fileMeta} mono`}>
        {formatBytes(bytes)}
        {extra > 0 ? ` +${extra} more` : ''}
      </span>
    </div>
  )
}
