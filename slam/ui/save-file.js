// Saving a file from the page (owner's ask, 2026-10-28): a download, except where the page sits inside another page
// (the shared app preview) and the browser blocks downloads there. saveFile says which happened, so a screen never
// claims a file was saved when it was not; the caller then offers the words to copy instead.

export const framed = () => { try { return window.self !== window.top; } catch { return true; } };

// 'saved' after a download, 'blocked' when the page is framed (no download is tried there).
export function saveFile(name, text, type = 'application/json') {
  if (framed()) return 'blocked';
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}
