    (function () {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      var COLORS = ["#e87a90", "#b8a8e0", "#f4c4a0", "#6a5acd", "#4aad9a", "#d4943a"];
      document.addEventListener("click", function (e) {
        if (!e.target.closest(".primary-action, .add-name, .add-all-names, .download")) return;
        for (var i = 0; i < 8; i++) {
          var sp = document.createElement("div");
          sp.className = "sparkle";
          var s = 3 + Math.random() * 5;
          sp.style.left = e.clientX + "px";
          sp.style.top = e.clientY + "px";
          sp.style.width = s + "px";
          sp.style.height = s + "px";
          sp.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
          document.body.appendChild(sp);
          var angle = (Math.PI * 2 / 8) * i + (Math.random() - 0.5) * 0.5;
          var dist = 14 + Math.random() * 20;
          sp.animate([
            { opacity: 1, transform: "translate(0,0) scale(1)" },
            { opacity: 0, transform: "translate(" + Math.cos(angle) * dist + "px," + Math.sin(angle) * dist + "px) scale(0)" }
          ], { duration: 400 + Math.random() * 200, easing: "ease-out" })
            .onfinish = function () { sp.remove(); };
        }
      });
    })();
