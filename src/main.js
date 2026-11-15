import './styles/main.css';
import { initUnboxing } from './scripts/unboxing.js';
import { initRSVP } from './scripts/rsvp.js';

if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

document.addEventListener('DOMContentLoaded', () => {
    window.scrollTo(0, 0);
    initUnboxing();
    initRSVP();
});
