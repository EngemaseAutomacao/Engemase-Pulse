import { describe, expect, it } from "vitest";
import { FluxQueryError, parseAnnotatedCsv, splitCsvLine } from "./csv";

describe("parseAnnotatedCsv", () => {
  it("lê várias tabelas com tipos e ignora colunas internas", () => {
    const csv = [
      "#datatype,string,long,dateTime:RFC3339,double,string,string",
      ",result,table,_time,_value,_field,_measurement",
      ",_result,0,2026-10-13T12:00:00Z,220.5,V1N,medidor_01",
      "",
      "#datatype,string,long,dateTime:RFC3339,long,string,string",
      ",result,table,_time,_value,_field,_measurement",
      ",_result,1,2026-10-13T12:00:05Z,42,Partidas,medidor_01",
      "",
    ].join("\r\n");

    expect(parseAnnotatedCsv(csv)).toEqual([
      { _time: "2026-10-13T12:00:00Z", _value: 220.5, _field: "V1N", _measurement: "medidor_01" },
      { _time: "2026-10-13T12:00:05Z", _value: 42, _field: "Partidas", _measurement: "medidor_01" },
    ]);
  });

  it("converte vazio em null e boolean em true/false", () => {
    const csv = ["#datatype,string,long,double,boolean", ",result,table,_value,ok", ",,0,,true"].join("\n");
    expect(parseAnnotatedCsv(csv)).toEqual([{ _value: null, ok: true }]);
  });

  it("sem anotação de tipo, reconhece números e mantém texto", () => {
    const csv = [",result,table,_value,_field", ",_result,0,12.5,I1", ",_result,0,abc,nome"].join("\n");
    expect(parseAnnotatedCsv(csv)).toEqual([
      { _value: 12.5, _field: "I1" },
      { _value: "abc", _field: "nome" },
    ]);
  });

  it("lança FluxQueryError quando o InfluxDB devolve uma tabela de erro", () => {
    const csv = ["#datatype,string,string", ",error,reference", ',"bucket ""x"" not found",897'].join("\n");
    expect(() => parseAnnotatedCsv(csv)).toThrow(FluxQueryError);
    expect(() => parseAnnotatedCsv(csv)).toThrow('bucket "x" not found');
  });
});

describe("splitCsvLine", () => {
  it("respeita aspas e aspas escapadas", () => {
    expect(splitCsvLine('a,"b,c","d ""e"""')).toEqual(["a", "b,c", 'd "e"']);
  });
});
