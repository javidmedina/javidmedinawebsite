import './style.css';
import { initNav } from './modules/nav';
import { initTextMarquee } from './modules/marquee-text';
import { initBoxMarquee } from './modules/marquee-boxes';
import { initContactForm } from './modules/contact-form';
import { initCheckout } from './modules/checkout';
import { initDomainCheckout } from './modules/domain-checkout';
import { initCheckoutStatus } from './modules/checkout-status';

initTextMarquee();
initNav();
initContactForm();
initBoxMarquee();
initCheckout();
initDomainCheckout();
initCheckoutStatus();
