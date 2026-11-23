export function createIcon(name: string, className = "size-4"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", className);

  switch (name) {
    case "layers": {
      // 3 overlapping layers
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("d", "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z");
      const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p2.setAttribute("d", "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65");
      const p3 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p3.setAttribute("d", "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65");
      svg.append(p1, p2, p3);
      break;
    }
    case "grid": {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("width", "18");
      rect.setAttribute("height", "18");
      rect.setAttribute("x", "3");
      rect.setAttribute("y", "3");
      rect.setAttribute("rx", "2");
      const l1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      l1.setAttribute("d", "M3 9h18M3 15h18M9 3v18M15 3v18");
      svg.append(rect, l1);
      break;
    }
    case "cpu": {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("width", "16");
      rect.setAttribute("height", "16");
      rect.setAttribute("x", "4");
      rect.setAttribute("y", "4");
      rect.setAttribute("rx", "2");
      const rect2 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect2.setAttribute("width", "6");
      rect2.setAttribute("height", "6");
      rect2.setAttribute("x", "9");
      rect2.setAttribute("y", "9");
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2");
      svg.append(rect, rect2, p);
      break;
    }
    case "database": {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      el.setAttribute("cx", "12");
      el.setAttribute("cy", "5");
      el.setAttribute("rx", "9");
      el.setAttribute("ry", "3");
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("d", "M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5");
      const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p2.setAttribute("d", "M3 12c0 1.66 4 3 9 3s9-1.34 9-3");
      svg.append(el, p1, p2);
      break;
    }
    case "refresh-cw":
    case "rotate-ccw": {
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("d", "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8");
      const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p2.setAttribute("d", "M3 3v5h5");
      svg.append(p1, p2);
      break;
    }
    case "play": {
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", "6 3 20 12 6 21 6 3");
      svg.appendChild(poly);
      break;
    }
    case "pause": {
      const l1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      l1.setAttribute("x", "6");
      l1.setAttribute("y", "4");
      l1.setAttribute("width", "4");
      l1.setAttribute("height", "16");
      const l2 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      l2.setAttribute("x", "14");
      l2.setAttribute("y", "4");
      l2.setAttribute("width", "4");
      l2.setAttribute("height", "16");
      svg.append(l1, l2);
      break;
    }
    case "skip-back": {
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", "19 20 9 12 19 4 19 20");
      const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l.setAttribute("x1", "5");
      l.setAttribute("y1", "19");
      l.setAttribute("x2", "5");
      l.setAttribute("y2", "5");
      svg.append(poly, l);
      break;
    }
    case "skip-forward": {
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", "5 4 15 12 5 20 5 4");
      const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l.setAttribute("x1", "19");
      l.setAttribute("y1", "5");
      l.setAttribute("x2", "19");
      l.setAttribute("y2", "19");
      svg.append(poly, l);
      break;
    }
    case "plus": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M12 5v14M5 12h14");
      svg.appendChild(p);
      break;
    }
    case "trash": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2");
      svg.appendChild(p);
      break;
    }
    case "shield": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z");
      svg.appendChild(p);
      break;
    }
    case "edit": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z");
      svg.appendChild(p);
      break;
    }
    case "chevron-left": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "m15 18-6-6 6-6");
      svg.appendChild(p);
      break;
    }
    case "chevron-right": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "m9 18 6-6-6-6");
      svg.appendChild(p);
      break;
    }
    case "check": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      p.setAttribute("points", "20 6 9 17 4 12");
      svg.appendChild(p);
      break;
    }
    case "alert-circle": {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", "12");
      c.setAttribute("cy", "12");
      c.setAttribute("r", "10");
      const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l.setAttribute("x1", "12");
      l.setAttribute("y1", "8");
      l.setAttribute("x2", "12");
      l.setAttribute("y2", "12");
      const d = document.createElementNS("http://www.w3.org/2000/svg", "line");
      d.setAttribute("x1", "12");
      d.setAttribute("y1", "16");
      d.setAttribute("x2", "12.01");
      d.setAttribute("y2", "16");
      svg.append(c, l, d);
      break;
    }
    case "sliders": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6");
      svg.appendChild(p);
      break;
    }
    case "arrow-right": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M5 12h14M12 5l7 7-7 7");
      svg.appendChild(p);
      break;
    }
    case "clock": {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", "12");
      c.setAttribute("cy", "12");
      c.setAttribute("r", "10");
      const p = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      p.setAttribute("points", "12 6 12 12 16 14");
      svg.append(c, p);
      break;
    }
    case "download": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4");
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      poly.setAttribute("points", "7 10 12 15 17 10");
      const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l.setAttribute("x1", "12");
      l.setAttribute("y1", "15");
      l.setAttribute("x2", "12");
      l.setAttribute("y2", "3");
      svg.append(p, poly, l);
      break;
    }
    case "upload": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4");
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      poly.setAttribute("points", "17 8 12 3 7 8");
      const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l.setAttribute("x1", "12");
      l.setAttribute("y1", "3");
      l.setAttribute("x2", "12");
      l.setAttribute("y2", "15");
      svg.append(p, poly, l);
      break;
    }
    case "x": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M18 6 6 18M6 6l12 12");
      svg.appendChild(p);
      break;
    }
    case "bot": {
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("d", "M12 8V4H8");
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("width", "16");
      rect.setAttribute("height", "12");
      rect.setAttribute("x", "4");
      rect.setAttribute("y", "8");
      rect.setAttribute("rx", "2");
      const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p2.setAttribute("d", "M2 14h2M20 14h2M15 13v2M9 13v2");
      svg.append(p1, rect, p2);
      break;
    }
    case "sparkles": {
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("d", "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z");
      const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p2.setAttribute("d", "M5 3v4M19 17v4M3 5h4M17 19h4");
      svg.append(p1, p2);
      break;
    }
    case "panel-right":
    case "panelRight": {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("width", "18");
      rect.setAttribute("height", "18");
      rect.setAttribute("x", "3");
      rect.setAttribute("y", "3");
      rect.setAttribute("rx", "2");
      const l = document.createElementNS("http://www.w3.org/2000/svg", "path");
      l.setAttribute("d", "M15 3v18");
      svg.append(rect, l);
      break;
    }
    case "minimize-2":
    case "minimize2": {
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      p1.setAttribute("points", "4 14 10 14 10 20");
      const p2 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      p2.setAttribute("points", "20 10 14 10 14 4");
      const l1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l1.setAttribute("x1", "14");
      l1.setAttribute("y1", "10");
      l1.setAttribute("x2", "21");
      l1.setAttribute("y2", "3");
      const l2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l2.setAttribute("x1", "3");
      l2.setAttribute("y1", "21");
      l2.setAttribute("x2", "10");
      l2.setAttribute("y2", "14");
      svg.append(p1, p2, l1, l2);
      break;
    }
    case "maximize-2":
    case "maximize2": {
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      p1.setAttribute("points", "15 3 21 3 21 9");
      const p2 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      p2.setAttribute("points", "9 21 3 21 3 15");
      const l1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l1.setAttribute("x1", "21");
      l1.setAttribute("y1", "3");
      l1.setAttribute("x2", "14");
      l1.setAttribute("y2", "10");
      const l2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l2.setAttribute("x1", "3");
      l2.setAttribute("y1", "21");
      l2.setAttribute("x2", "10");
      l2.setAttribute("y2", "14");
      svg.append(p1, p2, l1, l2);
      break;
    }
    case "chevron-up":
    case "chevronUp": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "m18 15-6-6-6 6");
      svg.appendChild(p);
      break;
    }
    case "chevron-down":
    case "chevronDown": {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "m6 9 6 6 6-6");
      svg.appendChild(p);
      break;
    }
    case "send": {
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("d", "m22 2-7 20-4-9-9-4Z");
      const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p2.setAttribute("d", "M22 2 11 13");
      svg.append(p1, p2);
      break;
    }
    case "history": {
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("d", "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8");
      const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p2.setAttribute("d", "M3 3v5h5");
      const p3 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p3.setAttribute("d", "M12 7v5l4 2");
      svg.append(p1, p2, p3);
      break;
    }
    case "undo-2":
    case "undo2": {
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("d", "M9 14 4 9l5-5");
      const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p2.setAttribute("d", "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11");
      svg.append(p1, p2);
      break;
    }
    default: {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", "12");
      c.setAttribute("cy", "12");
      c.setAttribute("r", "10");
      svg.appendChild(c);
      break;
    }
  }

  return svg;
}
