import { toast } from './feedback.js';
function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    toast('Não foi possível salvar a preferência neste navegador.');
  }
}
export { save };
