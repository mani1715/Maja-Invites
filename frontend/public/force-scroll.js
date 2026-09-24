// force-scroll.js — DEPRECATED.
//
// This script previously set `document.body.style.overflow = 'visible'` then
// `overflowY = 'auto'`, which produced the computed `overflow: visible auto`
// on <body>. iOS Safari refuses to use a `overflow: visible auto` body as a
// touch scroll container — every drag was silently swallowed.
//
// The fix moved to the inline iframe-only override in index.html. This file
// is intentionally left as a no-op so any cached <script src="/force-scroll.js">
// tag still resolves (404 would log a console error to real users).
//
// DO NOT add scroll-mutation logic here. All overflow rules live in
// index.css + App.css; touch scrolling is enabled by:
//   html  { overflow-y: auto; -webkit-overflow-scrolling: touch; }
//   body  { overflow-x: hidden; overflow-y: auto; }
(function() { /* intentionally empty */ })();
