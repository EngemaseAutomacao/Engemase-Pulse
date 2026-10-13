// Task do InfluxDB 2.x que gera o bucket agregado por hora usado pelo sistema
// em históricos longos (7/30 dias, períodos personalizados) e no consumo diário/mensal.
//
// Como usar (uma vez por InfluxDB):
//   1. Crie o bucket de destino, ex.: "medicoes_1h" (retenção sugerida: 5 anos).
//   2. Em Tasks → Create Task, cole este script trocando SOURCE e DEST.
//   3. Na unidade (Administração → Unidades), preencha "Bucket agregado por hora" com DEST.
//   4. Para preencher o passado, rode uma vez a consulta de "carga inicial" no fim do arquivo.
//
// Regras do formato (o sistema depende delas):
//   - mesmo _measurement, tags e nomes de _field do bucket original;
//   - um ponto por hora, com horário = INÍCIO da hora (timeSrc: "_start");
//   - contadores de energia: último valor da hora; demais grandezas: média da hora.

import "date"
import "types"

option task = {name: "rollup-1h", every: 1h, offset: 5m}

SOURCE = "medicoes"
DEST = "medicoes_1h"
COUNTERS = ["Total_net_kWh", "Total_kVAh", "Total_kVAhr"]

// Da hora anterior (já completa) até agora; a hora corrente é regravada na próxima execução.
start = date.truncate(t: -task.every, unit: 1h)

data =
    from(bucket: SOURCE)
        |> range(start: start)
        |> filter(fn: (r) => types.isType(v: r._value, type: "float") or types.isType(v: r._value, type: "int"))

counters =
    data
        |> filter(fn: (r) => contains(value: r._field, set: COUNTERS))
        |> aggregateWindow(every: 1h, fn: last, createEmpty: false, timeSrc: "_start")

averages =
    data
        |> filter(fn: (r) => not contains(value: r._field, set: COUNTERS))
        |> aggregateWindow(every: 1h, fn: mean, createEmpty: false, timeSrc: "_start")

union(tables: [counters, averages])
    |> to(bucket: DEST)

// ---------------------------------------------------------------------------
// Carga inicial (rode uma vez no Data Explorer, ajustando o período):
//
// import "types"
// data = from(bucket: "medicoes") |> range(start: -365d)
//   |> filter(fn: (r) => types.isType(v: r._value, type: "float") or types.isType(v: r._value, type: "int"))
// union(tables: [
//   data |> filter(fn: (r) => contains(value: r._field, set: ["Total_net_kWh", "Total_kVAh", "Total_kVAhr"]))
//        |> aggregateWindow(every: 1h, fn: last, createEmpty: false, timeSrc: "_start"),
//   data |> filter(fn: (r) => not contains(value: r._field, set: ["Total_net_kWh", "Total_kVAh", "Total_kVAhr"]))
//        |> aggregateWindow(every: 1h, fn: mean, createEmpty: false, timeSrc: "_start"),
// ]) |> to(bucket: "medicoes_1h")
