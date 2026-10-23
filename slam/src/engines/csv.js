// A small CSV reader: handles quoted fields, commas and line breaks inside
// quotes, doubled quotes, and Windows line endings. No imports; it returns
// strings only (tx-import.js turns the fields into dates and dollars).

/**
 * Splits CSV text into rows of string fields.
 * @param {string} text the file's contents; a leading UTF-8 byte order mark is dropped.
 * @returns {string[][]} one array per row, fields untrimmed; rows that are blank or whitespace only are left out.
 */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  // Excel writes a byte order mark ahead of the first field; without this the first header would not match.
  const s = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}
