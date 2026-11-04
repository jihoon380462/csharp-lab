using System.Text.Json;
using CsEngine;

// 데스크톱 .NET 에서 엔진을 검사한다.
//   1) qa/cases.json      — Engine.RunAsync (코드 하나)
//   2) qa/api-cases.json  — runFiles / grade / check / unity / analyze
//   3) engine/wwwroot/labs/patterns/patterns.json — 디자인 패턴: 출력 + 구조 규칙 전부 통과
// 사용: dotnet run --project tests/EngineTests -- [cases.json] [api-cases.json] [patterns.json]
var casesPath = args.Length > 0 ? args[0] : "qa/cases.json";
var apiPath = args.Length > 1 ? args[1] : Path.Combine(Path.GetDirectoryName(casesPath) ?? ".", "api-cases.json");
var patternsPath = args.Length > 2 ? args[2] : "engine/wwwroot/labs/patterns/patterns.json";
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
            case "analyze":
                var rules = c.TryGetProperty("rules", out var ru) ? JsonSerializer.Deserialize(ru.GetRawText(), LabJson.Default.ListStructureRule) : null;
                json = Engine.ToJson(Engine.Analyze(Files(), rules, c.TryGetProperty("mode", out var am) ? am.GetString() : "console"));
                problems = Checks.Analyze(e, JsonDocument.Parse(json).RootElement);
                break;
            default:
                json = "";
                problems = new() { "알 수 없는 kind: " + kind };
                break;
        }
        Report(id, problems, kind!, json);
    }
}

if (File.Exists(patternsPath))
{
    foreach (var pt in JsonDocument.Parse(File.ReadAllText(patternsPath)).RootElement.EnumerateArray())
    {
        var id = "pattern:" + pt.GetProperty("id").GetString();
        var code = pt.GetProperty("code").GetString()!;
        var problems = new List<string>();
        var run = await Engine.RunAsync(code, "");
        if (run.Status != "ok") problems.Add($"실행 status {run.Status}");
        if (run.Stdout.Replace("\r\n", "\n") != pt.GetProperty("expect").GetString()) problems.Add($"stdout {JsonSerializer.Serialize(run.Stdout)}");
        var rules = JsonSerializer.Deserialize(pt.GetProperty("rules").GetRawText(), LabJson.Default.ListStructureRule) ?? new();
        var an = Engine.Analyze(new[] { new SourceFile { Name = "Program.cs", Code = code } }, rules);
        if (an.Status != "ok") problems.Add($"분석 status {an.Status}");
        foreach (var rr in an.Rules.Where(x => !x.Passed)) problems.Add($"규칙 실패: {rr.Text} ({rr.Detail})");
        Report(id, problems, $"규칙 {an.RulesPassed}/{an.RulesTotal}, {an.Ms}ms", Engine.ToJson(an));
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

    public static List<string> Analyze(JsonElement e, JsonElement r)
    {
        var p = new List<string>();
        if (e.TryGetProperty("status", out var s) && s.GetString() != Str(r, "status")) p.Add($"status {Str(r, "status")} != {s.GetString()}");
        var types = r.GetProperty("types").EnumerateArray().ToList();
        var names = types.Select(t => t.GetProperty("name").GetString()!).ToList();
        JsonElement T(string n) => types.First(t => t.GetProperty("name").GetString() == n);
        if (e.TryGetProperty("typesExact", out var te))
        {
            var want = te.EnumerateArray().Select(x => x.GetString()!).OrderBy(x => x, StringComparer.Ordinal).ToList();
            var got = names.OrderBy(x => x, StringComparer.Ordinal).ToList();
            if (!got.SequenceEqual(want)) p.Add($"types [{string.Join(",", got)}] != [{string.Join(",", want)}]");
        }
        var rels = r.GetProperty("relations").EnumerateArray()
            .Select(x => (x.GetProperty("from").GetString(), x.GetProperty("kind").GetString(), x.GetProperty("to").GetString(), x.GetProperty("many").GetBoolean())).ToList();
        if (e.TryGetProperty("relations", out var re))
            foreach (var w in re.EnumerateArray())
            {
                var (f, k, t) = (w[0].GetString(), w[1].GetString(), w[2].GetString());
                if (!rels.Any(x => x.Item1 == f && x.Item2 == k && x.Item3 == t)) p.Add($"관계 없음 {f} {k} {t}");
            }
        if (e.TryGetProperty("noRelations", out var nr))
            foreach (var w in nr.EnumerateArray())
            {
                var (f, k, t) = (w[0].GetString(), w[1].GetString(), w[2].GetString());
                if (rels.Any(x => x.Item1 == f && x.Item2 == k && x.Item3 == t)) p.Add($"있으면 안 되는 관계 {f} {k} {t}");
            }
        if (e.TryGetProperty("many", out var mn))
            foreach (var w in mn.EnumerateArray())
                if (!rels.Any(x => x.Item1 == w[0].GetString() && x.Item3 == w[1].GetString() && x.Item4)) p.Add($"many 아님 {w[0]} → {w[1]}");
        if (e.TryGetProperty("rulesPassed", out var rp) && Int(r, "rulesPassed") != rp.GetInt32()) p.Add($"rulesPassed {Int(r, "rulesPassed")} != {rp.GetInt32()}");
        if (e.TryGetProperty("features", out var fe))
            foreach (var kv in fe.EnumerateObject())
            {
                var got = r.GetProperty("features").TryGetProperty(kv.Name, out var g) ? g.GetInt32() : 0;
                if (got != kv.Value.GetInt32()) p.Add($"features.{kv.Name} {got} != {kv.Value.GetInt32()}");
            }
        if (e.TryGetProperty("calls", out var ca))
            foreach (var kv in ca.EnumerateObject())
            {
                var got = r.GetProperty("calls").TryGetProperty(kv.Name, out var g) ? g.GetInt32() : 0;
                if (got != kv.Value.GetInt32()) p.Add($"calls.{kv.Name} {got} != {kv.Value.GetInt32()}");
            }
        if (e.TryGetProperty("members", out var me))
            foreach (var kv in me.EnumerateObject())
            {
                if (!names.Contains(kv.Name)) { p.Add($"타입 없음 {kv.Name}"); continue; }
                var ms = T(kv.Name).GetProperty("members").EnumerateArray().Select(m => m.GetProperty("name").GetString()).ToHashSet();
                foreach (var w in kv.Value.EnumerateArray()) if (!ms.Contains(w.GetString())) p.Add($"{kv.Name} 에 멤버 {w.GetString()} 없음 (있는 것: {string.Join(",", ms)})");
            }
        if (e.TryGetProperty("kinds", out var ki))
            foreach (var kv in ki.EnumerateObject())
                if (!names.Contains(kv.Name) || T(kv.Name).GetProperty("kind").GetString() != kv.Value.GetString()) p.Add($"kind {kv.Name} != {kv.Value.GetString()}");
        if (e.TryGetProperty("abstract", out var ab))
            foreach (var w in ab.EnumerateArray())
                if (!names.Contains(w.GetString()!) || !T(w.GetString()!).GetProperty("isAbstract").GetBoolean()) p.Add($"추상 아님 {w.GetString()}");
        if (e.TryGetProperty("baseTypes", out var bt))
            foreach (var kv in bt.EnumerateObject())
                if (!names.Contains(kv.Name) || Str(T(kv.Name), "baseType") != kv.Value.GetString()) p.Add($"baseType {kv.Name} != {kv.Value.GetString()}");
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
