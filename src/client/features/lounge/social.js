import { activeMatch } from '../match/match-center.js';
import { matchContext } from './context.js';
import { $, esc, all } from '../../shared/dom.js';
import { refreshLounge } from './refresh.js';
import { toast } from '../../shared/feedback.js';
let widgetsReady = null;

let loadEmbeds = false;

function socialSearch(term) {
  const g = activeMatch?.game;
  return (
    'https://x.com/search?q=' +
    encodeURIComponent(
      (term || g?.home.name + ' ' + g?.away.name) + ' lang:pt',
    ) +
    '&src=typed_query&f=live'
  );
}

function mountSocial() {
  if (!activeMatch) return;
  const context = matchContext(),
    target = $('#match-social');
  if (target.dataset.context === context) return;
  target.dataset.context = context;
  const g = activeMatch.game;
  target.innerHTML = `<section class="panel social-tools"><div class="section-head"><h2>O jogo no X</h2><a class="source-link" id="x-search-link" href="${esc(socialSearch())}" target="_blank" rel="noopener noreferrer">Abrir busca ao vivo ↗</a></div><p>Busque comentários sobre o jogo ou um jogador e traga os melhores posts para o mural do grupo.</p><form id="x-search-form"><label for="x-search">Jogo, jogador ou assunto</label><div class="social-search"><input class="text-input" id="x-search" maxlength="100" value="${esc(g.home.name + ' ' + g.away.name)}"><button class="button subtle">Preparar busca ↗</button></div></form><div class="social-player-chips">${activeMatch.lineups
    .flatMap((l) => l.players.filter((p) => p.starter))
    .map(
      (p) =>
        `<button class="chip" data-player-search="${esc(p.name)}">${esc(p.shortName || p.name)}</button>`,
    )
    .join(
      '',
    )}</div><p class="data-note">A busca abre no X e pode pedir login. O mural abaixo mostra os links compartilhados pelos Palermas.</p></section><section class="panel social-board"><div class="section-head"><h2>Mural de posts</h2><button class="text-button" data-refresh-social>Atualizar ↻</button></div><form id="share-post-form"><label for="post-url">Link público do post</label><div class="social-search"><input class="text-input" id="post-url" type="url" required maxlength="300" placeholder="https://x.com/usuario/status/…"><button class="button lime">Compartilhar</button></div><p class="extra-feedback" role="status"></p></form><button class="button subtle" id="load-x-embeds">Carregar posts do X neste site</button><p class="data-note">Ao carregar, o navegador se conecta ao X para exibir os posts. Se algum não abrir, use o link original.</p><div class="lounge-message" role="status"></div><div id="shared-posts" class="shared-posts"></div></section>`;
  refreshLounge(target, context, renderPosts);
}

function renderPosts(data) {
  const box = $('#shared-posts');
  if (!box) return;
  const signature = JSON.stringify(data.posts);
  if (box.dataset.signature === signature) return;
  box.dataset.signature = signature;
  box.innerHTML = data.posts.length
    ? data.posts
        .map(
          (p) =>
            `<article class="shared-post"><header><strong>@${esc(p.author)}</strong><small>Enviado por ${esc(p.name)}</small></header><div data-embed-post="${p.id}"><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="source-link">Ver post no X ↗</a></div></article>`,
        )
        .join('')
    : '<p class="empty-message">Nenhum post compartilhado sobre este jogo.</p>';
  if (loadEmbeds) embedPosts();
}

async function embedPosts() {
  if (!widgetsReady)
    widgetsReady = new Promise((resolve, reject) => {
      if (window.twttr?.widgets) return resolve();
      const script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      script.onload = () => window.twttr?.ready(resolve);
      script.onerror = () => {
        widgetsReady = null;
        reject(Error('X indisponível'));
      };
      document.head.append(script);
      setTimeout(() => reject(Error('X indisponível')), 12000);
    });
  try {
    await widgetsReady;
    for (const box of all('[data-embed-post]'))
      if (!box.dataset.loaded) {
        box.dataset.loaded = 'true';
        try {
          await window.twttr.widgets.createTweet(box.dataset.embedPost, box, {
            theme: 'dark',
            dnt: true,
            conversation: 'none',
          });
        } catch {}
      }
  } catch {
    toast('O X não carregou. Os links originais continuam disponíveis.');
  }
}

function enableEmbeds() {
  loadEmbeds = true;
  return embedPosts();
}
export { renderPosts, mountSocial, socialSearch, enableEmbeds };
