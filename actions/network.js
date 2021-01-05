/**
 * Text fetch
 *
 * @param _ - unused
 * @param api - api
 * @param bodyEncoder - encoder for body data
 * @param headers - headers
 * @param options - fetch options
 *  Note: **CORS with Credential**, since Chrome 80, February 2020
 *        Cookie will NOT send if it set not meet the policy condition
 *  Note: more info => https://blog.chromium.org/2019/10/developers-get-ready-for-new.html
 *  Note: fix way:
 *          1. update your server and flush client cookie
 *          2. disable Chrome flag(chrome://flags/#same-site-by-default-cookies)
 * @param body: payload
 * @returns {Promise.<string>} response payload
 */
async function TextFetch(_, api, { cors=false, bodyEncoder=null, headers={}, ...options }, body) {
  if (bodyEncoder === 'form') {
    const data = new URLSearchParams()
    for (const [key, value] of Object.entries(body)) {
      data.append(key, value)
    }
    options.body = data
  } else if (bodyEncoder === 'json') {
    options.body = JSON.stringify(body)
    headers['content-type'] = 'application/json'
  }
  if (cors) {
    options.mode = 'cors'
    options.credentials = "include"
  }
  const response = await window.fetch(api, {headers, ...options})
  return await response.text()
}

/**
 * Preview ipfs office file
 * @param _ - unused
 * @param path - ipfs path
 * @returns {Promise.<void>}
 */
async function PreviewOffice(_, path) {
  const url = `https://ipfs.io${path}`
  const previewUrl = `https://view.officeapps.live.com/op/view.aspx?src=${url}`
  window.open(previewUrl, '_blank')
}

export default [TextFetch, PreviewOffice]