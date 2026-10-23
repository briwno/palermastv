const $ = (s) => document.querySelector(s);

const all = (s) => [...document.querySelectorAll(s)];

const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
export { $, esc, all };
