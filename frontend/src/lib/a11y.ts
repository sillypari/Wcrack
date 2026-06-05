export function trapFocus(element: HTMLElement) {
  const focusableEls = element.querySelectorAll<HTMLElement>(
    'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select, [tabindex]:not([tabindex="-1"])'
  )
  const firstFocusableEl = focusableEls[0]
  const lastFocusableEl = focusableEls[focusableEls.length - 1]

  const handleKeyDown = (e: KeyboardEvent) => {
    const isTabPressed = e.key === 'Tab' || e.keyCode === 9

    if (!isTabPressed) {
      return
    }

    if (e.shiftKey) {
      if (document.activeElement === firstFocusableEl) {
        lastFocusableEl.focus()
        e.preventDefault()
      }
    } else {
      if (document.activeElement === lastFocusableEl) {
        firstFocusableEl.focus()
        e.preventDefault()
      }
    }
  }

  element.addEventListener('keydown', handleKeyDown)

  return () => {
    element.removeEventListener('keydown', handleKeyDown)
  }
}
