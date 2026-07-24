// Sisters Lounge Exclusive — Phase 1 interactions.
// Plain JavaScript, no dependencies.

(function () {
  "use strict";

  // --- Mobile navigation -------------------------------------------------
  var toggle = document.querySelector(".nav-toggle");
  var menu = document.getElementById("nav-menu");

  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    // Close the menu after choosing a destination.
    menu.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // --- Footer year -------------------------------------------------------
  var year = document.getElementById("year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  // --- Join form (front-end only in Phase 1) ------------------------------
  var form = document.getElementById("join-form");
  var status = document.getElementById("form-status");

  function setInvalid(field, invalid) {
    field.classList.toggle("invalid", invalid);
  }

  if (form && status) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var name = form.elements.name;
      var email = form.elements.email;
      var message = form.elements.message;

      var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
      var nameOk = name.value.trim().length > 0;
      var messageOk = message.value.trim().length > 0;

      setInvalid(name, !nameOk);
      setInvalid(email, !emailOk);
      setInvalid(message, !messageOk);

      if (!nameOk || !emailOk || !messageOk) {
        status.textContent =
          "Please fill in every field (and double-check your email address).";
        status.className = "form-status error";
        return;
      }

      // Phase 2 will submit this to a backend; for now we confirm locally.
      form.reset();
      status.textContent =
        "JazakiAllahu khayran! Your request has been noted — a moderator " +
        "will be in touch once submissions open.";
      status.className = "form-status success";
    });
  }
})();
