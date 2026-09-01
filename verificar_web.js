/* Verificación estructural de simulador.html + benchmark de rendimiento */
var fs = require('fs');
var NUCLEO = require('./nucleo.js');
var DATA = JSON.parse(fs.readFileSync('datos.json', 'utf8'));

var html = fs.readFileSync('simulador.html', 'utf8');
var app = fs.readFileSync('app.js', 'utf8');
var charts = fs.readFileSync('charts.js', 'utf8');

/* 1. Tokens sustituidos */
var mal = 0;
['<!--NUCLEO-->', '<!--CHARTS-->', '<!--APP-->', '/*__DATA__*/{}', '__FECHA__'].forEach(function (t) {
    if (html.indexOf(t) >= 0) { console.log('FAIL  token sin sustituir: ' + t); mal++; }
});
if (html.indexOf('var DATA = {"provs"') < 0) { console.log('FAIL  DATA no embebido'); mal++; }
else console.log('PASS  tokens sustituidos y DATA embebido');

/* 2. IDs referenciados en app.js presentes en el HTML */
var refs = {}, re = /\$\('([^']+)'\)/g, m;
while ((m = re.exec(app))) refs[m[1]] = true;
var faltan = [];
Object.keys(refs).forEach(function (id) {
    if (id.indexOf('seat-') === 0) return; /* se crean dinámicamente */
    if (html.indexOf('id="' + id + '"') < 0) faltan.push(id);
});
if (faltan.length) { console.log('FAIL  IDs ausentes en HTML: ' + faltan.join(', ')); mal++; }
else console.log('PASS  los ' + Object.keys(refs).length + ' IDs referenciados existen en el HTML');

/* 3. Los tres scripts embebidos en orden */
var iN = html.indexOf('var NUCLEO'), iC = html.indexOf('window.CHARTS'), iA = html.indexOf('LÓGICA DE LA INTERFAZ');
if (iN < 0 || iC < 0 || iA < 0 || !(iN < iC && iC < iA)) { console.log('FAIL  orden de scripts (' + iN + ',' + iC + ',' + iA + ')'); mal++; }
else console.log('PASS  scripts embebidos en orden NUCLEO < CHARTS < APP');

/* 4. Sin restos de entidades rotas en app.js embebido */
if (html.indexOf("'''") >= 0) { console.log('FAIL  posible string roto en HTML'); mal++; }
else console.log('PASS  sin cadenas rotas');

/* 5. Benchmark: 3000 simulaciones con parámetros por defecto */
function infW() {
    var w = new Array(DATA.provs.length).fill(0);
    DATA.aprobados.forEach(function (a) { w[a[1]]++; });
    return w.map(function (v) { return v / DATA.aprobados.length; });
}
var p = {
    seats: DATA.seatsRPT.slice(), wBase: [40, 25, 15, 10, 10],
    utilSal: [0, 0.33, 0.66, 1], utilMun: [1, 0.4], utilHor: 0.5, utilFun: [1, 0.5, 0.2],
    fidelidad: 0.8, pesosInfidelidad: infW(), renuncias: 0.15, conc: 30, temp: 0.1,
    escenario: 'aleatorio', turnoM: 'igual', userPos: 118, userProv: 5,
    aceptaOtras: false, seed: 42, earlyStop: false
};
var ctx = NUCLEO.buildCtx(DATA, p);
var acc = NUCLEO.newAcc(ctx);
var rng = NUCLEO.mulberry32(42);
var N = 3000, t0 = Date.now();
for (var i = 0; i < N; i++) NUCLEO.simulateOnce(ctx, p, rng, acc);
var ms = Date.now() - t0;
console.log('INFO  ' + N + ' sims en ' + ms + ' ms (' + (ms / N).toFixed(2) + ' ms/sim) -> ' +
    (N / (ms / 1000)).toFixed(0) + ' sims/s');
console.log('INFO  P(Zamora)=' + (acc.got / N * 100).toFixed(1) + '%  E02=' + acc.eCount[0] +
    ' E03=' + acc.eCount[1] + ' E04=' + acc.eCount[2] + ' E06=' + acc.eCount[3] + ' sin=' + acc.eCount[4]);
if (ms / N > 15) { console.log('FAIL  demasiado lento para el navegador'); mal++; }
else console.log('PASS  rendimiento adecuado');

process.exit(mal ? 1 : 0);
