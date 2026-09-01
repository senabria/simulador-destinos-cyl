/* NÚCLEO DE SIMULACIÓN — JS puro sin DOM.
   Se inyecta en simulador.html y se usa también desde test_nucleo.js (Node). */
var NUCLEO = (function () {
    'use strict';

    /* ---------- Generador aleatorio determinista (mulberry32) ---------- */
    function mulberry32(seed) {
        var a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function rngNormal(rng) {
        var u = 0, v = 0;
        while (u === 0) u = rng();
        while (v === 0) v = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    /* Muestreo Gamma (Marsaglia-Tsang) para la Dirichlet */
    function rngGamma(rng, shape) {
        if (shape <= 0) return 0;
        if (shape < 1) {
            var u0 = rng();
            return rngGamma(rng, shape + 1) * Math.pow(u0, 1 / shape);
        }
        var d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
        for (; ;) {
            var x, v, u;
            do { x = rngNormal(rng); v = 1 + c * x; } while (v <= 0);
            v = v * v * v;
            u = rng();
            if (u < 1 - 0.0331 * x * x * x * x) return d * v;
            if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
        }
    }

    function sampleDirichlet(rng, alpha, out) {
        var s = 0, i;
        for (i = 0; i < alpha.length; i++) { out[i] = rngGamma(rng, alpha[i]); s += out[i]; }
        if (s <= 0) { var u = 1 / alpha.length; for (i = 0; i < alpha.length; i++) out[i] = u; }
        else for (i = 0; i < alpha.length; i++) out[i] /= s;
        return out;
    }

    function normalizeW(arr, out) {
        var s = 0, i;
        for (i = 0; i < arr.length; i++) s += Math.max(0, arr[i]);
        if (s <= 0) { var u = 1 / arr.length; for (i = 0; i < arr.length; i++) out[i] = u; }
        else for (i = 0; i < arr.length; i++) out[i] = Math.max(0, arr[i]) / s;
        return out;
    }

    /* ---------- Contexto estático derivado de (datos, parámetros) ----------
       p = {
         seats[9], wBase[5] (prov, sal, mun, hor, fun),
         utilSal[4] (E02,E03,E04,E06), utilMun[2] (capital, comarca),
         utilHor, utilFun[3] (interna, atención, residencias), utilSSCC,
         fidelidad, pesosInfidelidad[9], usarProximidad (bool),
         renuncias, conc (Dirichlet), temp (softmax),
         escenario ('calibrado2025'|'aleatorio'|'optimista'|'pesimista'),
         turnoM ('igual'|'soloE02'|'excluidos'),
         userPos, userProv, userProv2, aceptaOtras, seed, earlyStop
       } */
    function buildCtx(data, p) {
        var n = data.puestos.length, i;
        var provArr = new Int8Array(n), eArr = new Int8Array(n), trabArr = new Int8Array(n);
        var horArr = new Int8Array(n), capArr = new Int8Array(n), ssccArr = new Int8Array(n);
        var salU = new Float64Array(n), munU = new Float64Array(n), horU = new Float64Array(n), funU = new Float64Array(n), ssccU = new Float64Array(n);
        var salMap = { 2: p.utilSal[0], 3: p.utilSal[1], 4: p.utilSal[2], 6: p.utilSal[3] };
        var funMap = [p.utilFun[0], p.utilFun[1], p.utilFun[2]];
        var pools = [], poolsByE = [];
        for (i = 0; i < data.provs.length; i++) {
            pools.push([]);
            poolsByE.push({ 2: [], 3: [], 4: [], 6: [] });
        }
        var utilSSCCVal = (p.utilSSCC !== undefined ? p.utilSSCC : 0.5);

        for (i = 0; i < n; i++) {
            var q = data.puestos[i];
            provArr[i] = q[0]; eArr[i] = q[1]; trabArr[i] = q[2]; horArr[i] = q[3];
            capArr[i] = data.munCap[q[4]] ? 1 : 0;
            ssccArr[i] = (q.length > 8 ? q[8] : (q[0] === 0 && capArr[i] ? 1 : 0));
            salU[i] = salMap[q[1]] || 0;
            munU[i] = capArr[i] ? p.utilMun[0] : p.utilMun[1];
            horU[i] = q[3] ? p.utilHor : 0;
            funU[i] = funMap[q[2]] || 0;
            ssccU[i] = ssccArr[i] ? utilSSCCVal : 0;
            pools[q[0]].push(i);
            if (poolsByE[q[0]][q[1]]) poolsByE[q[0]][q[1]].push(i);
        }

        function sortedPool(pi, desc) {
            return pools[pi].slice().sort(function (a, b) { return desc ? (eArr[b] - eArr[a]) : (eArr[a] - eArr[b]); });
        }
        var poolsDesc = [], poolsAsc = [];
        for (i = 0; i < pools.length; i++) {
            poolsDesc.push(sortedPool(i, true));
            poolsAsc.push(sortedPool(i, false));
        }

        // Matriz de infidelidad (por provincia de origen si usarProximidad=true)
        var wInf = normalizeW(p.pesosInfidelidad.slice(), []);
        var cumInfByProv = [];
        var proxMat = data.proxMatrix;

        for (var pi = 0; pi < data.provs.length; pi++) {
            var wProv = [];
            for (var pj = 0; pj < data.provs.length; pj++) {
                var factor = (p.usarProximidad && proxMat && proxMat[pi]) ? proxMat[pi][pj] : 1;
                wProv.push(wInf[pj] * factor);
            }
            normalizeW(wProv, wProv);
            var cum = [], acc = 0;
            for (var k = 0; k < wProv.length; k++) { acc += wProv[k]; cum.push(acc); }
            cumInfByProv.push(cum);
        }

        var nCand = data.aprobados.length;
        var candProv = new Int8Array(nCand), candM = new Uint8Array(nCand);
        for (i = 0; i < nCand; i++) { candProv[i] = data.aprobados[i][1]; candM[i] = data.aprobados[i][2]; }

        var wB = normalizeW(p.wBase.slice(), []);
        var alpha = [];
        for (i = 0; i < wB.length; i++) alpha.push(wB[i] * p.conc);

        var totalPosts = 0;
        for (i = 0; i < pools.length; i++) totalPosts += Math.min(p.seats[i] || 0, pools[i].length);

        return {
            data: data, n: n, provArr: provArr, eArr: eArr, trabArr: trabArr, horArr: horArr, capArr: capArr, ssccArr: ssccArr,
            salU: salU, munU: munU, horU: horU, funU: funU, ssccU: ssccU,
            pools: pools, poolsByE: poolsByE, poolsDesc: poolsDesc, poolsAsc: poolsAsc,
            cumInfByProv: cumInfByProv, candProv: candProv, candM: candM, alpha: alpha,
            nProv: data.provs.length, nCand: nCand, totalPosts: totalPosts
        };
    }

    /* Subconjunto 1600 -> N plazas según escenario (estratificado por provincia) */
    function makeSubset(ctx, p, rng, outArr) {
        var k = 0, pi, j;
        var stats25 = ctx.data.stats2025;

        for (pi = 0; pi < ctx.nProv; pi++) {
            var take = Math.min(p.seats[pi] || 0, ctx.pools[pi].length);
            if (take <= 0) continue;

            if (p.escenario === 'calibrado2025' && stats25 && stats25.perProv && stats25.perProv[pi]) {
                // Muestreo estratificado por Nivel E basado en histórico 2025
                var ratios = stats25.perProv[pi].eRatios;
                var eLevels = [6, 4, 3, 2];
                var allocated = 0;
                var used = {};

                // Extraer de cada nivel E según la proporción 2025
                for (var elIdx = 0; elIdx < eLevels.length; elIdx++) {
                    var el = eLevels[elIdx];
                    var targetCount = (elIdx === eLevels.length - 1) ? (take - allocated) : Math.round(take * (ratios[el] || 0));
                    targetCount = Math.max(0, Math.min(targetCount, take - allocated));
                    var elPool = ctx.poolsByE[pi][el].slice();
                    var elTake = Math.min(targetCount, elPool.length);

                    for (j = 0; j < elTake; j++) {
                        var r = j + Math.floor(rng() * (elPool.length - j));
                        var tmp = elPool[j]; elPool[j] = elPool[r]; elPool[r] = tmp;
                        outArr[k++] = elPool[j];
                        used[elPool[j]] = true;
                        allocated++;
                    }
                }

                // Si por redondeo o falta de plazas en algún nivel faltan puestos, rellenar del pool provincial
                if (allocated < take) {
                    var remainingPool = [];
                    for (var rIdx = 0; rIdx < ctx.pools[pi].length; rIdx++) {
                        var pid = ctx.pools[pi][rIdx];
                        if (!used[pid]) remainingPool.push(pid);
                    }
                    var needed = take - allocated;
                    for (j = 0; j < needed && j < remainingPool.length; j++) {
                        var r2 = j + Math.floor(rng() * (remainingPool.length - j));
                        var tmp2 = remainingPool[j]; remainingPool[j] = remainingPool[r2]; remainingPool[r2] = tmp2;
                        outArr[k++] = remainingPool[j];
                        allocated++;
                    }
                }
            } else if (p.escenario === 'optimista') {
                var pd = ctx.poolsDesc[pi];
                for (j = 0; j < take; j++) outArr[k++] = pd[j];
            } else if (p.escenario === 'pesimista') {
                var pa = ctx.poolsAsc[pi];
                for (j = 0; j < take; j++) outArr[k++] = pa[j];
            } else {
                // Aleatorio uniforme
                var pool = ctx.pools[pi].slice();
                for (j = 0; j < take; j++) {
                    var r3 = j + Math.floor(rng() * (pool.length - j));
                    var tmp3 = pool[j]; pool[j] = pool[r3]; pool[r3] = tmp3;
                    outArr[k++] = pool[j];
                }
            }
        }
        return k;
    }

    function newAcc(ctx) {
        var tp = ctx.totalPosts;
        return {
            got: 0, sinPlaza: 0,
            gotProv: 0,   /* plazas obtenidas por el usuario en su 1ª provincia */
            eCount: [0, 0, 0, 0, 0],   // E02, E03, E04, E06, sin plaza
            munCount: [0, 0, 0],       // capital, comarca, sin plaza
            trabCount: [0, 0, 0, 0],   // interna, atención, residencias, sin plaza
            ssccCount: [0, 0, 0],      // SSCC, territorial, sin plaza
            availAtPos: new Int32Array(ctx.nCand),
            remAtUser: 0,
            exhArr: [],
            samples: [],
            _avail: new Int32Array(tp), _U: new Float64Array(tp), _idx: new Int32Array(tp), _w: new Float64Array(5)
        };
    }

    /* ---------- Una simulación completa ---------- */
    function simulateOnce(ctx, p, rng, acc) {
        var avail = acc._avail, U = acc._U, idxs = acc._idx, w = acc._w;
        var nAvail = makeSubset(ctx, p, rng, avail);
        var userPos0 = Math.min(Math.max(1, p.userPos | 0), ctx.nCand) - 1;
        var remainingUser = 0, i, k, j;
        for (i = 0; i < nAvail; i++) if (ctx.provArr[avail[i]] === p.userProv) remainingUser++;
        var exhaustion = -1;

        for (i = 0; i < ctx.nCand; i++) {
            var isUser = (i === userPos0);
            if (!p.earlyStop) acc.availAtPos[i] += (remainingUser > 0 ? 1 : 0);
            if (isUser) acc.remAtUser += remainingUser;
            if (p.earlyStop && i > userPos0 && remainingUser === 0) break;
            if (!isUser && rng() < p.renuncias) continue;

            var m = ctx.candM[i];
            if (m && !isUser && p.turnoM === 'excluidos') continue;
            var restrictE02 = (m && !isUser && p.turnoM === 'soloE02');

            if (isUser) { w[0] = 1; w[1] = 0; w[2] = 0; w[3] = 0; w[4] = 0; }
            else sampleDirichlet(rng, ctx.alpha, w);

            var pref;
            if (isUser) pref = p.userProv;
            else if (rng() < p.fidelidad) pref = ctx.candProv[i];
            else {
                var uu = rng();
                var candOrigin = ctx.candProv[i];
                var cumInf = ctx.cumInfByProv[candOrigin] || ctx.cumInfByProv[0];
                pref = ctx.nProv - 1;
                for (k = 0; k < cumInf.length; k++) { if (uu <= cumInf[k]) { pref = k; break; } }
            }

            /* Utilidad de cada puesto libre */
            var nElig = 0, wp = w[0], ws = w[1], wm = w[2], wh = w[3], wf = w[4];
            for (k = 0; k < nAvail; k++) {
                j = avail[k];
                if (restrictE02 && ctx.eArr[j] !== 2) continue;
                U[nElig] = wp * (ctx.provArr[j] === pref ? 1 : 0) + ws * ctx.salU[j] +
                    wm * ctx.munU[j] + wh * ctx.horU[j] + wf * ctx.funU[j] + (ctx.ssccU[j] || 0);
                idxs[nElig] = k;
                nElig++;
            }
            if (nElig === 0) {
                if (isUser) { acc.sinPlaza++; acc.eCount[4]++; acc.munCount[2]++; acc.trabCount[3]++; acc.ssccCount[2]++; }
                continue;
            }

            var chosenK;
            if (isUser) {
                /* REGLA DE ELECCIÓN JERÁRQUICA DEL USUARIO:
                   1. Si quedan plazas en su 1ª provincia (p.userProv), elige obligatoriamente la MEJOR plaza de su 1ª provincia.
                   2. Si se han agotado las de su 1ª provincia y aceptaOtras está activo:
                      a) Si tiene 2ª provincia preferida (p.userProv2 >= 0) y quedan plazas en ella, elige la mejor en esa 2ª provincia.
                      b) Si no, elige la mejor plaza en la provincia disponible más cercana físicamente.
                   3. Si no acepta otras o no queda nada en sus preferencias, queda sin plaza.
                */
                var targetProv = -1;

                // Paso 1: ¿Hay plazas en la 1ª provincia preferida?
                for (var el1 = 0; el1 < nElig; el1++) {
                    if (ctx.provArr[avail[idxs[el1]]] === p.userProv) {
                        targetProv = p.userProv;
                        break;
                    }
                }

                // Paso 2: Si no hay en 1ª provincia y acepta otras:
                if (targetProv < 0 && p.aceptaOtras) {
                    // ¿Hay plazas en la 2ª provincia preferida?
                    if (p.userProv2 != null && p.userProv2 >= 0 && p.userProv2 !== p.userProv) {
                        for (var el2 = 0; el2 < nElig; el2++) {
                            if (ctx.provArr[avail[idxs[el2]]] === p.userProv2) {
                                targetProv = p.userProv2;
                                break;
                            }
                        }
                    }

                    // Si aún no hay targetProv, buscar la provincia disponible más cercana
                    if (targetProv < 0 && ctx.data.distMatrix && ctx.data.distMatrix[p.userProv]) {
                        var dists = ctx.data.distMatrix[p.userProv];
                        var minDist = Infinity;
                        for (var el3 = 0; el3 < nElig; el3++) {
                            var pr = ctx.provArr[avail[idxs[el3]]];
                            var d = dists[pr];
                            if (d < minDist) {
                                minDist = d;
                                targetProv = pr;
                            }
                        }
                    }
                }

                // Si no se encontró ninguna provincia admisible para el usuario
                if (targetProv < 0) {
                    acc.sinPlaza++; acc.eCount[4]++; acc.munCount[2]++; acc.trabCount[3]++; acc.ssccCount[2]++;
                    continue;
                }

                // Elegir la plaza de mayor utilidad dentro de targetProv
                var best = -Infinity, bestEl = -1, kk, jj, uval;
                for (kk = 0; kk < nElig; kk++) {
                    jj = avail[idxs[kk]];
                    if (ctx.provArr[jj] !== targetProv) continue;
                    uval = (ctx.salU[jj] + ctx.munU[jj] + ctx.horU[jj] + ctx.funU[jj] + (ctx.ssccU[jj] || 0)) / 4;
                    if (uval > best) { best = uval; bestEl = kk; }
                }

                if (bestEl < 0) {
                    acc.sinPlaza++; acc.eCount[4]++; acc.munCount[2]++; acc.trabCount[3]++; acc.ssccCount[2]++;
                    continue;
                }
                chosenK = idxs[bestEl];
            } else if (p.temp <= 0.01) {
                /* Determinista: argmax con desempate aleatorio */
                var mx = -Infinity;
                for (k = 0; k < nElig; k++) if (U[k] > mx) mx = U[k];
                var ties = 0;
                for (k = 0; k < nElig; k++) if (U[k] === mx) ties++;
                var pick = Math.floor(rng() * ties), cnt = 0, sel = nElig - 1;
                for (k = 0; k < nElig; k++) { if (U[k] === mx) { if (cnt === pick) { sel = k; break; } cnt++; } }
                chosenK = idxs[sel];
            } else {
                /* Softmax con temperatura p.temp */
                var mx2 = -Infinity;
                for (k = 0; k < nElig; k++) if (U[k] > mx2) mx2 = U[k];
                var sum = 0;
                for (k = 0; k < nElig; k++) { U[k] = Math.exp((U[k] - mx2) / p.temp); sum += U[k]; }
                var r2 = rng() * sum, c2 = 0;
                for (k = 0; k < nElig; k++) { c2 += U[k]; if (r2 <= c2) break; }
                if (k >= nElig) k = nElig - 1;
                chosenK = idxs[k];
            }

            var chosenPost = avail[chosenK];
            avail[chosenK] = avail[--nAvail];   /* eliminación en O(1) */
            if (ctx.provArr[chosenPost] === p.userProv) { remainingUser--; exhaustion = i; }
            if (isUser) {
                acc.got++;
                if (ctx.provArr[chosenPost] === p.userProv) acc.gotProv++;
                var e = ctx.eArr[chosenPost];
                acc.eCount[e === 6 ? 3 : e === 4 ? 2 : e === 3 ? 1 : 0]++;
                acc.munCount[ctx.capArr[chosenPost] ? 0 : 1]++;
                acc.trabCount[ctx.trabArr[chosenPost]]++;
                acc.ssccCount[ctx.ssccArr[chosenPost] ? 0 : 1]++;
                if (acc.samples.length < 40 && rng() < 0.04) acc.samples.push(chosenPost);
            }
        }
        acc.exhArr.push(exhaustion);
    }

    /* ---------- Intervalo de confianza de Wilson (95 %) ---------- */
    function ciWilson(k, n) {
        if (n === 0) return [0, 1];
        var z = 1.959963984540054, phat = k / n;
        var a = phat + z * z / (2 * n);
        var b = z * Math.sqrt(phat * (1 - phat) / n + z * z / (4 * n * n));
        var den = 1 + z * z / n;
        return [Math.max(0, (a - b) / den), Math.min(1, (a + b) / den)];
    }

    return {
        mulberry32: mulberry32, rngGamma: rngGamma, sampleDirichlet: sampleDirichlet,
        normalizeW: normalizeW, buildCtx: buildCtx, makeSubset: makeSubset,
        newAcc: newAcc, simulateOnce: simulateOnce, ciWilson: ciWilson
    };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NUCLEO;
