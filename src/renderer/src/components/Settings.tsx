import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AccentTheme, AppSettings, PermissionStatus } from '@shared/ipc'
import { formatBytes } from '@core/format'
import { Icon } from './Icon'
import { ConfirmDialog } from './ConfirmDialog'
import { panelSpring } from '../lib/motion'
import { useStore } from '../store/useStore'
import styles from './Settings.module.css'

type Section =
  | 'general'
  | 'appearance'
  | 'capture'
  | 'shortcuts'
  | 'sync'
  | 'privacy'
  | 'data'
  | 'about'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'capture', label: 'Capture' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'sync', label: 'Sync' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'data', label: 'Data' },
  { id: 'about', label: 'About' },
]

// Selectable accent "vibes". The swatch colour is a representative accent; the
// real retinting (accent + surfaces, per light/dark) lives in tokens.css.
const ACCENTS: { id: AccentTheme; label: string; color: string }[] = [
  { id: 'amber', label: 'Amber', color: '#e8843c' },
  { id: 'rose', label: 'Rose', color: '#e0566f' },
  { id: 'violet', label: 'Violet', color: '#9b7be8' },
  { id: 'ocean', label: 'Ocean', color: '#3fa3e0' },
  { id: 'forest', label: 'Forest', color: '#46b87f' },
  { id: 'graphite', label: 'Graphite', color: '#9aa3b2' },
]

interface SettingsProps {
  open: boolean
  reducedMotion: boolean
  onClose: () => void
}

export function Settings({ open, reducedMotion, onClose }: SettingsProps): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const stats = useStore((s) => s.stats)
  const [section, setSection] = useState<Section>('general')
  const [perms, setPerms] = useState<PermissionStatus | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'history' | 'reset' | null>(null)

  useEffect(() => {
    if (!open) return undefined
    const refresh = (): void => void window.tora.getPermissions().then(setPerms)
    refresh()
    // macOS reports the trust state per process and only after the app sees the
    // change, so re-check when the window regains focus (returning from System
    // Settings) and periodically, instead of only once when this panel opens.
    window.addEventListener('focus', refresh)
    const id = setInterval(refresh, 2000)
    return () => {
      window.removeEventListener('focus', refresh)
      clearInterval(id)
    }
  }, [open])

  useEffect(() => {
    if (open) void window.tora.getAppVersion().then(setVersion)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const update = (patch: Partial<AppSettings>): void => {
    void window.tora.updateSettings(patch)
  }

  if (!settings) return <></>

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={styles.scrim}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.sheet}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            transition={panelSpring}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
          >
            <nav className={styles.nav}>
              <span className={`${styles.navTitle} display`}>Settings</span>
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  className={`${styles.navItem} ${section === s.id ? styles.navActive : ''}`}
                  onClick={() => setSection(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </nav>

            <div className={styles.content}>
              <button className={styles.close} aria-label="Close" onClick={onClose}>
                <Icon name="close" size={16} />
              </button>

              {section === 'general' && (
                <Group title="General">
                  <ToggleRow
                    label="Launch at login"
                    hint="Start Tora automatically when you sign in."
                    checked={settings.launchAtLogin}
                    onChange={(v) => update({ launchAtLogin: v })}
                  />
                  <SelectRow
                    label="Default paste format"
                    value={settings.pasteFormatDefault}
                    options={[
                      { value: 'keep', label: 'Keep formatting' },
                      { value: 'plain', label: 'Plain text' },
                    ]}
                    onChange={(v) =>
                      update({ pasteFormatDefault: v as AppSettings['pasteFormatDefault'] })
                    }
                  />
                  <ToggleRow
                    label="Visual feedback"
                    hint="Flash a confirmation when you paste."
                    checked={settings.visualFeedback}
                    onChange={(v) => update({ visualFeedback: v })}
                  />
                  <ToggleRow
                    label="Sound feedback"
                    checked={settings.soundFeedback}
                    onChange={(v) => update({ soundFeedback: v })}
                  />
                </Group>
              )}

              {section === 'appearance' && (
                <Group title="Appearance">
                  <SelectRow
                    label="Theme"
                    value={settings.theme}
                    options={[
                      { value: 'system', label: 'Follow macOS' },
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' },
                    ]}
                    onChange={(v) => update({ theme: v as AppSettings['theme'] })}
                  />
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <span className={styles.rowLabel}>Accent</span>
                      <span className={styles.rowHint}>
                        Pick the colour vibe for the whole app.
                      </span>
                    </div>
                    <div className={styles.swatches} role="radiogroup" aria-label="Accent">
                      {ACCENTS.map((a) => (
                        <button
                          key={a.id}
                          className={`${styles.swatch} ${settings.accent === a.id ? styles.swatchOn : ''}`}
                          style={{ ['--swatch' as string]: a.color }}
                          role="radio"
                          aria-checked={settings.accent === a.id}
                          aria-label={a.label}
                          title={a.label}
                          onClick={() => update({ accent: a.id })}
                        />
                      ))}
                    </div>
                  </div>
                  <SelectRow
                    label="Window mode"
                    value={settings.windowMode}
                    options={[
                      { value: 'panel', label: 'Bottom panel' },
                      { value: 'window', label: 'Full window' },
                    ]}
                    onChange={(v) => update({ windowMode: v as AppSettings['windowMode'] })}
                  />
                  <ToggleRow
                    label="Reduce motion"
                    hint="Minimise animation regardless of the system setting."
                    checked={settings.reduceMotion}
                    onChange={(v) => update({ reduceMotion: v })}
                  />
                </Group>
              )}

              {section === 'capture' && (
                <Group title="Capture">
                  <ToggleRow
                    label="Capture clipboard"
                    hint="Pause to stop recording new copies."
                    checked={settings.captureEnabled}
                    onChange={(v) => update({ captureEnabled: v })}
                  />
                  <SelectRow
                    label="Keep history for"
                    value={String(settings.retentionDays ?? 'null')}
                    options={[
                      { value: '1', label: '1 day' },
                      { value: '7', label: '1 week' },
                      { value: '30', label: '30 days' },
                      { value: '365', label: '1 year' },
                      { value: 'null', label: 'Unlimited' },
                    ]}
                    onChange={(v) => update({ retentionDays: v === 'null' ? null : Number(v) })}
                  />
                  {settings.retentionDays === null && (
                    <p className={styles.warn}>
                      Unlimited retention keeps every clip forever. Storage will grow without bound.
                    </p>
                  )}
                  <ToggleRow
                    label="Fetch link previews"
                    hint="Look up link titles and favicons locally. Off for maximum privacy."
                    checked={settings.fetchLinkPreviews}
                    onChange={(v) => update({ fetchLinkPreviews: v })}
                  />
                </Group>
              )}

              {section === 'shortcuts' && (
                <Group title="Shortcuts">
                  <HotkeyRow
                    label="Summon Tora"
                    value={settings.globalHotkey}
                    onChange={(v) => update({ globalHotkey: v })}
                  />
                  <p className={styles.hintBlock}>
                    Use accelerator syntax, for example CommandOrControl+Shift+V.
                  </p>
                  <h3 className={styles.subhead}>While Tora is open</h3>
                  <ShortcutList />
                </Group>
              )}

              {section === 'sync' && (
                <Group title="Sync">
                  <SelectRow
                    label="Provider"
                    value={settings.syncProvider}
                    options={[
                      { value: 'local', label: 'Local only' },
                      { value: 'icloud', label: 'iCloud Drive (encrypted)' },
                      { value: 'cloudkit', label: 'CloudKit (not configured)' },
                    ]}
                    onChange={(v) => update({ syncProvider: v as AppSettings['syncProvider'] })}
                  />
                  <p className={styles.hintBlock}>
                    Synced data is encrypted on this device before it leaves. iCloud Drive sync is
                    file-based and eventually consistent. CloudKit needs an Apple Developer account
                    and is not active in this build. See SYNC.md.
                  </p>
                </Group>
              )}

              {section === 'privacy' && (
                <Group title="Privacy">
                  <ToggleRow
                    label="App lock"
                    hint={
                      perms?.biometricsAvailable
                        ? 'Require Touch ID to view your history.'
                        : 'Touch ID is not available on this device.'
                    }
                    checked={settings.appLockEnabled}
                    onChange={(v) => update({ appLockEnabled: v })}
                  />
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <span className={styles.rowLabel}>Accessibility permission</span>
                      <span className={styles.rowHint}>
                        Required for direct paste into the previous app.
                      </span>
                    </div>
                    {perms?.accessibility ? (
                      <span className={styles.granted}>
                        <Icon name="check" size={14} /> Granted
                      </span>
                    ) : (
                      <button
                        className={styles.smallBtn}
                        onClick={() => void window.tora.requestAccessibility()}
                      >
                        Grant
                      </button>
                    )}
                  </div>
                  {perms && !perms.accessibility ? (
                    <p className={styles.warn}>
                      Already enabled Tora in System Settings but it still shows as not granted?
                      macOS only applies Accessibility after the app restarts.{' '}
                      <button
                        className={styles.linkBtn}
                        onClick={() => void window.tora.relaunchApp()}
                      >
                        Restart Tora
                      </button>
                    </p>
                  ) : null}
                  <p className={styles.hintBlock}>
                    Concealed and transient clipboard content (such as passwords) is never stored.
                    Password managers are excluded by default. Everything stays on this device
                    unless you enable sync.
                  </p>
                </Group>
              )}

              {section === 'data' && (
                <Group title="Data">
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <span className={styles.rowLabel}>Clear history and boards</span>
                      <span className={styles.rowHint}>
                        Permanently delete every clip, image, file, and board. Your settings are
                        kept.
                      </span>
                    </div>
                    <button
                      className={`${styles.smallBtn} ${styles.dangerBtn}`}
                      onClick={() => setConfirm('history')}
                    >
                      Clear
                    </button>
                  </div>
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <span className={styles.rowLabel}>Factory reset</span>
                      <span className={styles.rowHint}>
                        Erase all data and reset every setting to its default.
                      </span>
                    </div>
                    <button
                      className={`${styles.smallBtn} ${styles.dangerBtn}`}
                      onClick={() => setConfirm('reset')}
                    >
                      Reset
                    </button>
                  </div>
                  {stats && (
                    <p className={styles.hintBlock}>
                      Tora is currently storing {stats.itemCount} item
                      {stats.itemCount === 1 ? '' : 's'} ({formatBytes(stats.totalBytes)}). Clearing
                      cannot be undone.
                    </p>
                  )}
                </Group>
              )}

              {section === 'about' && (
                <Group title="About">
                  <div className={styles.about}>
                    <span className={`${styles.aboutMark} display`}>Tora</span>
                    {version && <p className={`${styles.aboutVersion} mono`}>Version {version}</p>}
                    <p className={styles.aboutText}>
                      A privacy-first clipboard manager. Local by default, no telemetry.
                    </p>
                    {stats && (
                      <p className={`${styles.aboutStats} mono`}>
                        {stats.itemCount} items - {formatBytes(stats.totalBytes)}
                      </p>
                    )}
                  </div>
                </Group>
              )}

              <ConfirmDialog
                open={confirm === 'history'}
                title="Clear history and boards?"
                message="This permanently deletes every clip, image, file, and board stored on this device. Your settings are kept. This cannot be undone."
                confirmLabel="Clear everything"
                danger
                reducedMotion={reducedMotion}
                onCancel={() => setConfirm(null)}
                onConfirm={() => {
                  void window.tora.clearData({ resetSettings: false })
                  setConfirm(null)
                }}
              />
              <ConfirmDialog
                open={confirm === 'reset'}
                title="Factory reset?"
                message="This erases all clips and boards AND resets every setting to its default. Tora returns to a clean state. This cannot be undone."
                confirmLabel="Reset everything"
                danger
                confirmPhrase="RESET"
                reducedMotion={reducedMotion}
                onCancel={() => setConfirm(null)}
                onConfirm={() => {
                  void window.tora.clearData({ resetSettings: true })
                  setConfirm(null)
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function Group({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      {children}
    </section>
  )
}

/**
 * The in-app keyboard shortcuts, kept in step with the handler in App.tsx. Each
 * entry's `keys` is a list of alternatives (any one works); a single alternative
 * may itself be a chord of keys pressed together, joined with "+".
 */
const IN_APP_SHORTCUTS: { keys: string[][]; label: string }[] = [
  { keys: [['/']], label: 'Search your history' },
  { keys: [['↑'], ['↓'], ['←'], ['→']], label: 'Move between clips' },
  { keys: [['Space']], label: 'Open the large preview' },
  { keys: [['↵']], label: 'Paste the selected clip' },
  { keys: [['⇧', '↵']], label: 'Paste as plain text' },
  { keys: [['C']], label: 'Copy to the clipboard' },
  { keys: [['E']], label: 'Edit the clip' },
  { keys: [['Q']], label: 'Add to the paste queue' },
  { keys: [['P']], label: 'Pin or unpin' },
  { keys: [['⌫']], label: 'Remove the clip' },
  { keys: [['Esc']], label: 'Dismiss Tora' },
]

function ShortcutList(): React.JSX.Element {
  return (
    <dl className={styles.shortcutList}>
      {IN_APP_SHORTCUTS.map((s) => (
        <div key={s.label} className={styles.shortcutRow}>
          <dt className={styles.shortcutKeys}>
            {s.keys.map((chord, i) => (
              <span key={i} className={styles.chord}>
                {i > 0 ? <span className={styles.kbdOr}>or</span> : null}
                {chord.map((key, j) => (
                  <span key={j} className={styles.chordKey}>
                    {j > 0 ? <span className={styles.kbdPlus}>+</span> : null}
                    <kbd className={styles.kbd}>{key}</kbd>
                  </span>
                ))}
              </span>
            ))}
          </dt>
          <dd className={styles.shortcutLabel}>{s.label}</dd>
        </div>
      ))}
    </dl>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {hint ? <span className={styles.rowHint}>{hint}</span> : null}
      </div>
      <button
        className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} />
      </button>
    </div>
  )
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
      </div>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function HotkeyRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}): React.JSX.Element {
  // Uncontrolled with key=value so a settings change resets it without an
  // effect; committed on blur.
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
      </div>
      <input
        key={value}
        className={`${styles.input} mono`}
        defaultValue={value}
        spellCheck={false}
        onBlur={(e) => onChange(e.target.value.trim() || value)}
      />
    </div>
  )
}
