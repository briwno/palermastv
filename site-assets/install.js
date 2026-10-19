let installPrompt=null;
const installButton=document.querySelector('#install-app'),installHelp=document.querySelector('#install-help');
function standalone(){return matchMedia('(display-mode: standalone)').matches;}
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
if(standalone())installButton.hidden=true;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;installButton.textContent='Instalar PalermasTV ↓';});
installButton.addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;}else{installHelp.hidden=!installHelp.hidden;installButton.setAttribute('aria-expanded',String(!installHelp.hidden));}});
window.addEventListener('appinstalled',()=>{installButton.hidden=true;installHelp.hidden=true;});
