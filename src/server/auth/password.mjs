const enc = new TextEncoder();
export async function equal(a, b) {
  const [x, y] = await Promise.all(
    [a, b].map((v) => crypto.subtle.digest('SHA-256', enc.encode(v))),
  );
  const aa = new Uint8Array(x),
    bb = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
