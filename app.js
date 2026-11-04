/* LÓGICA DE LA INTERFAZ — simulador de destinos CYL */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var DATA = window.DATA;

    /* ---------------- utilidades ---------------- */
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return '&#' + c.charCodeAt(0) + ';';
        });
    }
    function fmtPct(x, dec) { return (x * 100).toFixed(dec === undefined ? 1 : dec).replace('.', ',') + ' %'; }
    function fmtNum(x) { try { return x.toLocaleString('es-ES'); } catch (e) { return String(x); } }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    /* La relación definitiva de puestos viene en CP850 (DOS); leída como windows-1252,
       sus acentos aparecen como ¡ ¢ £ ¤ ¥ µ ‚ \xa0 — se transliteran antes de normalizar. */
    var CP850_FIX = { '\xa0': 'a', '¡': 'i', '¢': 'o', '£': 'u', '¤': 'n', '¥': 'N', 'µ': 'A', '‚': 'e', '\ufffd': '' };
    function normJs(s) {
        return String(s == null ? '' : s)
            .replace(/[\xa0¡¢£¤¥µ‚\ufffd]/g, function (c) { return CP850_FIX[c]; })
            .trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    function nextTick(fn) { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn); else setTimeout(fn, 0); }
    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    /* ---------------- estado ---------------- */
    var infWeights = [];
    var lastResult = null;
    var scenarioA = null;
    var scenarioB = null;

    /* Últimos datos dibujados en cada gráfica, para repintarlas al cambiar de tema */
    var lastCharts = { barsE: null, barsMun: null, curve: null, compare: null, tornado: null };

    function repaintCharts() {
        if (lastCharts.barsE) CHARTS.drawBars.apply(null, [$('chartE')].concat(lastCharts.barsE));
        if (lastCharts.barsMun) CHARTS.drawBars.apply(null, [$('chartMun')].concat(lastCharts.barsMun));
        if (lastCharts.curve) CHARTS.drawCurve.apply(null, [$('chartCurve')].concat(lastCharts.curve));
        if (lastCharts.compare) CHARTS.drawCompareCurves.apply(null, [$('chartCurveCompare')].concat(lastCharts.compare));
        if (lastCharts.tornado) CHARTS.drawTornado.apply(null, [$('chartTornado')].concat(lastCharts.tornado));
    }

    function infWeightsFromData() {
        var w = [], i, total = DATA.aprobados.length || 1;
        for (i = 0; i < DATA.provs.length; i++) w.push(0);
        for (i = 0; i < DATA.aprobados.length; i++) w[DATA.aprobados[i][1]]++;
        for (i = 0; i < w.length; i++) w[i] = w[i] / total;
        return w;
    }

    function poolCounts() {
        var per = [], i;
        for (i = 0; i < DATA.provs.length; i++) per.push({ 2: 0, 3: 0, 4: 0, 6: 0, sscc: 0, terr: 0, total: 0 });
        for (i = 0; i < DATA.puestos.length; i++) {
            var q = DATA.puestos[i];
            per[q[0]][q[1]]++;
            if (q.length > 8 && q[8]) per[q[0]].sscc++; else per[q[0]].terr++;
            per[q[0]].total++;
        }
        return per;
    }

    /* ---------------- parámetros ---------------- */
    function buildParams() {
        return {
            wBase: [+$('w-0').value, +$('w-1').value, +$('w-2').value, +$('w-3').value, +$('w-4').value],
            utilSal: [+$('u-e2').value, +$('u-e3').value, +$('u-e4').value, +$('u-e6').value],
            utilMun: [+$('u-cap').value, +$('u-com').value],
            utilHor: +$('u-hor').value,
            utilFun: [+$('u-int').value, +$('u-ate').value, +$('u-res').value],
            utilSSCC: +($('u-sscc') ? $('u-sscc').value : 0.5),
            fidelidad: +$('inFid').value,
            pesosInfidelidad: infWeights,
            usarProximidad: $('chkProx') ? $('chkProx').checked : true,
            renuncias: +$('inRen').value,
            conc: +$('inConc').value,
            temp: +$('inTemp').value,
            turnoM: $('selTurnoM').value,
            userPos: clamp(parseInt($('inPos').value, 10) || 1, 1, DATA.aprobados.length),
            userProv: +$('selProv').value,
            userProv2: $('selProv2') ? parseInt($('selProv2').value, 10) : -1,
            aceptaOtras: $('chkOtras').checked,
            seed: (parseInt($('inSeed').value, 10) || 42) >>> 0,
            earlyStop: false
        };
    }

    /* ---------------- bucle de simulación por trozos ---------------- */
    function runSims(p, n, acc, ctx, onDone, onProg) {
        var rng = NUCLEO.mulberry32(p.seed);
        var done = 0;
        (function chunk() {
            var t0 = now();
            while (done < n && now() - t0 < 40) { NUCLEO.simulateOnce(ctx, p, rng, acc); done++; }
            if (onProg) onProg(done, n);
            if (done < n) nextTick(chunk); else if (onDone) onDone();
        })();
    }

    /* ---------------- ejecución principal ---------------- */
    var running = false;

    function setBusy(on, label) {
        running = on;
        $('btnRun').disabled = on;
        $('btnTornado').disabled = on;
        $('progWrap').style.display = on ? 'block' : 'none';
        if (on) { $('progBar').style.width = '0%'; $('progText').textContent = (label || 'Simulando…'); }
    }
    function prog(d, t) {
        $('progBar').style.width = (100 * d / Math.max(1, t)).toFixed(1) + '%';
        $('progText').textContent = fmtNum(d) + ' / ' + fmtNum(t) + ' simulaciones';
    }

    function ejecutar() {
        if (running) return;
        var n = clamp(parseInt($('inSims').value, 10) || 3000, 100, 50000);
        var p = buildParams();
        var ctx = NUCLEO.buildCtx(DATA, p);
        var acc = NUCLEO.newAcc(ctx);
        guardarConfig();
        $('results').classList.remove('oculto');
        setBusy(true, 'Simulando…');
        runSims(p, n, acc, ctx, function () {
            setBusy(false);
            render(acc, n, ctx, p);
        }, prog);
    }

    function render(acc, n, ctx, p) {
        var got = acc.got;
        var P = got / n, ci = NUCLEO.ciWilson(got, n);
        /* P(plaza en la 1ª provincia) es la métrica principal; P(cualquier
           provincia) incluye el fallback de aceptaOtras (2ª provincia / cercanía). */
        var gotProv = acc.gotProv || 0;
        var Pprov = gotProv / n, ciProv = NUCLEO.ciWilson(gotProv, n);
        $('kpiP').textContent = fmtPct(Pprov);
        $('kpiCI').textContent = fmtPct(ciProv[0]) + ' – ' + fmtPct(ciProv[1]);
        $('kpiRem').textContent = (acc.remAtUser / n).toFixed(1).replace('.', ',');
        var arr = acc.exhArr.map(function (v) { return v < 0 ? ctx.nCand : v + 1; })
            .sort(function (a, b) { return a - b; });
        var med = arr.length ? arr[Math.floor(arr.length / 2)] : 0;
        var p95 = arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))] : 0;
        $('kpiExh').textContent = 'mediana turno ' + med;
        var e3 = acc.eCount[1] + acc.eCount[2] + acc.eCount[3];
        $('kpiE3').textContent = got > 0 ? fmtPct(e3 / got) : '—';

        var ssccGot = acc.ssccCount[0];
        var ssccRatio = got > 0 ? (ssccGot / got) : 0;
        if ($('kpiSSCC')) {
            $('kpiSSCC').textContent = got > 0 ? (fmtPct(ssccRatio, 0) + ' SSCC / ' + fmtPct(1 - ssccRatio, 0) + ' Terr.') : '—';
        }

        lastCharts.barsE = [['E06', 'E04', 'E03', 'E02', 'Sin plaza'],
        [acc.eCount[3] / n * 100, acc.eCount[2] / n * 100, acc.eCount[1] / n * 100, acc.eCount[0] / n * 100, acc.eCount[4] / n * 100],
        ['#16a34a', '#65a30d', '#ca8a04', '#d97706', '#94a3b8']];
        lastCharts.barsMun = [['Capital', 'Comarca', 'Sin plaza'],
        [acc.munCount[0] / n * 100, acc.munCount[1] / n * 100, acc.munCount[2] / n * 100],
        ['#0891b2', '#06b6d4', '#94a3b8']];

        var ys = [], i;
        for (i = 0; i < ctx.nCand; i++) ys.push(acc.availAtPos[i] / n);
        var mk = clamp(p.userPos, 1, ctx.nCand) - 1;
        lastCharts.curve = [ys, mk, 'Tu turno'];
        repaintCharts();
        $('curveAtUser').textContent = 'P(que quede alguna plaza de ' + DATA.provsDisplay[p.userProv] +
            ' disponible al llegar a tu turno): ' + fmtPct(ys[mk]);

        /* Fila de ejemplo: nivel, tipo de trabajo, municipio y destino */
        var TRAB_LBL = ['Oficina interna', 'Atención al público', 'Residencia'];
        var f1 = function (x) { return (x / n).toFixed(1).replace('.', ','); };
        var filaEjemplo = function (q) {
            var tr = document.createElement('tr');
            var eLbl = q[1] === 6 ? 'E06' : q[1] === 4 ? 'E04' : q[1] === 3 ? 'E03' : 'E02';
            var provLbl = DATA.provsDisplay[q[0]];
            var ssccTag = (q.length > 8 && q[8]) ? ' <span style="color:var(--acc);font-size:0.75rem;">[SSCC]</span>' : '';
            tr.innerHTML = '<td><b>' + eLbl + '</b> (' + provLbl + ')</td><td>' + esc(TRAB_LBL[q[2]] || '—') + ssccTag + '</td><td>' +
                esc(DATA.muns[q[4]]) + (DATA.munCap[q[4]] ? ' (capital)' : ' (comarca)') + '</td><td>' +
                esc(DATA.descrs[q[5]]) + '</td>';
            return tr;
        };

        /* Lo que quedaba en tu provincia al llegar tu turno (media por nivel E) */
        var remEEl = $('remEInfo');
        if (remEEl) {
            remEEl.textContent = 'Al llegar tu turno quedaban en ' + DATA.provsDisplay[p.userProv] +
                ' (media): E06 ' + f1(acc.remE[3]) + ' · E04 ' + f1(acc.remE[2]) +
                ' · E03 ' + f1(acc.remE[1]) + ' · E02 ' + f1(acc.remE[0]) +
                ' plazas. Las más interesantes (E06/E04/E03) se van retirando justo antes.';
        }

        /* Disponibilidad estimada por provincia (media de plazas libres), ordenada por cercanía */
        var rp = $('remProvBody');
        if (rp) {
            var dist = DATA.distMatrix ? DATA.distMatrix[p.userProv] : null;
            var order = [], op;
            for (op = 0; op < DATA.provs.length; op++) order.push(op);
            if (dist) order.sort(function (a, b) { return dist[a] - dist[b]; });
            var t = '<table class="out"><thead><tr><th>Provincia</th><th>E06</th><th>E04</th><th>E03</th><th>E02</th><th>Libres</th><th>km</th></tr></thead><tbody>';
            for (var oi = 0; oi < order.length; oi++) {
                var pi2 = order[oi];
                var isMine = (pi2 === p.userProv);
                var tot = (acc.remProvE[pi2 * 4] + acc.remProvE[pi2 * 4 + 1] +
                    acc.remProvE[pi2 * 4 + 2] + acc.remProvE[pi2 * 4 + 3]) / n;
                t += '<tr><td><b>' + DATA.provsDisplay[pi2] + '</b>' + (isMine ? ' (tu 1ª)' : '') + '</td><td>' +
                    f1(acc.remProvE[pi2 * 4 + 3]) + '</td><td>' + f1(acc.remProvE[pi2 * 4 + 2]) +
                    '</td><td>' + f1(acc.remProvE[pi2 * 4 + 1]) + '</td><td>' + f1(acc.remProvE[pi2 * 4]) +
                    '</td><td><b>' + (tot < 0.05 ? '0 · agotada' : f1(tot)) + '</b></td><td>' +
                    (dist ? dist[pi2] : '—') + '</td></tr>';
            }
            t += '</tbody></table>';
            rp.innerHTML = t;
        }

        /* Plazas libres al llegar tu turno fuera de tu provincia (ejemplos, próximas primero) */
        var tbF = $('freeBody');
        if (tbF) {
            tbF.innerHTML = '';
            var free = acc.samplesFree.slice();
            if (DATA.distMatrix) free.sort(function (a, b) {
                return DATA.distMatrix[p.userProv][DATA.puestos[a][0]] - DATA.distMatrix[p.userProv][DATA.puestos[b][0]];
            });
            for (var sf = 0; sf < free.length && sf < 12; sf++) {
                tbF.appendChild(filaEjemplo(DATA.puestos[free[sf]]));
            }
        }

        /* Tus plazas obtenidas (ejemplos) */
        var tb = $('outcomesBody');
        tb.innerHTML = '';
        for (var s = 0; s < acc.samples.length && s < 12; s++) {
            tb.appendChild(filaEjemplo(DATA.puestos[acc.samples[s]]));
        }
        $('resSummary').textContent = 'Resultado sobre ' + fmtNum(n) + ' simulaciones · semilla ' + p.seed + '.';

        // Guardar para comparador / exportador
        lastResult = {
            n: n, p: p, P: P, ci: ci, Pprov: Pprov, ciProv: ciProv,
            rem: acc.remAtUser / n, med: med, p95: p95,
            e3Ratio: got > 0 ? (e3 / got) : 0, ssccRatio: ssccRatio, ys: ys,
            eCounts: acc.eCount.slice(), munCounts: acc.munCount.slice()
        };
    }

    /* ---------------- comparador de escenarios ---------------- */
    function saveScenario(slot) {
        if (!lastResult) { alert('Ejecuta primero una simulación para guardarla.'); return; }
        var sc = {
            slot: slot,
            name: 'Turno ' + lastResult.p.userPos + ' (' + DATA.provsDisplay[lastResult.p.userProv] + ')',
            time: (new Date()).toLocaleTimeString(),
            res: lastResult
        };
        if (slot === 'A') scenarioA = sc; else scenarioB = sc;
        renderCompare();
    }

    function clearCompare() {
        scenarioA = null; scenarioB = null;
        renderCompare();
    }

    function renderCompare() {
        var wrap = $('compareTableWrap');
        var cBox = $('compareChartBox');
        if (!scenarioA && !scenarioB) {
            wrap.innerHTML = '<p class="hint">No hay escenarios guardados para comparar.</p>';
            cBox.style.display = 'none';
            lastCharts.compare = null;
            return;
        }

        var t = '<table class="compare-table"><thead><tr><th>Métrica</th>';
        t += '<th>' + (scenarioA ? ('Escenario A<br><small>' + esc(scenarioA.name) + '</small>') : 'Escenario A (vacío)') + '</th>';
        t += '<th>' + (scenarioB ? ('Escenario B<br><small>' + esc(scenarioB.name) + '</small>') : 'Escenario B (vacío)') + '</th>';
        t += '</tr></thead><tbody>';

        function row(label, valA, valB) {
            return '<tr><td>' + label + '</td><td>' + (valA != null ? valA : '—') + '</td><td>' + (valB != null ? valB : '—') + '</td></tr>';
        }

        var rA = scenarioA ? scenarioA.res : null;
        var rB = scenarioB ? scenarioB.res : null;

        t += row('P(plaza en tu 1ª provincia)', rA ? ('<b>' + fmtPct(rA.Pprov != null ? rA.Pprov : rA.P) + '</b>') : null, rB ? ('<b>' + fmtPct(rB.Pprov != null ? rB.Pprov : rB.P) + '</b>') : null);
        t += row('Intervalo Confianza 95% (1ª provincia)', rA ? (fmtPct(rA.ciProv ? rA.ciProv[0] : rA.ci[0]) + ' – ' + fmtPct(rA.ciProv ? rA.ciProv[1] : rA.ci[1])) : null, rB ? (fmtPct(rB.ciProv ? rB.ciProv[0] : rB.ci[0]) + ' – ' + fmtPct(rB.ciProv ? rB.ciProv[1] : rB.ci[1])) : null);
        t += row('Plazas restantes medias', rA ? rA.rem.toFixed(1) : null, rB ? rB.rem.toFixed(1) : null);
        t += row('Agotamiento (mediana / peor 5%)', rA ? ('Turno ' + rA.med + ' / ' + rA.p95) : null, rB ? ('Turno ' + rB.med + ' / ' + rB.p95) : null);
        t += row('P(E ≥ 03 | plaza)', rA ? fmtPct(rA.e3Ratio) : null, rB ? fmtPct(rB.e3Ratio) : null);
        t += row('P(SSCC | plaza)', rA ? fmtPct(rA.ssccRatio) : null, rB ? fmtPct(rB.ssccRatio) : null);
        t += row('Fidelidad / Renuncias', rA ? (Math.round(rA.p.fidelidad * 100) + '% / ' + Math.round(rA.p.renuncias * 100) + '%') : null,
            rB ? (Math.round(rB.p.fidelidad * 100) + '% / ' + Math.round(rB.p.renuncias * 100) + '%') : null);

        t += '</tbody></table>';
        wrap.innerHTML = t;

        if (rA && rB) {
            cBox.style.display = 'block';
            lastCharts.compare = [rA.ys, rB.ys, scenarioA.name, scenarioB.name, rA.p.userPos - 1];
        } else if (rA) {
            cBox.style.display = 'block';
            lastCharts.compare = [rA.ys, null, scenarioA.name, null, rA.p.userPos - 1];
        } else if (rB) {
            cBox.style.display = 'block';
            lastCharts.compare = [rB.ys, null, scenarioB.name, null, rB.p.userPos - 1];
        } else {
            cBox.style.display = 'none';
        }
        if (lastCharts.compare) repaintCharts();
    }

    /* ---------------- exportación ---------------- */
    function exportCSV() {
        if (!lastResult) { alert('Ejecuta primero una simulación.'); return; }
        var r = lastResult, p = r.p;
        var lines = [];
        lines.push('SIMULADOR DESTINOS CYL 2026 - RESULTADOS');
        lines.push('Fecha;' + (new Date()).toLocaleString());
        lines.push('Posicion;' + p.userPos);
        lines.push('1a Provincia preferida;' + DATA.provsDisplay[p.userProv]);
        lines.push('2a Provincia preferida;' + (p.userProv2 >= 0 ? DATA.provsDisplay[p.userProv2] : 'Por cercanía'));
        lines.push('Simulaciones;' + r.n);
        lines.push('Fidelidad;' + p.fidelidad);
        lines.push('Renuncias;' + p.renuncias);
        lines.push('Probabilidad plaza en 1a provincia;' + ((r.Pprov != null ? r.Pprov : r.P) * 100).toFixed(2) + '%');
        lines.push('IC 95 min;' + ((r.ciProv ? r.ciProv[0] : r.ci[0]) * 100).toFixed(2) + '%');
        lines.push('IC 95 max;' + ((r.ciProv ? r.ciProv[1] : r.ci[1]) * 100).toFixed(2) + '%');
        lines.push('Plazas restantes media;' + r.rem.toFixed(2));
        lines.push('Turno agotamiento mediana;' + r.med);
        lines.push('Turno agotamiento peor 5%;' + r.p95);
        lines.push('P(E>=03);' + (r.e3Ratio * 100).toFixed(2) + '%');
        lines.push('P(SSCC);' + (r.ssccRatio * 100).toFixed(2) + '%');
        lines.push('');
        lines.push('CURVA DE DISPONIBILIDAD POR POSICION');
        lines.push('Posicion;Probabilidad disponible');
        for (var i = 0; i < r.ys.length; i++) {
            lines.push((i + 1) + ';' + (r.ys[i] * 100).toFixed(2) + '%');
        }

        var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'simulacion_destinos_cyl2026_pos' + p.userPos + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* ---------------- sensibilidad (tornado) ---------------- */
    function tornadoDefs() {
        function W(p, i, f) { p.wBase[i] = Math.max(0, p.wBase[i] * f); }
        return [
            { label: 'Fidelidad ±20 %', apply: function (p, s) { p.fidelidad = clamp(p.fidelidad * (1 + 0.2 * s), 0, 1); } },
            { label: 'Renuncias ±7 puntos', apply: function (p, s) { p.renuncias = clamp(p.renuncias + 0.07 * s, 0, 0.5); } },
            { label: 'Peso salario ±50 %', apply: function (p, s) { W(p, 1, 1 + 0.5 * s); } },
            { label: 'Peso municipio ±50 %', apply: function (p, s) { W(p, 2, 1 + 0.5 * s); } },
            { label: 'Peso horario ±50 %', apply: function (p, s) { W(p, 3, 1 + 0.5 * s); } },
            { label: 'Peso funciones ±50 %', apply: function (p, s) { W(p, 4, 1 + 0.5 * s); } },
            { label: 'Homogeneidad ×0,5 / ×2', apply: function (p, s) { p.conc = clamp(s > 0 ? p.conc * 2 : p.conc / 2, 1, 500); } },
            { label: 'Turno M solo E02 / excluidos', apply: function (p, s) { p.turnoM = s > 0 ? 'soloE02' : 'excluidos'; } }
        ];
    }

    function tornado() {
        if (running) return;
        var nT = clamp(parseInt($('inT').value, 10) || 400, 50, 5000);
        var defs = tornadoDefs();
        var jobs = [{ label: '__base__', sign: 0, apply: function () { } }];
        defs.forEach(function (d) {
            jobs.push({ label: d.label, sign: -1, apply: d.apply });
            jobs.push({ label: d.label, sign: 1, apply: d.apply });
        });
        var vals = {}, order = [], ji = 0;
        setBusy(true, 'Anál de sensibilidad…');
        $('tornadoWrap').classList.remove('oculto');

        (function nextJob() {
            if (ji >= jobs.length) {
                var baseline = vals['__base__|0'];
                var rows = order.map(function (lb) {
                    return { label: lb, lo: vals[lb + '|-1'], hi: vals[lb + '|1'] };
                });
                lastCharts.tornado = [rows, baseline];
                repaintCharts();
                $('tornadoNote').textContent = 'Métrica: P(plaza en tu 1ª provincia). Cada factor se mueve uno a la vez con ' + fmtNum(nT) +
                    ' simulaciones (misma semilla). Barras verdes: valor alto del factor; rojas: valor bajo.';
                setBusy(false);
                return;
            }
            var job = jobs[ji];
            var p = buildParams();
            p.earlyStop = true;
            job.apply(p, job.sign);
            var ctx = NUCLEO.buildCtx(DATA, p);
            var acc = NUCLEO.newAcc(ctx);
            runSims(p, nT, acc, ctx, function () {
                /* Métrica: P(plaza en la 1ª provincia). El trabajo '__base__'
                   no es un factor: no debe entrar en la lista de filas. */
                vals[job.label + '|' + job.sign] = (acc.gotProv || 0) / nT;
                if (job.label !== '__base__' && order.indexOf(job.label) < 0) order.push(job.label);
                ji++;
                $('progText').textContent = 'Sensibilidad ' + ji + ' / ' + jobs.length;
                $('progBar').style.width = (100 * ji / jobs.length).toFixed(1) + '%';
                nextJob();
            }, null);
        })();
    }

    /* ---------------- refresco de paneles ---------------- */
    function refreshCatalog() {
        var per = poolCounts();
        var t = '<table class="cat"><tr><th>Provincia</th><th>E06</th><th>E04</th><th>E03</th><th>E02</th><th>SSCC</th><th>Total</th></tr>';
        var tot = { 2: 0, 3: 0, 4: 0, 6: 0, sscc: 0, t: 0 }, i;
        for (i = 0; i < DATA.provs.length; i++) {
            var hl = (i === +$('selProv').value) ? ' class="hl"' : '';
            var ssccTxt = (i === 0) ? (per[i].sscc + ' (' + Math.round(per[i].sscc / per[i].total * 100) + '%)') : '—';
            t += '<tr' + hl + '><td>' + DATA.provsDisplay[i] + '</td><td>' + per[i][6] + '</td><td>' + per[i][4] +
                '</td><td>' + per[i][3] + '</td><td>' + per[i][2] + '</td><td>' + ssccTxt + '</td><td><b>' + per[i].total + '</b></td></tr>';
            tot[2] += per[i][2]; tot[3] += per[i][3]; tot[4] += per[i][4]; tot[6] += per[i][6]; tot.sscc += per[i].sscc; tot.t += per[i].total;
        }
        t += '<tr class="totrow"><td>Total</td><td>' + tot[6] + '</td><td>' + tot[4] + '</td><td>' + tot[3] +
            '</td><td>' + tot[2] + '</td><td>' + tot.sscc + '</td><td>' + tot.t + '</td></tr></table>';
        $('catalogDiv').innerHTML = t;
    }

    function refreshCtxInfo() {
        var pos = clamp(parseInt($('inPos').value, 10) || 1, 1, DATA.aprobados.length);
        var prov = +$('selProv').value;
        var prov2 = $('selProv2') ? parseInt($('selProv2').value, 10) : -1;
        var aheadSame = 0, aheadM = 0;
        for (var i = 0; i < pos - 1; i++) {
            if (DATA.aprobados[i][1] === prov) {
                aheadSame++;
                if (DATA.aprobados[i][2]) aheadM++;
            }
        }
        var mTxt = aheadM ? ' (' + aheadM + ' de Turno M)' : '';
        var prov2Txt = (prov2 >= 0 && prov2 !== prov) ? (' · 2ª opción: <b>' + DATA.provsDisplay[prov2] + '</b>') : ' · 2ª opción: <i>Por cercanía geográfica</i>';
        $('ctxInfo').innerHTML = 'Posición <b>' + pos + '</b> con 1ª preferencia por <b>' +
            DATA.provsDisplay[prov] + '</b>' + prov2Txt + '.<br>Te preceden <b>' + aheadSame + '</b> opositores de tu 1ª provincia' + mTxt + '.';
    }

    function refreshW() {
        var w = [+$('w-0').value, +$('w-1').value, +$('w-2').value, +$('w-3').value, +$('w-4').value];
        for (var i = 0; i < 5; i++) $('v-' + i).textContent = w[i];
        var nw = NUCLEO.normalizeW(w, []);
        $('wNorm').textContent = 'Normalizados: prov ' + fmtPct(nw[0], 0) + ' · sal ' + fmtPct(nw[1], 0) +
            ' · mun ' + fmtPct(nw[2], 0) + ' · hor ' + fmtPct(nw[3], 0) + ' · fun ' + fmtPct(nw[4], 0);
    }

    function refreshFidNote() {
        var f = +$('inFid').value;
        $('fidNote').textContent = 'El ' + Math.round(f * 100) + ' % elegirá su provincia de examen como preferida; el ' +
            Math.round((1 - f) * 100) + ' % sorteará según proximidad y distribución de aprobados.';
    }

    function refreshDataInfo() {
        var mCount = 0;
        for (var i = 0; i < DATA.aprobados.length; i++) if (DATA.aprobados[i][2]) mCount++;
        $('dataInfo').innerHTML = 'Catálogo definitivo: <b>' + fmtNum(DATA.puestos.length) + '</b> puestos · Aprobados: <b>' +
            DATA.aprobados.length + '</b> (Turno M: ' + mCount + ').';
    }

    /* ---------------- inicialización de controles ---------------- */
    function initUI() {
        var sProv = $('selProv');
        sProv.innerHTML = '';
        for (var i = 0; i < DATA.provs.length; i++) {
            var opt = document.createElement('option');
            opt.value = i;
            opt.textContent = DATA.provsDisplay[i];
            if (i === 5) opt.selected = true; // Zamora por defecto
            sProv.appendChild(opt);
        }

        var sProv2 = $('selProv2');
        if (sProv2) {
            sProv2.innerHTML = '<option value="-1">Por cercanía geográfica (automático)</option>';
            for (var i2 = 0; i2 < DATA.provs.length; i2++) {
                var opt2 = document.createElement('option');
                opt2.value = i2;
                opt2.textContent = DATA.provsDisplay[i2];
                if (i2 === 3) opt2.selected = true; // Salamanca como 2ª por defecto
                sProv2.appendChild(opt2);
            }
            sProv2.addEventListener('change', refreshCtxInfo);
        }

        for (var wIdx = 0; wIdx < 5; wIdx++) {
            $('w-' + wIdx).addEventListener('input', refreshW);
        }

        $('inConc').addEventListener('input', function () { $('vConc').textContent = $('inConc').value; });
        $('inTemp').addEventListener('input', function () { $('vTemp').textContent = (+$('inTemp').value).toFixed(2).replace('.', ','); });
        $('inFid').addEventListener('input', function () {
            $('vFid').textContent = Math.round($('inFid').value * 100) + ' %';
            refreshFidNote();
        });
        $('inRen').addEventListener('input', function () { $('vRen').textContent = Math.round($('inRen').value * 100) + ' %'; });
        if ($('u-sscc')) {
            $('u-sscc').addEventListener('input', function () { $('vu-sscc').textContent = (+$('u-sscc').value).toFixed(2).replace('.', ','); });
        }

        $('inPos').addEventListener('input', refreshCtxInfo);
        $('selProv').addEventListener('change', function () {
            refreshCtxInfo();
            refreshCatalog();
        });

        // Presets de pesos
        $('pw-eq').addEventListener('click', function () { setW([20, 20, 20, 20, 20]); });
        $('pw-prov').addEventListener('click', function () { setW([100, 0, 0, 0, 0]); });
        $('pw-sal').addEventListener('click', function () { setW([0, 100, 0, 0, 0]); });
        $('pw-provsal').addEventListener('click', function () { setW([60, 40, 0, 0, 0]); });

        // Botones principales
        $('btnRun').addEventListener('click', ejecutar);
        $('btnDefaults').addEventListener('click', resetDefaults);
        $('btnTornado').addEventListener('click', tornado);

        // Tema claro/oscuro
        var btnTheme = $('btnTheme');
        if (btnTheme) {
            btnTheme.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
            btnTheme.addEventListener('click', function () {
                var dark = document.body.classList.toggle('dark');
                try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) { }
                btnTheme.textContent = dark ? '☀️' : '🌙';
                repaintCharts();
            });
            // Al imprimir/exportar PDF se fuerza el tema claro (lienzos y tarjetas legibles)
            window.addEventListener('beforeprint', function () {
                if (document.body.classList.contains('dark')) {
                    document.body.classList.remove('dark');
                    btnTheme.textContent = '🌙';
                    repaintCharts();
                    window.__restoreDark = true;
                }
            });
            window.addEventListener('afterprint', function () {
                if (window.__restoreDark) {
                    document.body.classList.add('dark');
                    btnTheme.textContent = '☀️';
                    repaintCharts();
                    window.__restoreDark = false;
                }
            });
        }

        // Exportación y Comparador
        if ($('btnExportPDF')) $('btnExportPDF').addEventListener('click', function () { window.print(); });
        if ($('btnExportCSV')) $('btnExportCSV').addEventListener('click', exportCSV);
        if ($('btnSaveA')) $('btnSaveA').addEventListener('click', function () { saveScenario('A'); });
        if ($('btnSaveB')) $('btnSaveB').addEventListener('click', function () { saveScenario('B'); });
        if ($('btnClearCompare')) $('btnClearCompare').addEventListener('click', clearCompare);

        // Carga de CSVs
        $('fileAprob').addEventListener('change', handleFileAprob);
        $('filePuestos').addEventListener('change', handleFilePuestos);

        cargarConfig();
        refreshAll();
    }

    function setW(arr) {
        for (var i = 0; i < 5; i++) $('w-' + i).value = arr[i];
        refreshW();
    }

    function resetDefaults() {
        try { localStorage.removeItem('sim_cyl_config_v2'); } catch (e) { }
        $('inPos').value = 100;
        $('selProv').value = 5; // Zamora
        if ($('selProv2')) $('selProv2').value = 3; // Salamanca
        $('inSeed').value = 42;
        $('inSims').value = 3000;
        $('chkOtras').checked = true;
        if ($('chkProx')) $('chkProx').checked = true;
        setW([40, 25, 15, 10, 10]);
        $('inConc').value = 30;
        $('inTemp').value = 0.1;
        $('u-e6').value = 1; $('u-e4').value = 0.66; $('u-e3').value = 0.33; $('u-e2').value = 0;
        $('u-cap').value = 1; $('u-com').value = 0.4; $('u-hor').value = 0.5;
        $('u-int').value = 1; $('u-ate').value = 0.5; $('u-res').value = 0.2;
        if ($('u-sscc')) $('u-sscc').value = 0.5;
        $('inFid').value = 0.9;
        $('inRen').value = 0.03;
        $('selTurnoM').value = 'igual';
        refreshAll();
    }

    function refreshAll() {
        infWeights = infWeightsFromData();
        refreshW();
        $('vConc').textContent = $('inConc').value;
        $('vTemp').textContent = (+$('inTemp').value).toFixed(2).replace('.', ',');
        $('vFid').textContent = Math.round($('inFid').value * 100) + ' %';
        $('vRen').textContent = Math.round($('inRen').value * 100) + ' %';
        if ($('u-sscc') && $('vu-sscc')) $('vu-sscc').textContent = (+$('u-sscc').value).toFixed(2).replace('.', ',');
        refreshCatalog();
        refreshCtxInfo();
        refreshFidNote();
        refreshDataInfo();
    }

    /* ---------------- carga de CSV (anulación de embebidos) ---------------- */
    function parseCSVText(text) {
        var rows = [], row = [], field = '', inQ = false, i, c;
        for (i = 0; i < text.length; i++) {
            c = text[i];
            if (inQ) {
                if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
                else field += c;
            } else {
                if (c === '"') inQ = true;
                else if (c === ';') { row.push(field); field = ''; }
                else if (c === '\n') {
                    row.push(field); field = '';
                    if (row.length > 1 || row[0] !== '') rows.push(row);
                    row = [];
                } else if (c !== '\r') field += c;
            }
        }
        if (field !== '' || row.length) { row.push(field); rows.push(row); }
        return rows;
    }

    function colIdx(head, kws) {
        for (var i = 0; i < head.length; i++) {
            var ok = true;
            for (var k = 0; k < kws.length; k++) if (head[i].indexOf(kws[k]) < 0) { ok = false; break; }
            if (ok) return i;
        }
        return -1;
    }

    function parseE(v) {
        var m = /^E\s*0?([0-9])/.exec(String(v == null ? '' : v).trim().toUpperCase());
        if (!m) return 2;
        var d = +m[1];
        return (d === 2 || d === 3 || d === 4 || d === 6) ? d : 2;
    }

    function rebuildPuestos(rows) {
        /* Formato definitivo: Código Puesto;Puesto Ofertado;Grupo;Nivel;ESP;PRV;Adm.;
           Cuerpo/Escala;Localidad;Prov.;Requisitos;Características;Código Unidad;
           Unidad Orgánica;Jerarquía Orgánica;Página PDF  (localización por NOMBRE de cabecera) */
        var head = rows[0].map(normJs);
        var iEsp = colIdx(head, ['ESP']), iProv = colIdx(head, ['PROV.']),
            iLoc = colIdx(head, ['LOCALIDAD']), iReq = colIdx(head, ['REQUISITOS']),
            iNombre = colIdx(head, ['PUESTO OFERTADO']), iUnidad = colIdx(head, ['UNIDAD ORGANICA']),
            iJerar = colIdx(head, ['JERARQUIA']);
        var ine = {
            '47': 'VALLADOLID', '24': 'LEON', '09': 'BURGOS', '37': 'SALAMANCA',
            '40': 'SEGOVIA', '49': 'ZAMORA', '05': 'AVILA', '34': 'PALENCIA', '42': 'SORIA'
        };
        if ([iEsp, iProv, iLoc, iReq, iNombre, iUnidad, iJerar].indexOf(-1) >= 0) return null;
        var muns = [], munCap = [], munMap = {}, descrs = [], descrMap = {},
            conss = [], consMap = {}, tipos = [], tipoMap = {}, posts = [], skipped = 0;
        for (var r = 1; r < rows.length; r++) {
            var row = rows[r];
            if (!row || row.join('').trim() === '') continue;
            var provN = ine[(row[iProv] || '').trim()];
            var pi = provN ? DATA.provs.indexOf(provN) : -1;
            if (pi < 0) { skipped++; continue; }
            var e = parseE(row[iEsp]);
            var mun = (row[iLoc] || '').trim() || provN;
            var loc = mun;
            var fun = normJs(row[iReq] || '');
            var mFca = /FCA\s*(\d{3})/.exec(fun);
            var tipo = mFca ? ('CA' + mFca[1]) : '';
            var nombre = (row[iNombre] || '').trim();
            var descr = (row[iUnidad] || '').trim() || nombre;
            var jerar = (row[iJerar] || '').trim();
            var consj = jerar.split('>')[0].trim();
            var texto = normJs(nombre + ' ' + descr + ' ' + mun + ' ' + loc) + ' ' + fun + ' ' + normJs(jerar);
            var trab = texto.indexOf('RESIDENC') >= 0 ? 2 : (tipo === 'CA033' ? 1 : 0);
            var hor = fun.indexOf('HORARIO ESPECIAL') >= 0 ? 1 : 0;
            var isTerr = texto.indexOf('DELEGACION TERRITORIAL') >= 0 || texto.indexOf('SERVICIO TERRITORIAL') >= 0 ||
                texto.indexOf('DIRECCION PROVINCIAL') >= 0 || texto.indexOf('OFICINA') >= 0 || texto.indexOf('GERENCIA TERRITORIAL') >= 0 ||
                texto.indexOf('IES ') >= 0 || texto.indexOf('CEIP ') >= 0 || texto.indexOf('CENTRO ') >= 0 || texto.indexOf('RESIDENCIA ') >= 0;
            var isSSCC = (pi === 0 && !isTerr) ? 1 : 0;

            var mk = normJs(mun);
            if (!(mk in munMap)) { munMap[mk] = muns.length; muns.push(mun); munCap.push(mk === provN ? 1 : 0); }
            var dk = normJs(descr);
            if (!(dk in descrMap)) { descrMap[dk] = descrs.length; descrs.push(descr); }
            var ck = normJs(consj);
            if (!(ck in consMap)) { consMap[ck] = conss.length; conss.push(consj); }
            var tk = tipo || '?';
            if (!(tk in tipoMap)) { tipoMap[tk] = tipos.length; tipos.push(tk); }
            posts.push([pi, e, trab, hor, munMap[mk], descrMap[dk], consMap[ck], tipoMap[tk], isSSCC]);
        }
        if (posts.length < 50) return null;
        return { posts: posts, muns: muns, munCap: munCap, descrs: descrs, conss: conss, tipos: tipos, skipped: skipped };
    }

    function rebuildAprobados(rows) {
        var head = rows[0].map(normJs);
        var iOrd = colIdx(head, ['ORDEN']), iTur = colIdx(head, ['TURNO']),
            iProv = colIdx(head, ['PROVINCIA']), iNom = colIdx(head, ['APELLIDOS']);
        if ([iOrd, iTur, iProv].indexOf(-1) >= 0) return null;
        var out = [];
        for (var r = 1; r < rows.length; r++) {
            var row = rows[r];
            if (!row || !row[iOrd]) continue;
            var o = parseInt(row[iOrd].trim(), 10);
            if (isNaN(o)) continue;
            var pName = normJs(row[iProv]);
            var pi = DATA.provs.indexOf(pName);
            if (pi < 0) pi = 0;
            var m = normJs(row[iTur]).indexOf('M') === 0 ? 1 : 0;
            var nom = (iNom >= 0 && iNom < row.length) ? row[iNom].trim() : '';
            out.push([o, pi, m, nom]);
        }
        if (out.length < 10) return null;
        out.sort(function (a, b) { return a[0] - b[0]; });
        return out;
    }

    function handleFileAprob(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (evt) {
            try {
                var rows = parseCSVText(evt.target.result);
                var a = rebuildAprobados(rows);
                if (!a) { alert('No se pudo procesar Aprobados.csv. Revisa las columnas (ORDEN, TURNO, PROVINCIA).'); return; }
                DATA.aprobados = a;
                refreshAll();
                alert('Aprobados cargados: ' + a.length + ' aspirantes.');
            } catch (err) { alert('Error: ' + err.message); }
        };
        reader.readAsText(file, 'windows-1252');
    }

    function handleFilePuestos(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (evt) {
            try {
                var rows = parseCSVText(evt.target.result);
                var p = rebuildPuestos(rows);
                if (!p) { alert('No se pudo procesar el catálogo. Revisa las columnas requeridas.'); return; }
                DATA.puestos = p.posts;
                DATA.muns = p.muns; DATA.munCap = p.munCap;
                DATA.descrs = p.descrs; DATA.conss = p.conss; DATA.tipos = p.tipos;
                refreshAll();
                alert('Catálogo actualizado: ' + p.posts.length + ' puestos válidos (' + p.skipped + ' descartados).');
            } catch (err) { alert('Error: ' + err.message); }
        };
        reader.readAsText(file, 'windows-1252');
    }

    /* ---------------- persistencia en localStorage ---------------- */
    function guardarConfig() {
        try {
            var cfg = buildParams();
            localStorage.setItem('sim_cyl_config_v2', JSON.stringify(cfg));
        } catch (e) { }
    }

    function cargarConfig() {
        try {
            var raw = localStorage.getItem('sim_cyl_config_v2');
            if (!raw) return;
            var cfg = JSON.parse(raw);
            if (cfg.userPos) $('inPos').value = cfg.userPos;
            if (cfg.userProv != null) $('selProv').value = cfg.userProv;
            if (cfg.userProv2 != null && $('selProv2')) $('selProv2').value = cfg.userProv2;
            if (cfg.seed != null) $('inSeed').value = cfg.seed;
            if (cfg.aceptaOtras != null) $('chkOtras').checked = cfg.aceptaOtras;
            if (cfg.usarProximidad != null && $('chkProx')) $('chkProx').checked = cfg.usarProximidad;
            if (cfg.wBase) { for (var i = 0; i < 5; i++) $('w-' + i).value = cfg.wBase[i]; }
            if (cfg.conc != null) $('inConc').value = cfg.conc;
            if (cfg.temp != null) $('inTemp').value = cfg.temp;
            if (cfg.utilSal) { $('u-e2').value = cfg.utilSal[0]; $('u-e3').value = cfg.utilSal[1]; $('u-e4').value = cfg.utilSal[2]; $('u-e6').value = cfg.utilSal[3]; }
            if (cfg.utilMun) { $('u-cap').value = cfg.utilMun[0]; $('u-com').value = cfg.utilMun[1]; }
            if (cfg.utilHor != null) $('u-hor').value = cfg.utilHor;
            if (cfg.utilFun) { $('u-int').value = cfg.utilFun[0]; $('u-ate').value = cfg.utilFun[1]; $('u-res').value = cfg.utilFun[2]; }
            if (cfg.utilSSCC != null && $('u-sscc')) $('u-sscc').value = cfg.utilSSCC;
            if (cfg.fidelidad != null) $('inFid').value = cfg.fidelidad;
            if (cfg.renuncias != null) $('inRen').value = cfg.renuncias;
            if (cfg.turnoM) $('selTurnoM').value = cfg.turnoM;
        } catch (e) { }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
