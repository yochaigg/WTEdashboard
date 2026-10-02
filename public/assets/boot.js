'use strict';
/* start-up: load saved settings, pick the page, sign in, then tick every second */
loadRules();
applyRole();
state.screen=pageOf(location.hash);
route();
if(!USER)openLogin(false);
setInterval(()=>tick(false),1000);
