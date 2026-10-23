import { readFile } from 'node:fs/promises';

const shellURL = new URL('../../src/client/shell/index.html', import.meta.url);

/** Assemble the shell and feature views without hiding page markup in JavaScript. */
export async function renderShell() {
  let html = await readFile(shellURL, 'utf8');
  const includes = [...html.matchAll(/<!-- include: ([^>]+) -->/g)];
  const contents = await Promise.all(
    includes.map(([, relative]) =>
      readFile(new URL(relative.trim(), shellURL), 'utf8'),
    ),
  );
  includes.forEach(([placeholder], index) => {
    html = html.replace(placeholder, contents[index]);
  });
  return html;
}
