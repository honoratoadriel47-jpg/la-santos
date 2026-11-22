// Logo do cabeçalho: a cada poucos segundos repete um trecho da vinheta
// (brilho nos óculos, reflexo na lente, brilho no bigode e as pontas mexendo).
const mark = document.querySelector('.brand-mark');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const EVERY = 9000;      // intervalo entre animações
const DURATION = 2200;   // duração da animação

function play() {
  if (!mark || reduce.matches || document.hidden) return;
  if (document.documentElement.classList.contains('intro-on')) return; // vinheta ainda na tela
  mark.classList.remove('is-anim');
  void mark.offsetWidth;
  mark.classList.add('is-anim');
  setTimeout(() => mark.classList.remove('is-anim'), DURATION);
}

if (mark) {
  setTimeout(play, 4500); // primeira vez logo depois da vinheta
  setInterval(play, EVERY);
}
