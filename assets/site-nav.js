/* Site menu. Add a destination by appending one entry. The open menu lists every other destination. The confirmation page is not a destination. */
(function () {
  var pages = [
    { href: "/", label: "Album" },
    { href: "/apple/", label: "Apple Music" },
    { href: "/spotify/", label: "Spotify" },
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
    item.appendChild(link);
    list.appendChild(item);
  });

  var menu = document.createElement("nav");
  menu.id = "site-menu";
  menu.className = "site-menu";
  menu.setAttribute("aria-label", "Pages");
  menu.hidden = true;
  menu.appendChild(list);

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
