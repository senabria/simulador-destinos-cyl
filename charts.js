/* GRÁFICAS EN CANVAS — sin dependencias externas (funciona offline).
   Expone: prepCanvas, drawBars, drawCurve, drawCompareCurves, drawTornado.
   Los colores de texto/ejes/rejilla se leen de las variables CSS del tema
   (--chart-ink, --chart-mut, --chart-grid, --chart-axis, --chart-marker,
   --series-a, --series-b), de modo que las gráficas contrastan tanto en
   modo claro como en oscuro. */
(function () {
    'use strict';

    function prepCanvas(cv) {
        var dpr = window.devicePixelRatio || 1;
        var w = cv.clientWidth || (cv.parentElement && cv.parentElement.clientWidth) || 600;
        var h = cv.clientHeight || 240;
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        var g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        return { g: g, w: w, h: h };
    }

    function pctTxt(v) {
        return (v >= 9.95 ? Math.round(v).toString() : v.toFixed(1).replace('.', ',')) + '%';
    }

    /* Colores del tema actual (con valores de respaldo claros) */
    function themeCol() {
        var cs = (typeof getComputedStyle === 'function') ? getComputedStyle(document.body) : null;
        function v(name, fb) {
            var x = cs ? cs.getPropertyValue(name) : '';
            return x ? x.trim() : fb;
        }
        return {
            ink: v('--chart-ink', '#0f172a'),
            mut: v('--chart-mut', '#475569'),
            grid: v('--chart-grid', '#e2e8f0'),
            axis: v('--chart-axis', '#64748b'),
            marker: v('--chart-marker', '#92400e'),
            serA: v('--series-a', '#0e7490'),
            serB: v('--series-b', '#d97706')
        };
    }

    /* Diagrama de barras verticales. values en % (0-100) */
    function drawBars(cv, labels, values, colors) {
        var c = prepCanvas(cv), g = c.g, w = c.w, h = c.h;
        var T = themeCol();
        var padL = 10, padB = 34, padT = 26, padR = 10;
        var max = 0, i;
        for (i = 0; i < values.length; i++) if (values[i] > max) max = values[i];
        if (max <= 0) max = 1;
        var bw = (w - padL - padR) / values.length;
        g.font = '12px system-ui, "Segoe UI", sans-serif';
        g.textAlign = 'center';
        for (i = 0; i < values.length; i++) {
            var bh = (h - padT - padB) * values[i] / max;
            var x = padL + i * bw + bw * 0.14, ww = bw * 0.72;
            g.fillStyle = colors[i % colors.length];
            g.fillRect(x, h - padB - bh, ww, Math.max(bh, values[i] > 0 ? 2 : 0));
            g.fillStyle = T.mut;
            g.fillText(labels[i], x + ww / 2, h - padB + 16);
            if (values[i] > 0) {
                g.fillStyle = T.ink;
                g.fillText(pctTxt(values[i]), x + ww / 2, h - padB - bh - 7);
            }
        }
    }

    /* Curva P(plaza disponible) por posición. ys en [0,1], marker = índice 0-based */
    function drawCurve(cv, ys, marker, markerLabel) {
        var c = prepCanvas(cv), g = c.g, w = c.w, h = c.h;
        var T = themeCol();
        var padL = 46, padR = 14, padT = 16, padB = 30;
        var iw = w - padL - padR, ih = h - padT - padB;
        var s, y;
        g.font = '11px system-ui, "Segoe UI", sans-serif';
        var steps = [0, 0.25, 0.5, 0.75, 1];
        for (s = 0; s < steps.length; s++) {
            y = padT + ih * (1 - steps[s]);
            g.strokeStyle = T.grid;
            g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR, y); g.stroke();
            g.fillStyle = T.axis; g.textAlign = 'right';
            g.fillText(Math.round(steps[s] * 100) + '%', padL - 6, y + 4);
        }
        g.fillStyle = T.mut; g.textAlign = 'center';
        g.fillText('1', padL, h - 9);
        g.fillText(String(ys.length), w - padR, h - 9);
        g.fillText('posición en el orden de mérito', padL + iw / 2, h - 9);
        g.strokeStyle = T.serA; g.lineWidth = 2;
        g.beginPath();
        for (var i = 0; i < ys.length; i++) {
            var x = padL + iw * i / (ys.length - 1), yy = padT + ih * (1 - ys[i]);
            if (i === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
        }
        g.stroke(); g.lineWidth = 1;
        var mk = Math.min(Math.max(0, marker), ys.length - 1);
        var mx = padL + iw * mk / (ys.length - 1), my = padT + ih * (1 - ys[mk]);
        g.strokeStyle = T.serB;
        g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(mx, padT); g.lineTo(mx, h - padB); g.stroke();
        g.setLineDash([]);
        g.fillStyle = T.serB;
        g.beginPath(); g.arc(mx, my, 4, 0, Math.PI * 2); g.fill();
        g.fillStyle = T.marker; g.textAlign = 'left';
        var lbl = (markerLabel || 'Tu turno') + ': ' + Math.round(ys[mk] * 1000) / 10 + '%';
        g.fillText(lbl, Math.min(mx + 6, w - 130), padT + 10);
    }

    /* Curvas comparativas de dos escenarios (ysA vs ysB) */
    function drawCompareCurves(cv, ysA, ysB, labelA, labelB, marker) {
        var c = prepCanvas(cv), g = c.g, w = c.w, h = c.h;
        var T = themeCol();
        var padL = 46, padR = 14, padB = 30;
        var s, y, i;
        g.font = '11px system-ui, "Segoe UI", sans-serif';

        /* Leyenda superior: la segunda entrada se coloca midiendo el ancho real
           del primer texto (antes iba a offset fijo +160 y los nombres largos
           tipo «Turno 300 (Salamanca) - calibrado2025» se montaban).
           Si ambas no caben en una línea, la segunda pasa a una segunda fila
           y la gráfica gana margen superior. */
        var la = labelA || 'Escenario A', lb = labelB || 'Escenario B';
        var wA = g.measureText(la).width, wB = g.measureText(lb).width;
        var hasB = !!(ysB && ysB.length);
        var oneLine = !hasB || (padL + 18 + wA + 26 + 18 + wB <= w - padR);
        var padT = oneLine ? 32 : 50;
        var iw = w - padL - padR, ih = h - padT - padB;

        g.textAlign = 'left';
        g.fillStyle = T.serA;
        g.fillRect(padL, 10, 14, 4);
        g.fillText(la, padL + 18, 15);

        if (hasB) {
            g.fillStyle = T.serB;
            if (oneLine) {
                var xB = padL + 18 + wA + 26;
                g.fillRect(xB, 10, 14, 4);
                g.fillText(lb, xB + 18, 15);
            } else {
                g.fillRect(padL, 28, 14, 4);
                g.fillText(lb, padL + 18, 33);
            }
        }

        var steps = [0, 0.25, 0.5, 0.75, 1];
        for (s = 0; s < steps.length; s++) {
            y = padT + ih * (1 - steps[s]);
            g.strokeStyle = T.grid;
            g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR, y); g.stroke();
            g.fillStyle = T.axis; g.textAlign = 'right';
            g.fillText(Math.round(steps[s] * 100) + '%', padL - 6, y + 4);
        }
        g.fillStyle = T.mut; g.textAlign = 'center';
        g.fillText('1', padL, h - 9);
        g.fillText(String(ysA.length), w - padR, h - 9);
        g.fillText('posición en el orden de mérito', padL + iw / 2, h - 9);

        // Curva A
        g.strokeStyle = T.serA; g.lineWidth = 2.2;
        g.beginPath();
        for (i = 0; i < ysA.length; i++) {
            var xA = padL + iw * i / (ysA.length - 1), yyA = padT + ih * (1 - ysA[i]);
            if (i === 0) g.moveTo(xA, yyA); else g.lineTo(xA, yyA);
        }
        g.stroke();

        // Curva B
        if (ysB && ysB.length) {
            g.strokeStyle = T.serB; g.lineWidth = 2.2;
            g.beginPath();
            for (i = 0; i < ysB.length; i++) {
                var xB = padL + iw * i / (ysB.length - 1), yyB = padT + ih * (1 - ysB[i]);
                if (i === 0) g.moveTo(xB, yyB); else g.lineTo(xB, yyB);
            }
            g.stroke();
        }
        g.lineWidth = 1;

        // Marcador del turno
        if (marker != null) {
            var mk = Math.min(Math.max(0, marker), ysA.length - 1);
            var mx = padL + iw * mk / (ysA.length - 1);
            g.strokeStyle = T.axis;
            g.setLineDash([3, 3]);
            g.beginPath(); g.moveTo(mx, padT); g.lineTo(mx, h - padB); g.stroke();
            g.setLineDash([]);
        }
    }

    /* Tornado: rows = [{label, lo, hi}] en fracción [0,1]; baseline en fracción.
       - Valores no finitos (p. ej. filas sin datos) se sustituyen por la línea
         base para que un NaN no anule todo el gráfico (fillRect con NaN no pinta).
       - Filas ordenadas por impacto (|hi-lo|) de mayor a menor, como un tornado.
       - Si todos los valores coinciden con la línea base, se muestra un aviso
         en lugar de un gráfico vacío. */
    function drawTornado(cv, rows, baseline) {
        var T = themeCol();
        if (!rows || !rows.length || !isFinite(baseline)) return;
        var rs = rows.map(function (r) {
            var lo = isFinite(r.lo) ? r.lo : baseline;
            var hi = isFinite(r.hi) ? r.hi : baseline;
            return { label: r.label, lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
        }).sort(function (a, b) { return Math.abs(b.hi - b.lo) - Math.abs(a.hi - a.lo); });

        var rowH = 27, padL = 185, padR = 18, top = 10;
        var all = [baseline], i;
        for (i = 0; i < rs.length; i++) all.push(rs[i].lo, rs[i].hi);
        var mn = Math.min.apply(null, all), mx = Math.max.apply(null, all);
        var constante = (mx - mn) < 1e-9;
        var pad = constante ? 0.05 : (mx - mn) * 0.1 + 0.01;
        mn = Math.max(0, mn - pad); mx = Math.min(1, mx + pad);
        var height = top + rs.length * rowH + 30;
        cv.style.height = height + 'px';
        var c = prepCanvas(cv), g = c.g, w = c.w, h = c.h;
        var iw = w - padL - padR;
        function X(v) { return padL + iw * (v - mn) / (mx - mn); }
        function P(v) { return Math.round(v * 1000) / 10 + '%'; }

        if (constante) {
            g.font = '13px system-ui, "Segoe UI", sans-serif';
            g.fillStyle = T.mut; g.textAlign = 'center';
            g.fillText('Resultado constante: ' + P(baseline) + ' con todos los factores individuales', w / 2, h / 2 - 8);
            g.fillText('(ningún factor por separado cambia la probabilidad; prueba a variar tu perfil)', w / 2, h / 2 + 12);
            return;
        }

        var y = top;
        g.font = '11px system-ui, "Segoe UI", sans-serif';
        for (i = 0; i < rs.length; i++) {
            var r = rs[i];
            g.fillStyle = T.mut; g.textAlign = 'right';
            g.fillText(r.label, padL - 8, y + rowH / 2 + 4);
            var x0 = X(baseline), xlo = X(r.lo), xhi = X(r.hi);
            g.fillStyle = '#dc2626';
            g.fillRect(Math.min(x0, xlo), y + 7, Math.max(1, Math.abs(x0 - xlo)), rowH - 14);
            g.fillStyle = '#16a34a';
            g.fillRect(Math.min(x0, xhi), y + 7, Math.max(1, Math.abs(x0 - xhi)), rowH - 14);
            g.fillStyle = T.ink; g.textAlign = 'center';
            g.fillText(P(r.lo), xlo, y + 5);
            g.fillText(P(r.hi), xhi, y + 5);
            y += rowH;
        }
        g.strokeStyle = T.ink;
        g.beginPath(); g.moveTo(X(baseline), top); g.lineTo(X(baseline), y); g.stroke();
        g.fillStyle = T.mut; g.textAlign = 'left';
        g.fillText('Línea base: ' + P(baseline), Math.min(X(baseline) + 5, w - 110), y + 16);
    }

    window.CHARTS = { prepCanvas: prepCanvas, drawBars: drawBars, drawCurve: drawCurve, drawCompareCurves: drawCompareCurves, drawTornado: drawTornado, themeCol: themeCol };
})();
