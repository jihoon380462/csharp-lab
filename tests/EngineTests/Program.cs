using System.Text.Json;
using CsEngine;

// 데스크톱 .NET 에서 엔진을 검사한다.
//   1) qa/cases.json      — Engine.RunAsync (코드 하나)
//   2) qa/api-cases.json  — runFiles / grade / check / unity
// 사용: dotnet run --project tests/EngineTests -- [cases.json] [api-cases.json]
var casesPath = args.Length > 0 ? args[0] : "qa/cases.json";
var apiPath = args.Length > 1 ? args[1] : Path.Combine(Path.GetDirectoryName(casesPath) ?? ".", "api-cases.json");
var realOut = Console.Out;
int pass = 0, fail = 0;

void Report(string id, List<string> problems, string detail, string json)
{
    Console.SetOut(realOut);
    if (problems.Count == 0) { pass++; realOut.WriteLine($"PASS {id} ({detail})"); }
    else { fail++; realOut.WriteLine($"FAIL {id}: {string.Join("; ", problems)}\n     result: {(json.Length > 1500 ? json[..1500] : json)}"); }
}

foreach (var c in JsonDocument.Parse(File.ReadAllText(casesPath)).RootElement.EnumerateArray())
{
    var id = c.GetProperty("id").GetString()!;
    var stdin = c.TryGetProperty("stdin", out var si) ? si.GetString() : "";
    var r = await Engine.RunAsync(c.GetProperty("code").GetString()!, stdin);
    var json = Engine.ToJson(r);
    Report(id, Checks.Run(c.GetProperty("expect"), JsonDocument.Parse(json).RootElement), $"{r.CompileMs}ms/{r.RunMs}ms", json);
}

if (File.Exists(apiPath))
{
    foreach (var c in JsonDocument.Parse(File.ReadAllText(apiPath)).RootElement.EnumerateArray())
    {
        var id = c.GetProperty("id").GetString()!;
        var kind = c.GetProperty("kind").GetString();
        var e = c.GetProperty("expect");
        List<SourceFile> Files() => c.GetProperty("files").EnumerateArray()
            .Select(f => new SourceFile { Name = f.GetProperty("name").GetString()!, Code = f.GetProperty("code").GetString()! }).ToList();
        string json;
        List<string> problems;
        switch (kind)
        {
            case "runFiles":
                json = Engine.ToJson(await Engine.RunFilesAsync(Files(), c.TryGetProperty("stdin", out var s2) ? s2.GetString() : ""));
                problems = Checks.Run(e, JsonDocument.Parse(json).RootElement);
                break;
            case "grade":
                var tests = c.GetProperty("tests").EnumerateArray().Select(t => new TestCase
                {
                    Stdin = t.TryGetProperty("stdin", out var ts) ? ts.GetString() : null,
                    Expect = t.TryGetProperty("expect", out var te) ? te.GetString() : null,
                }).ToList();
                json = Engine.ToJson(await Engine.GradeAsync(Files(), tests));
                problems = Checks.Grade(e, JsonDocument.Parse(json).RootElement);
                break;
            case "check":
                json = Engine.ToJson(Engine.Check(Files(), c.TryGetProperty("mode", out var m) ? m.GetString() : "console"));
                problems = Checks.Diags(e, JsonDocument.Parse(json).RootElement, errorsOnly: true);
                break;
            case "unity":
                var o = c.GetProperty("options");
                var opts = new UnityOptions
                {
                    Frames = o.TryGetProperty("frames", out var fr) ? fr.GetInt32() : 60,
                    InputScript = o.TryGetProperty("inputScript", out var isc) ? isc.GetString() : null,
                };
                json = Engine.ToJson(await Engine.RunUnityAsync(c.GetProperty("code").GetString()!, opts));
                problems = Checks.Run(e, JsonDocument.Parse(json).RootElement);
                break;
            default:
                json = "";
                problems = new() { "알 수 없는 kind: " + kind };
                break;
        }
        Report(id, problems, kind!, json);
    }
}

realOut.WriteLine($"\n{pass} passed, {fail} failed");
return fail == 0 ? 0 : 1;

static class Checks
{
    static string? Str(JsonElement o, string p) => o.ValueKind == JsonValueKind.Object && o.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    static int? Int(JsonElement o, string p) => o.ValueKind == JsonValueKind.Object && o.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : null;

    public static List<string> Run(JsonElement e, JsonElement r)
    {
        var p = new List<string>();
        var status = Str(r, "status");
        if (e.TryGetProperty("status", out var s) && s.GetString() != status) p.Add($"status {status} != {s.GetString()}");
        var stdout = (Str(r, "stdout") ?? "").Replace("\r\n", "\n");
        if (e.TryGetProperty("stdoutEquals", out var se) && se.GetString() != stdout) p.Add($"stdout {JsonSerializer.Serialize(stdout)} != {JsonSerializer.Serialize(se.GetString())}");
        var err = r.TryGetProperty("error", out var er) ? er : default;
        if (e.TryGetProperty("errorType", out var et) && Str(err, "type") != et.GetString()) p.Add($"errorType {Str(err, "type")} != {et.GetString()}");
        if (e.TryGetProperty("errorLine", out var el) && Int(err, "line") != el.GetInt32()) p.Add($"errorLine {Int(err, "line")?.ToString() ?? "없음"} != {el.GetInt32()}");
        if (e.TryGetProperty("errorFile", out var ef) && Str(err, "file") != ef.GetString()) p.Add($"errorFile {Str(err, "file")} != {ef.GetString()}");
        p.AddRange(Diags(e, r, errorsOnly: true));
        if (e.TryGetProperty("hasWarning", out var hw) && hw.GetBoolean() && !r.GetProperty("diagnostics").EnumerateArray().Any(d => d.GetProperty("severity").GetString() == "warning")) p.Add("경고 없음");
        return p;
    }

    public static List<string> Diags(JsonElement e, JsonElement r, bool errorsOnly)
    {
        var p = new List<string>();
        var diags = r.GetProperty("diagnostics").EnumerateArray().Where(d => !errorsOnly || d.GetProperty("severity").GetString() == "error").ToList();
        if (e.TryGetProperty("diagLines", out var dl))
        {
            var lines = diags.Select(d => d.GetProperty("line").GetInt32()).Distinct().OrderBy(x => x).ToList();
            var want = dl.EnumerateArray().Select(x => x.GetInt32()).ToList();
            if (!lines.SequenceEqual(want)) p.Add($"diagLines [{string.Join(",", lines)}] != [{string.Join(",", want)}]");
        }
        if (e.TryGetProperty("diagFiles", out var df))
        {
            var files = diags.Select(d => d.GetProperty("file").GetString()).Distinct().OrderBy(x => x).ToList();
            var want = df.EnumerateArray().Select(x => x.GetString()).ToList();
            if (!files.SequenceEqual(want)) p.Add($"diagFiles [{string.Join(",", files)}] != [{string.Join(",", want)}]");
        }
        if (e.TryGetProperty("diagIds", out var di))
        {
            var ids = diags.Select(d => d.GetProperty("id").GetString()).ToHashSet();
            foreach (var w in di.EnumerateArray()) if (!ids.Contains(w.GetString())) p.Add($"진단 {w.GetString()} 없음 (있는 것: {string.Join(",", ids)})");
        }
        return p;
    }

    public static List<string> Grade(JsonElement e, JsonElement r)
    {
        var p = new List<string>();
        if (e.TryGetProperty("status", out var s) && s.GetString() != Str(r, "status")) p.Add($"status {Str(r, "status")} != {s.GetString()}");
        var tests = r.GetProperty("tests").EnumerateArray().ToList();
        if (e.TryGetProperty("passed", out var pa))
        {
            var got = tests.Select(t => t.GetProperty("passed").ValueKind switch { JsonValueKind.True => "true", JsonValueKind.False => "false", _ => "null" }).ToList();
            var want = pa.EnumerateArray().Select(x => x.ValueKind switch { JsonValueKind.True => "true", JsonValueKind.False => "false", _ => "null" }).ToList();
            if (!got.SequenceEqual(want)) p.Add($"passed [{string.Join(",", got)}] != [{string.Join(",", want)}]");
        }
        if (e.TryGetProperty("stdouts", out var so))
        {
            var got = tests.Select(t => t.GetProperty("stdout").GetString()!.Replace("\r\n", "\n")).ToList();
            var want = so.EnumerateArray().Select(x => x.GetString()!).ToList();
            if (!got.SequenceEqual(want)) p.Add($"stdouts {JsonSerializer.Serialize(got)} != {JsonSerializer.Serialize(want)}");
        }
        if (e.TryGetProperty("testStatuses", out var ts))
        {
            var got = tests.Select(t => t.GetProperty("status").GetString()).ToList();
            var want = ts.EnumerateArray().Select(x => x.GetString()).ToList();
            if (!got.SequenceEqual(want)) p.Add($"testStatuses [{string.Join(",", got)}] != [{string.Join(",", want)}]");
        }
        if (e.TryGetProperty("passedCount", out var pc) && Int(r, "passed") != pc.GetInt32()) p.Add($"passedCount {Int(r, "passed")} != {pc.GetInt32()}");
        p.AddRange(Diags(e, r, errorsOnly: true));
        return p;
    }
}
