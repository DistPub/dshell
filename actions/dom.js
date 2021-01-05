function SelectText(_, { selector, killImg=false }, html) {
  if (killImg) {
    html = html.replace(/<img\b/ig, '<imgkiller')
  }

  const element = document.createElement('div')
  element.innerHTML = html
  const target = element.querySelector(selector)
  return target ? target.innerText : null
}

export default [SelectText]