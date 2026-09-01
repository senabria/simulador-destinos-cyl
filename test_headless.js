/* Prueba headless de app.js con DOM simulado (sin navegador, sin dependencias).
   Reproduce los dos problemas reportados:
     A) Turno 362 + 1ª provincia Salamanca + "aceptaOtras" -> KPI "P(plaza en tu provincia)" = 100 %
     B) Botón "Análisis de sensibilidad (tornado)" -> gráfico degenerado (todo 100 %) que parece vacío

   Uso:  node test_headless.js
   (los checks describen el comportamiento CORRECTO; antes de arreglar fallan = bug reproducido) */

'use strict';
var fs = require('fs');
var vm = require('vm');

/* ---------------- DOM simulado ---------------- */
function ctx2d() {
    var calls = { fillText: [] };
    var g = {
        font: '', textAlign: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
        setTransform: function () { }, clearRect: function () { }, fillRect: function () { },
        beginPath: function () { }, moveTo: function () { }, lineTo: function () { },
        stroke: function () { }, fill: function () { }, arc: function () { },
        setLineDash: function () { },
        fillText: function (t, x, y) { calls.fillText.push(String(t)); },
        measureText: function (t) { return { width: String(t).length * 6 }; }
    };
    g._calls = calls;
    return g;
}

function makeEl(id) {
    var classes = {};
    var e = {
        id: id, value: '', checked: false, disabled: false, selected: false,
        textContent: '', innerHTML: '', clientWidth: 600, clientHeight: 240,
        width: 0, height: 0, parentElement: null, _listeners: {},
        style: {},
        classList: {
            add: function (c) { classes[c] = 1; },
            remove: function (c) { delete classes[c]; },
            toggle: function (c) { if (classes[c]) delete classes[c]; else classes[c] = 1; return !!classes[c]; },
            contains: function (c) { return !!classes[c]; }
        },
        addEventListener: function (ev, fn) { (e._listeners[ev] = e._listeners[ev] || []).push(fn); },
        removeEventListener: function () { },
        click: function () { (e._listeners.click || []).forEach(function (f) { f({ target: e }); }); },
        appendChild: function () { },
        getContext: function () { if (!e._ctx) e._ctx = ctx2d(); return e._ctx; }
    };
    return e;
}

var registry = {};
function reg(id, value, extra) {
    var e = makeEl(id);
    if (value !== undefined) e.value = String(value);
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    registry[id] = e;
    return e;
}

/* Valores por defecto equivalentes a los del HTML real */
reg('inPos', 100); reg('inSims', 3000); reg('inSeed', 42);
reg('selProv', 5); reg('selProv2', 3); reg('selTurnoM', 'igual');
reg('chkOtras', '', { checked: true }); reg('chkProx', '', { checked: true });
reg('w-0', 40); reg('w-1', 25); reg('w-2', 15); reg('w-3', 10); reg('w-4', 10);
reg('inConc', 30); reg('inTemp', 0.1); reg('inFid', 0.9); reg('inRen', 0.03);
reg('u-e6', 1); reg('u-e4', 0.66); reg('u-e3', 0.33); reg('u-e2', 0);
reg('u-cap', 1); reg('u-com', 0.4); reg('u-hor', 0.5);
reg('u-int', 1); reg('u-ate', 0.5); reg('u-res', 0.2); reg('u-sscc', 0.5);
var seats2025 = [126, 38, 37, 30, 28, 28, 33, 24, 18];
for (var s = 0; s < 9; s++) reg('seat-' + s, seats2025[s]);
reg('inT', 400);
reg('chartTornado', '', { clientHeight: 360 });
reg('chartCurve', '', { clientHeight: 260 });
reg('progWrap', '', { style: { display: 'none' } });

var escRadios = [
    { value: 'calibrado2025', checked: true },
    { value: 'aleatorio', checked: false },
    { value: 'optimista', checked: false },
    { value: 'pesimista', checked: false }
];

var alerts = [];
global.window = global;                     // window.X === global.X
global.document = {
    readyState: 'complete',
    body: makeEl('body'),
    getElementById: function (id) { return registry[id] || (registry[id] = makeEl(id)); },
    getElementsByName: function (n) { return n === 'esc' ? escRadios : []; },
    createElement: function () { return makeEl('_dyn'); },
    addEventListener: function () { }
};
global.localStorage = {
    _s: {},
    getItem: function (k) { return (k in this._s) ? this._s[k] : null; },
    setItem: function (k, v) { this._s[k] = String(v); },
    removeItem: function (k) { delete this._s[k]; }
};
global.requestAnimationFrame = function (fn) { return setTimeout(fn, 0); };
global.addEventListener = function () { };
global.alert = function (m) { alerts.push(String(m)); };

/* ---------------- carga de datos y scripts ---------------- */
global.DATA = JSON.parse(fs.readFileSync('datos.json', 'utf8'));
vm.runInThisContext(fs.readFileSync('nucleo.js', 'utf8'), { filename: 'nucleo.js' });
vm.runInThisContext(fs.readFileSync('charts.js', 'utf8'), { filename: 'charts.js' });
if (typeof NUCLEO === 'undefined' || !CHARTS) { console.error('ERROR: no se cargaron NUCLEO/CHARTS'); process.exit(2); }

/* Grabadora de llamadas a drawTornado (evidencia del problema B) */
var tornadoCalls = [];
var _drawTornadoOrig = CHARTS.drawTornado;
CHARTS.drawTornado = function (cv, rows, baseline) {
    tornadoCalls.push({
        rows: rows.map(function (r) { return { label: r.label, lo: r.lo, hi: r.hi }; }),
        baseline: baseline
    });
    return _drawTornadoOrig.apply(this, arguments);
};

vm.runInThisContext(fs.readFileSync('app.js', 'utf8'), { filename: 'app.js' });

/* ---------------- utilidades de prueba ---------------- */
function $(id) { return global.document.getElementById(id); }
function waitFor(cond, timeoutMs, label) {
    var t0 = Date.now();
    return new Promise(function (resolve, reject) {
        (function poll() {
            var ok = false;
            try { ok = cond(); } catch (e) { ok = false; }
            if (ok) return resolve(true);
            if (Date.now() - t0 > (timeoutMs || 60000)) return reject(new Error('timeout esperando: ' + label));
            setTimeout(poll, 10);
        })();
    });
}
function parsePct(txt) { return parseFloat(String(txt).replace('%', '').replace(',', '.').trim()); }
var fails = 0, checks = 0;
function check(name, cond, detail) {
    checks++;
    console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

/* ---------------- escenario A: turno 362, Salamanca, aceptaOtras ---------------- */
async function escenarioA() {
    console.log('\n== ESCENARIO A: turno 362 · 1ª Salamanca · aceptaOtras · 300 sims ==');
    $('inPos').value = '362';
    $('selProv').value = '3';          // Salamanca
    $('selProv2').value = '-1';        // por cercanía
    $('chkOtras').checked = true;
    $('inSims').value = '300';
    $('btnRun').click();

    await waitFor(function () { return !$('btnRun').disabled && $('kpiP').textContent !== ''; }, 120000, 'simulación A');

    var kpiP = $('kpiP').textContent;                 // P(plaza en tu 1ª provincia)
    var curva = $('curveAtUser').textContent;
    var pProv = parsePct(kpiP);
    var pCurva = parsePct(curva.split(':').pop());

    console.log('  kpiP (P en tu 1ª provincia) = ' + kpiP);
    console.log('  curva en turno 362          = ' + curva.split(':').pop().trim());

    /* Bug A reproducido si el KPI dice ~100 % pero la curva de la propia provincia dice ~0 % */
    check('A1: la P mostrada como "en tu provincia" es coherente con la curva de esa provincia',
        pProv <= pCurva + 2, 'kpiP=' + pProv + '% vs curva=' + pCurva + '%');
    check('A2: P(plaza en Salamanca) del turno 362 es baja (<25%), no 100%',
        pProv < 25, 'pProv=' + pProv + '%');
    check('A3: eliminado del HTML el KPI "cualquier provincia" (siempre ~100%, no aporta)',
        fs.readFileSync('template.html', 'utf8').indexOf('kpiPCualq') < 0);

    /* Tornado con el perfil degenerado */
    console.log('\n== ESCENARIO A2: tornado con turno 362 · Salamanca ==');
    $('inT').value = '50';
    tornadoCalls = [];
    $('btnTornado').click();
    await waitFor(function () { return !$('btnTornado').disabled && $('tornadoNote').textContent !== ''; }, 180000, 'tornado A');

    var t = tornadoCalls[tornadoCalls.length - 1];
    check('A4: el tornado se calcula y dibuja (19 trabajos, 9 factores)', !!t && t.rows.length === 9,
        t ? ('filas=' + t.rows.length + ', baseline=' + (t.baseline * 100).toFixed(1) + '%') : 'sin dibujo');
    if (t) {
        var todo1 = t.rows.every(function (r) { return r.lo > 0.999 && r.hi > 0.999 && t.baseline > 0.999; });
        console.log('  valores tornado: baseline=' + (t.baseline * 100).toFixed(1) + '% · ' +
            t.rows.map(function (r) { return r.label + '=' + (r.lo * 100).toFixed(0) + '/' + (r.hi * 100).toFixed(0); }).join(' · '));
        check('A5: la métrica del tornado NO es "cualquier plaza" (no todo 100%)', !todo1,
            todo1 ? 'degenerado: todo 100%' : 'varía');
        var msgs = ($('chartTornado')._ctx && $('chartTornado')._ctx._calls.fillText.join(' | ')) || '';
        check('A6: si todos los valores coinciden, el canvas muestra aviso en lugar de gráfico vacío',
            !todo1 || /constante|insensible/i.test(msgs), msgs.slice(0, 80));
    }
}

/* ---------------- escenario B: turno 100, Zamora (perfil por defecto) ---------------- */
async function escenarioB() {
    console.log('\n== ESCENARIO B: turno 100 · 1ª Zamora · aceptaOtras · tornado ==');
    $('inPos').value = '100';
    $('selProv').value = '5';          // Zamora
    $('selProv2').value = '3';
    $('chkOtras').checked = true;
    $('inSims').value = '300';
    $('btnRun').click();
    await waitFor(function () { return !$('btnRun').disabled && $('kpiP').textContent !== ''; }, 120000, 'simulación B');

    var pProv = parsePct($('kpiP').textContent);
    console.log('  kpiP=' + $('kpiP').textContent);
    check('B1: P(plaza en Zamora) del turno 100 está en rango plausible (30-100%)',
        pProv >= 30 && pProv <= 100, 'pProv=' + pProv + '%');

    $('inT').value = '50';
    tornadoCalls = [];
    $('btnTornado').click();
    await waitFor(function () { return !$('btnTornado').disabled && $('tornadoNote').textContent !== ''; }, 180000, 'tornado B');

    var t = tornadoCalls[tornadoCalls.length - 1];
    check('B2: tornado dibujado con 9 factores', !!t && t.rows.length === 9,
        t ? 'baseline=' + (t.baseline * 100).toFixed(1) + '%' : 'sin dibujo');
    if (t) {
        var spread = Math.max.apply(null, t.rows.map(function (r) { return Math.abs(r.hi - r.lo); }));
        var msgsB = ($('chartTornado')._ctx && $('chartTornado')._ctx._calls.fillText.join(' | ')) || '';
        console.log('  dispersión máxima entre lo/hi: ' + (spread * 100).toFixed(1) + ' puntos');
        /* Si la probabilidad es realmente invariante (p. ej. 100% estructural),
           el gráfico debe mostrar el aviso de resultado constante, no quedar vacío. */
        check('B3: sensibilidad real (≥2 puntos) o aviso explícito de resultado constante',
            spread >= 0.02 || /Resultado constante/i.test(msgsB),
            'spread=' + (spread * 100).toFixed(1) + 'pts' + (spread < 0.02 ? ' + aviso constante' : ''));
    }
}

/* ---------------- ejecución ---------------- */
escenarioA()
    .then(escenarioB)
    .then(function () {
        console.log('\n' + (checks - fails) + '/' + checks + ' comprobaciones superadas' + (fails ? ' — HAY FALLOS (bugs reproducidos si es la 1ª ejecución)' : ''));
        process.exit(fails ? 1 : 0);
    })
    .catch(function (err) {
        console.error('ERROR: ' + err.message);
        if (alerts.length) console.error('alerts: ' + alerts.join(' | '));
        process.exit(2);
    });
