// Copy-to-clipboard with brief visual feedback. Progressive enhancement: if the
// Clipboard API is unavailable nothing breaks - the command text stays selectable.
(function () {
  function flash(el) {
    el.classList.add('is-copied')
    setTimeout(function () {
      el.classList.remove('is-copied')
    }, 1400)
  }

  function wire(el, getTarget) {
    el.addEventListener('click', function () {
      var text = el.getAttribute('data-copy')
      if (!text || !navigator.clipboard) return
      navigator.clipboard.writeText(text).then(function () {
        flash(getTarget())
      })
    })
  }

  // Hero chip and any element that carries its own data-copy.
  document.querySelectorAll('.copy-chip').forEach(function (chip) {
    wire(chip, function () {
      return chip
    })
  })

  // Install code blocks: the data-copy lives on the block, the button triggers it.
  document.querySelectorAll('.codeblock').forEach(function (block) {
    var btn = block.querySelector('.codeblock__copy')
    if (!btn) return
    btn.addEventListener('click', function () {
      var text = block.getAttribute('data-copy')
      if (!text || !navigator.clipboard) return
      navigator.clipboard.writeText(text).then(function () {
        flash(block)
      })
    })
  })
})()
