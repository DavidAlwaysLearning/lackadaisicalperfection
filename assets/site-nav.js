/* Phones: music store links open in the same tab, so the app launches without leaving a blank tab behind.
   Computers keep opening them in a new window. Runs on its own, before the menu code, and also catches
   links the menu adds later (checked again at tap time). */
(function () {
  var stores = ["open.spotify.com", "music.apple.com", "music.youtube.com"];
  var redirects = ["/spotify/", "/apple/", "/youtube-music/"];

  function isPhone() {
    var ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true; /* iPadOS */
    return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  }

  function isMusicLink(a) {
    var raw = a.getAttribute("href");
    if (!raw) return false;
    var url;
    try { url = new URL(raw, location.href); } catch (err) { return false; }
    var host = url.hostname.toLowerCase();
    if (stores.indexOf(host) !== -1) return true;
    if (url.origin !== location.origin) return false;
    var path = url.pathname.replace(/index\.html$/, "");
    if (path.charAt(path.length - 1) !== "/") path += "/";
    return redirects.indexOf(path) !== -1;
  }

  function sameTab(a) {
    if (a.getAttribute("target") === "_blank" && isMusicLink(a)) a.removeAttribute("target");
  }

  function sweep() {
    if (!isPhone()) return;
    var links = document.querySelectorAll("a[target=_blank]");
    for (var i = 0; i < links.length; i++) sameTab(links[i]);
  }

  /* Tap time, capture phase: runs before the browser follows the link and leaves other click handlers alone. */
  document.addEventListener("click", function (event) {
    if (!isPhone()) return;
    var a = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (a) sameTab(a);
  }, true);

  /* After the menu code below has built its links (and on sites where it re-adds new-window targets). */
  setTimeout(sweep, 0);
  window.addEventListener("load", sweep);
})();

/* Site menu. Add a destination by appending one entry. The open menu lists every other destination. The confirmation page is not a destination. */
(function () {
  var pages = [
    { href: "/", label: "Album" },
    { href: "/apple/", label: "Apple Music", blank: true },
    { href: "/spotify/", label: "Spotify", blank: true },
    { href: "/subscribe/", label: "Subscribe" },
    { href: "/scores/", label: "Scores" }
  ];

  function normalize(path) {
    var p = path || "/";
    var base = location.origin && location.origin !== "null"
      ? location.origin
      : "https://lackadaisicalperfection.com";
    try {
      p = new URL(p, base).pathname;
    } catch (err) {
      p = "/";
    }
    if (p === "/index.html" || p.slice(-11) === "/index.html") {
      p = p.slice(0, -10);
    }
    if (p.charAt(p.length - 1) !== "/") p += "/";
    return p;
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  var here = normalize(location.pathname);
  var links = pages.filter(function (page) {
    return normalize(page.href) !== here;
  });

  var button = document.createElement("button");
  button.type = "button";
  button.className = "nav-toggle";
  button.setAttribute("aria-label", "Open menu");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "site-menu");

  var img = document.createElement("img");
  img.src = "/assets/david-with-lp.jpg";
  img.srcset = "/assets/david-with-lp.jpg 1x, /assets/david-with-lp@2x.jpg 2x";
  img.width = 160;
  img.height = 160;
  img.alt = "";
  img.decoding = "async";
  button.appendChild(img);

  var list = document.createElement("ul");
  list.setAttribute("role", "list");
  links.forEach(function (page) {
    var item = document.createElement("li");
    var link = document.createElement("a");
    link.href = page.href;
    link.textContent = page.label;
    if (page.blank) {
      link.target = "_blank";
      link.rel = "noopener";
    }
    item.appendChild(link);
    list.appendChild(item);
  });

  /* Newest first. Domains are each repo's CNAME. This site is Lackadaisical Perfection. */
  var albums = [
    { title: "Lackadaisical Perfection", host: "lackadaisicalperfection.com", slug: "lackadaisical-perfection" },
    { title: "Piano Reveries and Phantasies", host: "pianoreveries.com", slug: "piano-reveries" },
    { title: "Smitten with the Muses", host: "smittenwiththemuses.com", slug: "smitten-with-the-muses" },
    { title: "Where In The World Is Diane", host: "whereintheworldisdiane.com", slug: "where-in-the-world-is-diane" },
    { title: "Clean Calm Piano", host: "cleancalmpiano.com", slug: "clean-calm-piano" },
    { title: "Tantalizing Proof", host: "tantalizingproof.com", slug: "tantalizing-proof" },
    { title: "Piano In Colors", host: "pianoincolors.com", slug: "piano-in-colors" },
    { title: "Melodic Subtlety", host: "melodicsubtlety.com", slug: "melodic-subtlety" }
  ];

  function albumIsHere(album) {
    var host = (location.hostname || "").replace(/^www\./, "");
    if (host === album.host) return true;
    return (host === "localhost" || host === "127.0.0.1" || host === "") &&
      album.host === "lackadaisicalperfection.com";
  }

  var albumsSection = document.createElement("section");
  albumsSection.className = "albums";
  albumsSection.setAttribute("aria-label", "Albums");

  var albumsLabel = document.createElement("p");
  albumsLabel.className = "albums-label";
  albumsLabel.textContent = "Albums";
  albumsSection.appendChild(albumsLabel);

  var albumList = document.createElement("ul");
  albumList.className = "album-list";
  albums.forEach(function (album) {
    var item = document.createElement("li");
    var img = document.createElement("img");
    img.src = "/assets/albums/" + album.slug + ".jpg";
    img.srcset = "/assets/albums/" + album.slug + ".jpg 1x, /assets/albums/" + album.slug + "@2x.jpg 2x";
    img.width = 48;
    img.height = 48;
    img.alt = album.title + " album cover";
    img.decoding = "async";

    var copy = document.createElement("span");
    copy.className = "album-copy";
    var name = document.createElement("span");
    name.className = "album-title";
    name.textContent = album.title;
    copy.appendChild(name);

    if (albumIsHere(album)) {
      var here = document.createElement("div");
      here.className = "here";
      here.setAttribute("aria-current", "page");
      var note = document.createElement("span");
      note.className = "here-note";
      note.textContent = "You're here";
      copy.appendChild(note);
      here.appendChild(img);
      here.appendChild(copy);
      item.appendChild(here);
    } else {
      var link = document.createElement("a");
      link.href = "https://" + album.host + "/";
      link.target = "_blank";
      link.rel = "noopener";
      link.appendChild(img);
      link.appendChild(copy);
      item.appendChild(link);
    }
    albumList.appendChild(item);
  });
  albumsSection.appendChild(albumList);

  var menu = document.createElement("nav");
  menu.id = "site-menu";
  menu.className = "site-menu";
  menu.setAttribute("aria-label", "Pages");
  menu.hidden = true;
  menu.appendChild(list);
  menu.appendChild(albumsSection);

  document.body.appendChild(button);
  document.body.appendChild(menu);

  var generation = 0;
  var open = false;

  function setOpenState(next) {
    open = next;
    button.setAttribute("aria-expanded", next ? "true" : "false");
    button.setAttribute("aria-label", next ? "Close menu" : "Open menu");
  }

  function finishClose(gen) {
    if (gen !== generation || open) return;
    menu.hidden = true;
    if ("inert" in menu) menu.inert = true;
  }

  function openMenu() {
    generation += 1;
    menu.hidden = false;
    if ("inert" in menu) menu.inert = false;
    if (reducedMotion()) {
      menu.classList.add("is-open");
    } else {
      menu.classList.remove("is-open");
      void menu.offsetWidth;
      menu.classList.add("is-open");
    }
    setOpenState(true);
  }

  function closeMenu(restoreFocus) {
    var gen = generation += 1;
    setOpenState(false);
    menu.classList.remove("is-open");
    if ("inert" in menu) menu.inert = true;
    if (reducedMotion()) {
      finishClose(gen);
    } else {
      var timer = setTimeout(function () { finishClose(gen); }, 400);
      menu.addEventListener("transitionend", function onEnd(event) {
        if (event.target !== menu || event.propertyName !== "opacity") return;
        menu.removeEventListener("transitionend", onEnd);
        clearTimeout(timer);
        finishClose(gen);
      });
    }
    if (restoreFocus) button.focus();
  }

  button.addEventListener("click", function (event) {
    event.stopPropagation();
    if (open) closeMenu(false);
    else openMenu();
  });

  document.addEventListener("click", function (event) {
    if (!open) return;
    if (menu.contains(event.target)) return;
    closeMenu(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    closeMenu(true);
  });
})();
