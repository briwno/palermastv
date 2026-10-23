document.querySelector('#login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const b = document.querySelector('#submit'),
    p = document.querySelector('#password'),
    error = document.querySelector('#error');
  b.disabled = true;
  error.textContent = '';
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: p.value }),
    });
    p.value = '';
    if (r.ok) location.reload();
    else
      error.textContent =
        r.status === 429
          ? 'Muitas tentativas. Aguarde um minuto.'
          : 'Senha incorreta. Tente novamente.';
  } catch {
    error.textContent = 'Não foi possível conectar. Tente novamente.';
  } finally {
    b.disabled = false;
  }
});
