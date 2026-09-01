/* Pruebas automáticas del núcleo de simulación.
   Uso:  python generar_web.py   (genera datos.json)   y luego:  node test_nucleo.js */
var fs = require('fs');
var NUCLEO = require('./nucleo.js');
var DATA = JSON.parse(fs.readFileSync('datos.json', 'utf8'));

function infW() {
    var w = new Array(DATA.provs.length).fill(0);
    DATA.aprobados.forEach(function (a) { w[a[1]]++; });
    return w.map(function (v) { return v / DATA.aprobados.length; });
}
function defParams(over) {
    var p = {
        seats: (DATA.seats2025 || DATA.seatsRPT).slice(), wBase: [40, 25, 15, 10, 10],
        utilSal: [0, 0.33, 0.66, 1], utilMun: [1, 0.4], utilHor: 0.5, utilFun: [1, 0.5, 0.2], utilSSCC: 0.5,
        fidelidad: 0.8, pesosInfidelidad: infW(), usarProximidad: true, renuncias: 0.15, conc: 30, temp: 0.1,
        escenario: 'calibrado2025', turnoM: 'igual',
        userPos: 118, userProv: DATA.provs.indexOf('ZAMORA'),
        aceptaOtras: false, seed: 42, earlyStop: false
    };
    if (over) Object.keys(over).forEach(function (k) { p[k] = over[k]; });
    return p;
}
function runSims(p, n) {
    var ctx = NUCLEO.buildCtx(DATA, p);
    var acc = NUCLEO.newAcc(ctx);
    var rng = NUCLEO.mulberry32(p.seed);
    for (var i = 0; i < n; i++) NUCLEO.simulateOnce(ctx, p, rng, acc);
    return { ctx: ctx, acc: acc };
}
function meanE(acc) {
    var s = acc.eCount[0] * 2 + acc.eCount[1] * 3 + acc.eCount[2] * 4 + acc.eCount[3] * 6;
    var n = acc.eCount[0] + acc.eCount[1] + acc.eCount[2] + acc.eCount[3];
    return n ? s / n : 0;
}

var fails = 0, checks = 0;
function check(name, cond) {
    checks++;
    if (cond) console.log('PASS  ' + name);
    else { fails++; console.log('FAIL  ' + name); }
}

/* 1. Integridad de datos y contexto */
var p0 = defParams();
var ctx0 = NUCLEO.buildCtx(DATA, p0);
var expTotal = 0;
for (var i = 0; i < ctx0.nProv; i++) expTotal += Math.min(p0.seats[i], ctx0.pools[i].length);
check('totalPosts = sum(min(plazas,pool)) = ' + ctx0.totalPosts, ctx0.totalPosts === expTotal);
check('362 aprobados', DATA.aprobados.length === 362);
check('Turno M = 11', DATA.aprobados.filter(function (a) { return a[2] === 1; }).length === 11);
check('E06 globales = 55', DATA.puestos.filter(function (q) { return q[1] === 6; }).length === 55);
check('pool Zamora = 130', ctx0.pools[DATA.provs.indexOf('ZAMORA')].length === 130);
check('Histórico 2025 cargado con 380 plazas', DATA.stats2025 && DATA.stats2025.total === 380);

/* 2. Determinismo con la misma semilla */
var r1 = runSims(defParams(), 40), r2 = runSims(defParams(), 40);
check('determinismo (misma semilla, mismo resultado)',
    r1.acc.got === r2.acc.got && r1.acc.eCount.join() === r2.acc.eCount.join());

/* 3. Solo provincia + fidelidad 1 + sin renuncias -> P ~ 1
   (28 plazas de Zamora frente a 12 fieles por delante) */
var r3 = runSims(defParams({ wBase: [100, 0, 0, 0, 0], fidelidad: 1, renuncias: 0, temp: 0 }), 200);
check('solo provincia: P >= 99% (obtenido ' + (r3.acc.got / 200 * 100).toFixed(1) + '%)',
    r3.acc.got / 200 >= 0.99);

/* 3b. Sin aceptaOtras el usuario solo toma plazas de su 1ª provincia:
      el contador gotProv (plaza en la 1ª provincia) debe coincidir con got */
var r3b = runSims(defParams(), 100);
check('sin aceptaOtras: got === gotProv', r3b.acc.got === r3b.acc.gotProv);

/* 4. Curva de disponibilidad monótona no creciente */
var r4 = runSims(defParams(), 1);
var mono = true;
for (var j = 1; j < r4.ctx.nCand; j++) if (r4.acc.availAtPos[j] > r4.acc.availAtPos[j - 1]) mono = false;
check('curva de disponibilidad monótona', mono);

/* 5. Coherencia de distribuciones */
var n5 = 150, r5 = runSims(defParams(), n5);
check('got + sinPlaza = n', r5.acc.got + r5.acc.sinPlaza === n5);
check('eCount suma n', r5.acc.eCount.reduce(function (a, b) { return a + b; }, 0) === n5);
check('munCount suma n', r5.acc.munCount.reduce(function (a, b) { return a + b; }, 0) === n5);
check('trabCount suma n', r5.acc.trabCount.reduce(function (a, b) { return a + b; }, 0) === n5);
check('ssccCount suma n', r5.acc.ssccCount.reduce(function (a, b) { return a + b; }, 0) === n5);
check('exhArr tiene una entrada por simulación', r5.acc.exhArr.length === n5);

/* 6. Escenarios: optimista rinde niveles E más altos que pesimista */
var rO = runSims(defParams({ escenario: 'optimista' }), 150);
var rP = runSims(defParams({ escenario: 'pesimista' }), 150);
check('E medio optimista (' + meanE(rO.acc).toFixed(2) + ') > pesimista (' + meanE(rP.acc).toFixed(2) + ')',
    meanE(rO.acc) > meanE(rP.acc));

/* 7. Escenario Calibrado 2025 se ejecuta correctamente */
var r25 = runSims(defParams({ escenario: 'calibrado2025' }), 150);
check('Escenario calibrado 2025 genera resultados válidos', r25.acc.got + r25.acc.sinPlaza === 150);

/* 8. Sin plazas de la provincia -> siempre sin plaza */
var seats0 = DATA.seatsRPT.slice();
for (var k = 0; k < seats0.length; k++) seats0[k] = 0;
var r7 = runSims(defParams({ seats: seats0 }), 50);
check('0 plazas -> sin plaza en las 50 sims', r7.acc.sinPlaza === 50);

/* 9. IC de Wilson razonable */
var ci = NUCLEO.ciWilson(300, 400);
check('CI Wilson contiene 0,75 y en [0,1]', ci[0] <= 0.75 && ci[1] >= 0.75 && ci[0] >= 0 && ci[1] <= 1);

/* 10. Sin NaN */
check('sin NaN en resultados', isFinite(r5.acc.got) && isFinite(r5.acc.remAtUser) &&
    r5.acc.eCount.every(function (v) { return isFinite(v); }));

/* 11. Turno M excluidos corre sin errores */
var r10 = runSims(defParams({ turnoM: 'excluidos' }), 60);
check('turno M excluidos se ejecuta', r10.acc.got + r10.acc.sinPlaza === 60);

/* 12. earlyStop no altera el resultado del usuario (1 simulación, misma semilla) */
var r11a = runSims(defParams(), 1);
var r11b = runSims(defParams({ earlyStop: true }), 1);
check('earlyStop no cambia el resultado del usuario', r11a.acc.got === r11b.acc.got);

console.log('\n' + (checks - fails) + '/' + checks + ' pruebas superadas' + (fails ? ' — HAY FALLOS' : ''));
process.exit(fails ? 1 : 0);
