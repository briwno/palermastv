import { readFile } from 'node:fs/promises';

const shellURL = new URL('../../src/client/shell/index.html', import.meta.url);

/** Assemble the shell and feature views without hiding page markup in JavaScript. */
export async function renderShell() {
  return expand(shellURL);
}
async function expand(url, ancestors = []) {
  if (ancestors.includes(url.href))
    throw Error('Circular HTML include: ' + url.href);
  let html = await readFile(url, 'utf8');
  const includes = [...html.matchAll(/<!-- include: ([^>]+) -->/g)];
  const contents = await Promise.all(
    includes.map(([, relative]) =>
      expand(new URL(relative.trim(), url), [...ancestors, url.href]),
    ),
  );
  includes.forEach(([placeholder], index) => {
    html = html.replace(placeholder, contents[index]);
  });
  return html;
}
