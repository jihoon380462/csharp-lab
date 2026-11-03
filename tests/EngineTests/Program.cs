using System.Text.Json;
using CsEngine;

// qa/cases.json의 케이스를 데스크톱 .NET에서 엔진에 넣어 보고 기대값과 비교한다.
var casesPath = args.Length > 0 ? args[0] : "qa/cases.json";
var cases = JsonDocument.Parse(File.ReadAllText(casesPath)).RootElement;
var realOut = Console.Out;
int pass = 0, fail = 0;

foreach (var c in cases.EnumerateArray())
{
    var id = c.GetProperty("id").GetString()!;
    var code = c.GetProperty("code").GetString()!;
    var stdin = c.TryGetProperty("stdin", out var si) ? si.GetString() : "";
    var json = await Engine.Run(code, stdin);
    Console.SetOut(realOut);
    var r = JsonDocument.Parse(json).RootElement;
    var problems = Check(c.GetProperty("expect"), r);
    if (problems.Count == 0) { pass++; realOut.WriteLine($"PASS {id} ({r.GetProperty("compileMs")}ms/{r.GetProperty("runMs")}ms)"); }
    else { fail++; realOut.WriteLine($"FAIL {id}: {string.Join("; ", problems)}\n     result: {json}"); }
}

realOut.WriteLine($"\n{pass} passed, {fail} failed");
return fail == 0 ? 0 : 1;

static List<string> Check(JsonElement e, JsonElement r)
{
    var p = new List<string>();
    var status = r.GetProperty("status").GetString();
    if (e.TryGetProperty("status", out var s) && s.GetString() != status) p.Add($"status {status} != {s.GetString()}");
    var stdout = r.GetProperty("stdout").GetString()!.Replace("\r\n", "\n");
    if (e.TryGetProperty("stdoutEquals", out var se) && se.GetString() != stdout) p.Add($"stdout {JsonSerializer.Serialize(stdout)} != {JsonSerializer.Serialize(se.GetString())}");
    var err = r.TryGetProperty("error", out var er) && er.ValueKind == JsonValueKind.Object ? er : (JsonElement?)null;
    if (e.TryGetProperty("errorType", out var et) && err?.GetProperty("type").GetString() != et.GetString()) p.Add($"errorType {err?.GetProperty("type").GetString()} != {et.GetString()}");
    if (e.TryGetProperty("errorLine", out var el))
    {
        var line = err is { } x && x.TryGetProperty("line", out var l) && l.ValueKind == JsonValueKind.Number ? l.GetInt32() : (int?)null;
        if (line != el.GetInt32()) p.Add($"errorLine {line?.ToString() ?? "없음"} != {el.GetInt32()}");
    }
    var diags = r.GetProperty("diagnostics").EnumerateArray().ToList();
    if (e.TryGetProperty("diagLines", out var dl))
    {
        var lines = diags.Where(d => d.GetProperty("severity").GetString() == "error").Select(d => d.GetProperty("line").GetInt32()).Distinct().OrderBy(x => x).ToList();
        var want = dl.EnumerateArray().Select(x => x.GetInt32()).ToList();
        if (!lines.SequenceEqual(want)) p.Add($"diagLines [{string.Join(",", lines)}] != [{string.Join(",", want)}]");
    }
    if (e.TryGetProperty("hasWarning", out var hw) && hw.GetBoolean() && !diags.Any(d => d.GetProperty("severity").GetString() == "warning")) p.Add("경고 없음");
    return p;
}
