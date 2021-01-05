import { XLSX } from "../dep.js"

async function BuildExcel(_, sheetName, header, rows) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows.map(row => {
    const data = {}
    for (const [idx, cell] of row.entries()) {
      data[header[idx]] = cell
    }
    return data
  }), { header: header })
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
}

async function Download(_, filename, data) {
  const blob = new Blob([data], {type:"application/octet-stream"})
  const url = URL.createObjectURL(blob);
  const $stub = document.createElement("a");
  $stub.style.display = "none";
  document.body.appendChild($stub);
  $stub.href = url;
  $stub.download = filename;
  $stub.click();
  $stub.remove();
  URL.revokeObjectURL(url);
  return data
}

function ZipArray(_, first, ...more) {
  return first.map((item, idx) => [item, ...more.map(array=>array[idx])])
}

export default [BuildExcel, Download, ZipArray]