// ==UserScript==
// @name         UNDERTALE Canvas: Import Image (Favicon, No Glow)
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  memories.undertale.com image to pixel converter
// @match        https://memories.undertale.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const GRID_SIZE = 50;
  const SIMULATE_DRAWING = false;

  function waitForStimulusController(identifier = "submit", callback) {
    const tryFind = () => {
      const el = document.querySelector(`[data-controller~="${identifier}"]`);
      const app = window.Stimulus;
      if (el && app) {
        const ctrl = app.getControllerForElementAndIdentifier(el, identifier);
        if (ctrl) return callback(ctrl);
      }
      setTimeout(tryFind, 250);
    };
    tryFind();
  }

  function createUI(submitController) {
    const container = document.createElement("div");
    Object.assign(container.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "9999",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: "10px",
    });

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";

    const importBtn = createStyledButton("IMPORT IMAGE", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;

      const imageData = await convertImageToBinaryGrid(file);
      if (imageData) drawToCanvas(imageData, submitController);
    });

    container.append(importBtn, fileInput);
    document.body.append(container);
  }

  function createStyledButton(labelText, onClick) {
    const btn = document.createElement("button");
    Object.assign(btn.style, {
      padding: "10px 16px",
      backgroundColor: "#000",
      color: "#fff",
      border: "2px solid white",
      borderRadius: "6px",
      fontFamily: "var(--font-pixel), monospace",
      fontSize: "18px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      transition: "all 0.2s ease-in-out",
    });

    const favicon = document.createElement("img");
    favicon.src = "/favicon.ico";
    favicon.alt = "Icon";
    Object.assign(favicon.style, {
      width: "22px",
      height: "22px",
      imageRendering: "pixelated",
    });

    const label = document.createElement("span");
    label.textContent = labelText;

    btn.append(favicon, label);

    btn.addEventListener("mouseenter", () => {
      btn.style.backgroundColor = "#fff";
      btn.style.color = "#000";
    });

    btn.addEventListener("mouseleave", () => {
      btn.style.backgroundColor = "#000";
      btn.style.color = "#fff";
    });

    btn.addEventListener("click", onClick);
    return btn;
  }

  async function convertImageToBinaryGrid(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = GRID_SIZE;
        canvas.height = GRID_SIZE;
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);

        const scale = Math.min(GRID_SIZE / img.width, GRID_SIZE / img.height);
        const newW = img.width * scale;
        const newH = img.height * scale;
        const offsetX = (GRID_SIZE - newW) / 2;
        const offsetY = (GRID_SIZE - newH) / 2;
        ctx.drawImage(img, offsetX, offsetY, newW, newH);

        const pixels = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;
        const grid = [];

        for (let y = 0; y < GRID_SIZE; y++) {
          const row = [];
          for (let x = 0; x < GRID_SIZE; x++) {
            const i = (y * GRID_SIZE + x) * 4;
            const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            row.push(brightness > 127 ? 1 : 0);
          }
          grid.push(row);
        }
        resolve(grid);
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  }

  function getPixelElement(y, x) {
    const selectors = [
      `#pixel_${y + 1}_${x + 1}`,
      `[data-x="${x + 1}"][data-y="${y + 1}"]`,
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function simulateUserDraw(pixelEl) {
    const event = new PointerEvent("pointerdown", { bubbles: true });
    pixelEl.dispatchEvent(event);
    setTimeout(() => {
      const up = new PointerEvent("pointerup", { bubbles: true });
      pixelEl.dispatchEvent(up);
    }, 10);
  }

  function drawToCanvas(grid, controller) {
    const flatImage = grid.flat().map(String).join("");
    const colorClasses = ["bg-soul-0", "bg-soul-1"];

    if (typeof controller.loadImageData === "function") {
      controller.loadImageData(flatImage, true);
      controller.addToUndoHistory?.(flatImage);
      controller.refreshImageData?.();
      localStorage.setItem("submit-image", flatImage);
      notify("IMAGE IMPORTED!", "success");
      return;
    }

    let drawn = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const val = grid[y][x];
        const el = getPixelElement(y, x);
        if (!el) continue;

        if (SIMULATE_DRAWING) {
          simulateUserDraw(el);
        } else {
          el.setAttribute("data-color", val.toString());
          colorClasses.forEach(cls => el.classList.remove(cls));
          el.classList.add(`bg-soul-${val}`);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        drawn++;
      }
    }

    if (controller) {
      controller.imageValue = flatImage;
      controller.addToUndoHistory?.(flatImage);
      controller.refreshImageData?.();
      localStorage.setItem("submit-image", flatImage);
    }

    notify(`🎨 ${drawn}/${GRID_SIZE ** 2} PIXELS DRAWN`, "success");
  }

  function notify(msg, type = "info") {
    const box = document.createElement("div");
    box.textContent = msg;
    const colors = {
      success: "#4CAF50",
      info: "#2196F3",
      warning: "#FFC107",
      error: "#F44336",
    };
    Object.assign(box.style, {
      position: "fixed",
      top: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      background: colors[type] || "#333",
      color: "#fff",
      padding: "10px 16px",
      borderRadius: "6px",
      fontFamily: "var(--font-pixel), monospace",
      fontSize: "16px",
      zIndex: 99999,
      boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
      textAlign: "center",
    });
    document.body.append(box);
    setTimeout(() => box.remove(), 4000);
  }

  waitForStimulusController("submit", (controller) => {
    createUI(controller);
  });
})();
