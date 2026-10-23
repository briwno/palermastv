let groupToken = '';

let groupPlayerId = '';

try {
  groupToken =
    localStorage.getItem('palermas-player-token') || crypto.randomUUID();
  localStorage.setItem('palermas-player-token', groupToken);
} catch {
  groupToken = crypto.randomUUID();
}

const groupIdentity = crypto.subtle
  .digest('SHA-256', new TextEncoder().encode(groupToken))
  .then(
    (bytes) =>
      (groupPlayerId = Array.from(new Uint8Array(bytes))
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')),
  );

export { groupToken, groupPlayerId, groupIdentity };
