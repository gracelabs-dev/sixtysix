/** "Leave the game?" and the like: a title, a line of text, a red confirm and a way back. Tapping outside cancels. */
export function ConfirmModal({
  title,
  text,
  confirm,
  cancel,
  onConfirm,
  onCancel,
  alt,
}: {
  title: string
  text: string
  confirm: string
  cancel: string
  onConfirm: () => void
  onCancel: () => void
  /** A gentler way out, shown first (the host's "show the winners now"). */
  alt?: { label: string; onClick: () => void }
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <p className="modal-text">{text}</p>
        {alt && (
          <button className="btn-play" onClick={alt.onClick}>
            {alt.label}
          </button>
        )}
        <button className="btn-play btn-danger" onClick={onConfirm}>
          {confirm}
        </button>
        <button className="btn-secondary" onClick={onCancel}>
          {cancel}
        </button>
      </div>
    </div>
  )
}
