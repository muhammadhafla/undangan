import './styles/main.css';
import { initUnboxing } from './scripts/unboxing.js';
import { initRSVP } from './scripts/rsvp.js';

document.addEventListener('DOMContentLoaded', () => {
    initUnboxing();
    initRSVP();
});
