using System.Collections.Immutable;
using System.Diagnostics;
using System.Globalization;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;
using System.Text.Json.Serialization;

namespace CsEngine;

/// <summary>
/// C# 코드를 컴파일(Roslyn)하고 같은 프로세스 안에서 실행하는 엔진.
/// Core 폴더는 플랫폼과 무관하다: 브라우저에서는 Browser/Exports.cs(JSExport)가 Web Worker 안에서 부르고,
/// 데스크톱 .NET(tests/EngineTests 등)에서는 Engine.RunAsync 를 직접 부른다. 사용법은 docs/REFERENCE.md 3절.
/// </summary>
public static partial class Engine
{
    public const string EngineVersion = "0.4.0";
    public const int TimeLimitMs = 10000;
    public const int MaxDepth = 2000;
    public const int MaxOutputChars = 100_000;

    // 콘솔 앱 기본(ImplicitUsings)과 같은 using 목록
    const string GlobalUsingsSource = """
        global using System;
        global using System.Collections.Generic;
        global using System.IO;
        global using System.Linq;
        global using System.Text;
        global using System.Threading;
        global using System.Threading.Tasks;
        """;

    // 무한 반복/무한 재귀 보호용. 학습자 코드의 반복문·메서드에 호출이 자동 삽입된다.
    const string GuardSource = """
        internal static class __LabGuard
        {
            public static long Deadline;
            public static int MaxDepth;
            static int _depth;
            static long _count;
            static bool _tripped;
            static int _reason;

            public static void Tick()
            {
                if (_tripped) Trip(_reason);
                if ((++_count & 255) == 0 && System.Environment.TickCount64 > Deadline) Trip(1);
            }
            public static void Enter()
            {
                if (_tripped) Trip(_reason);
                if (++_depth > MaxDepth) { _depth = 0; Trip(2); }
                if ((++_count & 255) == 0 && System.Environment.TickCount64 > Deadline) Trip(1);
            }
            public static void Exit() { if (_depth > 0) _depth--; }

            static void Trip(int reason)
            {
                _tripped = true; _reason = reason;
                throw new System.OperationCanceledException(reason == 1 ? "__LAB_TIMEOUT__" : "__LAB_DEPTH__");
            }
        }
        """;

    static readonly CSharpParseOptions ParseOptions = new(LanguageVersion.CSharp13);
    static readonly SyntaxTree GlobalUsingsTree = CSharpSyntaxTree.ParseText(WithChecksum(GlobalUsingsSource, "GlobalUsings.cs"), ParseOptions, "GlobalUsings.cs", Encoding.UTF8);
    // Unity 스크립트와 같게: UnityEngine 만 기본. (System 을 기본으로 넣으면 Random·Object·Debug 가 겹친다 — 실제 Unity 와 같은 상황)
    const string UnityUsingsSource = """
        global using UnityEngine;
        global using System.Collections.Generic;
        global using System.Linq;
        """;
    static readonly SyntaxTree UnityUsingsTree = CSharpSyntaxTree.ParseText(WithChecksum(UnityUsingsSource, "UnityUsings.cs"), ParseOptions, "UnityUsings.cs", Encoding.UTF8);
    static readonly SyntaxTree GuardTree = CSharpSyntaxTree.ParseText(WithChecksum(GuardSource, "Guard.cs"), ParseOptions, "Guard.cs", Encoding.UTF8);

    /// <summary>
    /// 파일 끝에 #pragma checksum을 붙인다. 없으면 Roslyn이 디버그 정보용 체크섬을 Task.Run으로 계산하고
    /// .Result로 기다리는데, 브라우저(단일 스레드)에서는 이 대기가 가끔 실패한다(PlatformNotSupported).
    /// 끝에 붙이므로 학습자 코드의 줄 번호는 바뀌지 않는다.
    /// </summary>
    static string WithChecksum(string source, string path) =>
        source + "\n#pragma checksum \"" + path + "\" \"{ff1816ec-aa5e-4d10-87f7-6f4963833460}\" \"0000000000000000000000000000000000000000\"\n";
    static readonly CultureInfo Korean = MakeKorean();
    static IReadOnlyList<MetadataReference>? _references;


    static CultureInfo MakeKorean()
    {
        try { return new CultureInfo("ko"); } catch { return CultureInfo.InvariantCulture; }
    }

    /// <summary>엔진에 포함된 참조 어셈블리(labref.*.dll, LabRefs.props 참고)</summary>
    static IReadOnlyList<MetadataReference> References => _references ??= LoadReferences();

    static List<MetadataReference> LoadReferences()
    {
        var asm = typeof(Engine).Assembly;
        var list = new List<MetadataReference>();
        foreach (var name in asm.GetManifestResourceNames().Where(n => n.StartsWith("labref.", StringComparison.Ordinal)))
        {
            using var s = asm.GetManifestResourceStream(name)!;
            list.Add(MetadataReference.CreateFromStream(s, filePath: name["labref.".Length..]));
        }
        if (list.Count == 0) throw new InvalidOperationException("참조 어셈블리가 엔진에 없습니다.");
        return list;
    }

    /// <summary>실행 중 출력을 조금씩 바깥(화면)으로 보내는 통로. 브라우저에서 설정한다.</summary>
    public static Action<string>? OutputSink { get; set; }

    /// <summary>Unity 모드 실시간 입력(눌린 키 이름을 쉼표로). 브라우저에서 설정한다.</summary>
    public static Func<string>? UnityInputProvider { get; set; }

    /// <summary>Unity 모드 프레임마다 장면 상태(UnityLite 형식 문자열)를 받는 곳. 브라우저에서 설정한다.</summary>
    public static Action<string>? UnityFrameSink { get; set; }

    public static string GetVersion() => EngineVersion;

    /// <summary>첫 컴파일이 느리므로 페이지 로딩 직후 미리 한 번 돌려 둔다.</summary>
    public static async Task<string> Warmup()
    {
        var sw = Stopwatch.StartNew();
        await Run("int x = 1 + 2; for (int i = 0; i < 3; i++) x += i; System.Console.Write(x);", "");
        return sw.ElapsedMilliseconds.ToString(CultureInfo.InvariantCulture);
    }

    // ───────────────────────── 공개 API ─────────────────────────

    /// <summary>코드를 컴파일·실행하고 결과를 JSON 문자열(camelCase)로 돌려준다. 브라우저 쪽이 쓰는 형태.</summary>
    public static async Task<string> Run(string code, string? stdin) =>
        ToJson(await RunAsync(code, stdin));

    /// <summary>결과 객체를 JSON 문자열로 (브라우저로 보내는 것과 같은 모양).</summary>
    public static string ToJson(RunResult result) => JsonSerializer.Serialize(result, LabJson.Default.RunResult);
    public static string ToJson(GradeResult result) => JsonSerializer.Serialize(result, LabJson.Default.GradeResult);
    public static string ToJson(CheckResult result) => JsonSerializer.Serialize(result, LabJson.Default.CheckResult);
    public static string ToJson(AnalyzeResult result) => JsonSerializer.Serialize(result, LabJson.Default.AnalyzeResult);

    /// <summary>코드(파일 하나, 이름 Program.cs)를 컴파일·실행하고 결과 객체를 돌려준다.</summary>
    public static Task<RunResult> RunAsync(string code, string? stdin = "") =>
        RunFilesAsync(new[] { new SourceFile { Name = "Program.cs", Code = code ?? "" } }, stdin);

    /// <summary>여러 파일을 함께 컴파일·실행한다 (최상위 문장·Main 은 한 파일에만).</summary>
    public static Task<RunResult> RunFilesAsync(IReadOnlyList<SourceFile> files, string? stdin = "") =>
        RunWith(files, stdin ?? "", Mode.Console, null);

    /// <summary>Unity 모드: UnityLite(UnityEngine 흉내 라이브러리)와 함께 컴파일해 프레임 루프를 돌린다.</summary>
    public static Task<RunResult> RunUnityAsync(string code, UnityOptions? options = null) =>
        RunWith(new[] { new SourceFile { Name = "Program.cs", Code = code ?? "" } }, "", Mode.Unity, options ?? new UnityOptions { Frames = 60 });

    /// <summary>채점: 컴파일은 한 번, 테스트마다 어셈블리를 새로 올려(정적 변수 초기화) 실행하고 출력을 비교한다.</summary>
    public static async Task<GradeResult> GradeAsync(IReadOnlyList<SourceFile> files, IReadOnlyList<TestCase> tests)
    {
        var grade = new GradeResult { Total = tests.Count };
        var total = Stopwatch.StartNew();
        try
        {
            var scratch = new RunResult();
            var compiled = await CompileAsync(files, Mode.Console, scratch);
            grade.Diagnostics = scratch.Diagnostics;
            grade.CompileMs = scratch.CompileMs;
            if (scratch.Status is "compile-error" or "internal-error")
            {
                grade.Status = scratch.Status;
                grade.Error = scratch.Error;
                grade.TotalMs = total.ElapsedMilliseconds;
                return grade;
            }
            grade.Status = "ok";
            foreach (var t in tests)
            {
                var r = new RunResult { Status = "ok" };
                if (compiled is not null) await ExecuteAsync(compiled, t.Stdin ?? "", r, null);
                var tr = new TestResult { Status = r.Status, Stdout = r.Stdout, OutputTruncated = r.OutputTruncated, Error = r.Error, RunMs = r.RunMs };
                if (t.Expect is not null) tr.Passed = r.Status == "ok" && NormalizeOutput(r.Stdout) == NormalizeOutput(t.Expect);
                if (tr.Passed == true) grade.Passed++;
                grade.Tests.Add(tr);
            }
        }
        catch (Exception ex)
        {
            grade.Status = "internal-error";
            grade.Error = InternalError(ex);
        }
        grade.TotalMs = total.ElapsedMilliseconds;
        return grade;
    }

    /// <summary>실행하지 않고 진단(오류·경고)만. mode: "console" | "unity".</summary>
    public static CheckResult Check(IReadOnlyList<SourceFile> files, string? mode = "console")
    {
        var sw = Stopwatch.StartNew();
        var m = mode == "unity" ? Mode.Unity : Mode.Console;
        var all = WithLibraries(files, m);
        var trees = all.Select(f => Parse(f)).ToList();
        var diags = CollectDiagnostics(MakeCompilation(m, trees.Append(GuardTree)), trees, all, m);
        return new CheckResult { Diagnostics = diags, Ms = sw.ElapsedMilliseconds };
    }

    /// <summary>출력 비교용 정리: \r\n → \n, 줄 끝 공백 제거, 끝의 빈 줄 제거.</summary>
    public static string NormalizeOutput(string s)
    {
        var lines = (s ?? "").Replace("\r\n", "\n").Split('\n').Select(l => l.TrimEnd()).ToList();
        while (lines.Count > 0 && lines[^1].Length == 0) lines.RemoveAt(lines.Count - 1);
        return string.Join("\n", lines);
    }

    // ───────────────────────── 내부 ─────────────────────────

    enum Mode { Console, Unity }

    /// <summary>컴파일 결과 (PE + PDB). 실행할 때마다 새로 Assembly.Load 한다.</summary>
    sealed class Compiled
    {
        public byte[] Pe = Array.Empty<byte>();
        public byte[] Pdb = Array.Empty<byte>();
        public HashSet<string> UserFiles = new();
        public Mode Mode;
    }

    static ErrorInfo InternalError(Exception ex)
    {
        var detail = ex.ToString();
        return new ErrorInfo { Type = ex.GetType().Name, Message = detail.Length > 1500 ? detail[..1500] : detail, Friendly = "엔진 내부 오류가 났습니다. 이 화면을 캡처해 알려주세요." };
    }

    static async Task<RunResult> RunWith(IReadOnlyList<SourceFile> files, string stdin, Mode mode, UnityOptions? unity)
    {
        var result = new RunResult();
        var total = Stopwatch.StartNew();
        try
        {
            var compiled = await CompileAsync(files, mode, result);
            if (compiled is not null) await ExecuteAsync(compiled, stdin, result, unity);
        }
        catch (Exception ex)
        {
            result.Status = "internal-error";
            result.Error = InternalError(ex);
        }
        result.TotalMs = total.ElapsedMilliseconds;
        return result;
    }

    const string UnityLibName = "UnityLite.cs";
    static string? _unityLiteSource;
    static string UnityLiteSource => _unityLiteSource ??= LoadText("lib.UnityLite.cs");

    static string LoadText(string resource)
    {
        using var s = typeof(Engine).Assembly.GetManifestResourceStream(resource)
            ?? throw new InvalidOperationException("엔진 리소스 없음: " + resource);
        using var r = new StreamReader(s, Encoding.UTF8);
        return r.ReadToEnd();
    }

    /// <summary>모드에 따라 라이브러리 파일(UnityLite.cs)을 덧붙인다.</summary>
    static List<SourceFile> WithLibraries(IReadOnlyList<SourceFile> files, Mode mode)
    {
        var all = files.Select(f => new SourceFile { Name = string.IsNullOrWhiteSpace(f.Name) ? "Program.cs" : f.Name, Code = f.Code ?? "" }).ToList();
        if (mode == Mode.Unity) all.Add(new SourceFile { Name = UnityLibName, Code = UnityLiteSource });
        return all;
    }

    static SyntaxTree? _unityTree, _unityGuardedTree;

    /// <summary>파싱. UnityLite 는 매번 같으므로 한 번만 파싱해 둔다.</summary>
    static SyntaxTree Parse(SourceFile f) =>
        f.Name == UnityLibName
            ? _unityTree ??= CSharpSyntaxTree.ParseText(WithChecksum(f.Code, f.Name), ParseOptions, f.Name, Encoding.UTF8)
            : CSharpSyntaxTree.ParseText(WithChecksum(f.Code, f.Name), ParseOptions, f.Name, Encoding.UTF8);

    static SyntaxTree Guarded(SyntaxTree t)
    {
        if (t.FilePath == UnityLibName && _unityGuardedTree is not null) return _unityGuardedTree;
        var g = CSharpSyntaxTree.Create((Microsoft.CodeAnalysis.CSharp.CSharpSyntaxNode)new GuardRewriter().Visit(t.GetRoot()), ParseOptions, t.FilePath, Encoding.UTF8);
        if (t.FilePath == UnityLibName) _unityGuardedTree = g;
        return g;
    }

    /// <summary>
    /// 진단 모으기. 학습자 파일은 오류+경고, 라이브러리 파일(UnityLite.cs)은 오류만, 내부 파일(GlobalUsings/Guard)은 숨김.
    /// 오류 먼저, 파일 순서, 위치 순. 최대 30개. 파일 끝을 넘는 줄은 마지막 줄로.
    /// </summary>
    static List<DiagnosticInfo> CollectDiagnostics(CSharpCompilation compilation, List<SyntaxTree> trees, List<SourceFile> files, Mode mode)
    {
        var order = trees.Select((t, i) => (t, i)).ToDictionary(x => x.t, x => x.i);
        var lineCounts = files.ToDictionary(f => f.Name, f => f.Code.Split('\n').Length);
        var list = compilation.GetDiagnostics()
            .Where(d => d.Severity is DiagnosticSeverity.Error or DiagnosticSeverity.Warning)
            .Where(d =>
            {
                if (d.Location == Location.None) return d.Severity == DiagnosticSeverity.Error;
                var tree = d.Location.SourceTree;
                if (tree is null || !order.ContainsKey(tree)) return false;
                if (tree.FilePath == UnityLibName) return d.Severity == DiagnosticSeverity.Error;
                return true;
            })
            .OrderBy(d => d.Severity == DiagnosticSeverity.Error ? 0 : 1)
            .ThenBy(d => d.Location.SourceTree is { } t && order.TryGetValue(t, out var i) ? i : -1)
            .ThenBy(d => d.Location.SourceSpan.Start)
            .Take(30)
            .Select(ToInfo)
            .ToList();

        // Unity 모드: 학습자 파일에 최상위 문장이 있으면 프레임 루프(Main)가 실행되지 않으므로 오류로 알린다
        if (mode == Mode.Unity)
        {
            foreach (var t in trees.Where(t => t.FilePath != UnityLibName))
            {
                var g = ((Microsoft.CodeAnalysis.CSharp.Syntax.CompilationUnitSyntax)t.GetRoot()).Members
                    .OfType<Microsoft.CodeAnalysis.CSharp.Syntax.GlobalStatementSyntax>().FirstOrDefault();
                if (g is null) continue;
                var ls = g.GetLocation().GetLineSpan();
                list.Insert(0, new DiagnosticInfo
                {
                    Severity = "error", Id = "LAB002", File = t.FilePath,
                    Line = ls.StartLinePosition.Line + 1, Column = ls.StartLinePosition.Character + 1,
                    EndLine = ls.EndLinePosition.Line + 1, EndColumn = ls.EndLinePosition.Character + 1,
                    Message = "Unity 모드에서는 코드를 클래스(MonoBehaviour) 안에만 씁니다. 클래스 밖의 문장은 실행되지 않아요.",
                });
            }
        }

        foreach (var d in list)
        {
            if (!lineCounts.TryGetValue(d.File, out var n)) continue;
            if (d.Line > n) d.Line = n;
            if (d.EndLine > n) d.EndLine = n;
        }
        return list;
    }

    /// <summary>컴파일. 오류면 result 에 기록하고 null. 빈 코드면 Status=ok 로 null.</summary>
    static async Task<Compiled?> CompileAsync(IReadOnlyList<SourceFile> files, Mode mode, RunResult result)
    {
        var sw = Stopwatch.StartNew();
        var all = WithLibraries(files, mode);
        var trees = all.Select(Parse).ToList();

        var userTrees = trees.Where(t => t.FilePath != UnityLibName).ToList();
        if (mode == Mode.Console
            && userTrees.All(t => ((Microsoft.CodeAnalysis.CSharp.Syntax.CompilationUnitSyntax)t.GetRoot()).Members.Count == 0)
            && !userTrees.Any(t => t.GetDiagnostics().Any(d => d.Severity == DiagnosticSeverity.Error)))
        {
            // 빈 코드(또는 주석·using만 있는 코드): 실행할 것이 없을 뿐 오류는 아님
            result.Status = "ok";
            return null;
        }

        // ── 1) 원본 코드로 컴파일 검사 (줄 번호가 원본과 정확히 일치하도록) ──
        result.Diagnostics = CollectDiagnostics(MakeCompilation(mode, trees.Append(GuardTree)), trees, all, mode);
        if (result.Diagnostics.Any(d => d.Severity == "error"))
        {
            result.CompileMs = sw.ElapsedMilliseconds;
            result.Status = "compile-error";
            return null;
        }

        // ── 2) 보호 코드를 끼워 넣은 버전으로 실제 빌드 ──
        var guardedTrees = trees.Select(Guarded).ToList();

        // 브라우저(단일 스레드)에서 Roslyn이 내부 Task.Run 결과를 기다리다 실패하는 경우가 있어,
        // 직전 작업의 남은 대기열을 비우고(한 번 양보) 빌드하며, 실패하면 한 번 더 시도한다. (docs/PITFALLS.md 3)
        await Task.Delay(1);
        var peStream = new MemoryStream();
        var pdbStream = new MemoryStream();
        EmitResult emit;
        try
        {
            emit = MakeCompilation(mode, guardedTrees.Append(GuardTree)).Emit(peStream, pdbStream, options: new EmitOptions(debugInformationFormat: DebugInformationFormat.PortablePdb));
        }
        catch (PlatformNotSupportedException)
        {
            await Task.Delay(1);
            peStream = new MemoryStream();
            pdbStream = new MemoryStream();
            emit = MakeCompilation(mode, guardedTrees.Append(GuardTree)).Emit(peStream, pdbStream, options: new EmitOptions(debugInformationFormat: DebugInformationFormat.PortablePdb));
            result.EmitRetried = true;
        }
        result.CompileMs = sw.ElapsedMilliseconds;
        if (!emit.Success)
        {
            result.Status = "internal-error";
            result.Diagnostics = emit.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error).Take(10).Select(ToInfo).ToList();
            result.Error = new ErrorInfo { Type = "EmitFailed", Message = "보호 코드 삽입 후 빌드 실패", Friendly = "엔진 내부 오류가 났습니다. 이 코드와 화면을 알려주세요." };
            return null;
        }
        return new Compiled
        {
            Pe = peStream.ToArray(),
            Pdb = pdbStream.ToArray(),
            UserFiles = all.Select(f => f.Name).Where(n => n != UnityLibName).ToHashSet(),
            Mode = mode,
        };
    }

    /// <summary>컴파일 결과를 새로 올려 한 번 실행한다 (정적 변수는 매번 새로).</summary>
    static async Task ExecuteAsync(Compiled c, string stdin, RunResult result, UnityOptions? unity)
    {
        var assembly = Assembly.Load(c.Pe, c.Pdb);
        var guardType = assembly.GetType("__LabGuard")!;
        guardType.GetField("MaxDepth")!.SetValue(null, MaxDepth);
        guardType.GetField("Deadline")!.SetValue(null, Environment.TickCount64 + TimeLimitMs);

        if (c.Mode == Mode.Unity)
        {
            var host = assembly.GetType("UnityLiteHost") ?? throw new InvalidOperationException("UnityLiteHost 없음");
            var u = unity ?? new UnityOptions { Frames = 60 };
            int frames = u.Live ? Math.Max(0, u.Frames) : Math.Clamp(u.Frames <= 0 ? 60 : u.Frames, 1, 20000);
            host.GetField("Frames")!.SetValue(null, frames);
            host.GetField("Live")!.SetValue(null, u.Live);
            host.GetField("FixedDelta")!.SetValue(null, u.FixedDelta > 0 ? u.FixedDelta : 1f / 60f);
            host.GetField("InputScript")!.SetValue(null, u.InputScript);
            host.GetField("Seed")!.SetValue(null, u.Seed);
            host.GetField("InputProvider")!.SetValue(null, u.Live ? UnityInputProvider : null);
            host.GetField("FrameSink")!.SetValue(null, u.Live ? UnityFrameSink : null);
        }

        var entry = assembly.EntryPoint;
        if (entry is null)
        {
            result.Status = "compile-error";
            result.Diagnostics.Add(new DiagnosticInfo { Severity = "error", Id = "LAB001", Line = 1, Column = 1, File = c.UserFiles.FirstOrDefault() ?? "", Message = "실행을 시작할 곳(Main 메서드나 최상위 문장)이 없습니다." });
            return;
        }

        var output = new CappedWriter(MaxOutputChars, OutputSink);
        var oldOut = Console.Out;
        var oldErr = Console.Error;
        // 브라우저에서는 Console.In 읽기/SetIn이 막혀 있어(PlatformNotSupported) 내부 필드를 직접 바꾼다.
        TextReader? oldIn = null;
        try { oldIn = Console.In; } catch (PlatformNotSupportedException) { }
        Console.SetOut(output);
        Console.SetError(output);
        SetConsoleIn(new StringReader(stdin));

        var run = Stopwatch.StartNew();
        try
        {
            entry = ResolveAsyncEntry(entry);
            object?[] args = entry.GetParameters().Length == 0 ? Array.Empty<object?>() : new object?[] { Array.Empty<string>() };
            var returned = entry.Invoke(null, args);
            if (returned is Task task) await task;
            result.Status = "ok";
        }
        catch (Exception ex)
        {
            var real = Unwrap(ex);
            result.Status = "runtime-error";
            result.Error = Describe(real, output.LimitHit);
            if (result.Error.Line is null)
            {
                var (line, file) = FindUserLine(real, assembly, c.Pdb, c.UserFiles);
                result.Error.Line = line;
                result.Error.File = file;
            }
            if (result.Error.Type is "Timeout" or "OutputLimit" or "TooDeep") result.Status = "stopped";
            if (c.Mode == Mode.Unity && result.Error.Type == "Timeout")
                result.Error.Friendly = "한 프레임(Update 한 번)이 2초를 넘어서 중단했습니다. Update 안에 끝나지 않는 반복문이 있는지 확인하세요.";
        }
        finally
        {
            output.Pump();
            Console.Out.Flush();
            Console.SetOut(oldOut);
            Console.SetError(oldErr);
            SetConsoleIn(oldIn);
        }
        result.RunMs = run.ElapsedMilliseconds;
        result.Stdout = output.ToString();
        result.OutputTruncated = output.LimitHit;
    }

    static Exception Unwrap(Exception ex)
    {
        while (ex is TargetInvocationException { InnerException: { } inner }) ex = inner;
        return ex;
    }

    /// <summary>
    /// async Main(최상위 await 포함)은 컴파일러가 동기 래퍼 &lt;Main&gt;을 진입점으로 만든다.
    /// 래퍼는 .GetAwaiter().GetResult()로 막고 기다려서 브라우저(단일 스레드)에서 실패하므로 원래 async 메서드를 직접 부른다.
    /// </summary>
    static MethodInfo ResolveAsyncEntry(MethodInfo entry)
    {
        if (entry.Name != "<Main>" || entry.DeclaringType is null) return entry;
        var target = entry.DeclaringType
            .GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
            .FirstOrDefault(m => m != entry && (m.Name == "<Main>$" || m.Name == "Main") && typeof(Task).IsAssignableFrom(m.ReturnType));
        return target ?? entry;
    }

    /// <summary>예외 스택에서 학습자 파일의 첫 프레임을 찾아 PDB로 줄 번호와 파일 이름을 계산한다.</summary>
    static (int? line, string? file) FindUserLine(Exception ex, Assembly userAssembly, byte[] pdb, HashSet<string> userFiles)
    {
        try
        {
            var frames = new StackTrace(ex, false).GetFrames();
            using var provider = MetadataReaderProvider.FromPortablePdbImage(ImmutableArray.Create(pdb));
            var reader = provider.GetMetadataReader();
            foreach (var frame in frames)
            {
                var method = frame.GetMethod();
                if (method is null || method.Module.Assembly != userAssembly) continue;
                if (method.DeclaringType?.Name == "__LabGuard") continue;
                int il = frame.GetILOffset();
                if (il < 0) continue;
                var handle = MetadataTokens.MethodDefinitionHandle(method.MetadataToken);
                int? line = null;
                string? file = null;
                foreach (var sp in reader.GetMethodDebugInformation(handle.ToDebugInformationHandle()).GetSequencePoints())
                {
                    if (sp.IsHidden) continue;
                    if (sp.Offset > il) break;
                    var doc = reader.GetString(reader.GetDocument(sp.Document).Name);
                    if (userFiles.Contains(doc)) { line = sp.StartLine; file = doc; }
                    else { line = null; file = null; }
                }
                if (line is not null) return (line, file);
            }
        }
        catch { }
        return (null, null);
    }

    static readonly FieldInfo? ConsoleInField =
        typeof(Console).GetField("s_in", BindingFlags.NonPublic | BindingFlags.Static);

    static void SetConsoleIn(TextReader? reader)
    {
        if (reader is not null)
        {
            try { Console.SetIn(reader); return; }
            catch (PlatformNotSupportedException) { }
        }
        ConsoleInField?.SetValue(null, reader is null ? null : TextReader.Synchronized(reader));
    }

    public static string Diagnose()
    {
        var sb = new StringBuilder();
        sb.Append("ui=").Append(CultureInfo.CurrentUICulture.Name).Append(';');
        sb.Append("s_in=").Append(ConsoleInField is not null).Append(';');
        try
        {
            var rm = new System.Resources.ResourceManager("Microsoft.CodeAnalysis.CSharp.CSharpResources", typeof(CSharpCompilation).Assembly);
            sb.Append("ko=").Append(rm.GetString("ERR_SemicolonExpected", Korean));
        }
        catch (Exception ex) { sb.Append("ko-err=").Append(ex.GetType().Name).Append(':').Append(ex.Message); }
        return sb.ToString();
    }

    static CSharpCompilation MakeCompilation(Mode mode, IEnumerable<SyntaxTree> trees) =>
        CSharpCompilation.Create(
            "UserProgram_" + Guid.NewGuid().ToString("N"),
            trees.Prepend(mode == Mode.Unity ? UnityUsingsTree : GlobalUsingsTree),
            References,
            new CSharpCompilationOptions(
                OutputKind.ConsoleApplication,
                optimizationLevel: OptimizationLevel.Debug,
                nullableContextOptions: NullableContextOptions.Disable,
                allowUnsafe: false,
                concurrentBuild: false)); // 브라우저는 단일 스레드

    static DiagnosticInfo ToInfo(Diagnostic d)
    {
        var span = d.Location.IsInSource ? d.Location.GetLineSpan() : default;
        string message;
        try { message = d.GetMessage(Korean); } catch { message = d.GetMessage(); }
        return new DiagnosticInfo
        {
            Severity = d.Severity == DiagnosticSeverity.Error ? "error" : "warning",
            Id = d.Id,
            Line = d.Location.IsInSource ? span.StartLinePosition.Line + 1 : 0,
            Column = d.Location.IsInSource ? span.StartLinePosition.Character + 1 : 0,
            EndLine = d.Location.IsInSource ? span.EndLinePosition.Line + 1 : 0,
            EndColumn = d.Location.IsInSource ? span.EndLinePosition.Character + 1 : 0,
            Message = message,
            File = d.Location.SourceTree?.FilePath ?? "",
        };
    }

    static ErrorInfo Describe(Exception ex, bool outputLimit)
    {
        if (outputLimit || ex is OutputLimitException)
            return new ErrorInfo { Type = "OutputLimit", Message = "", Friendly = $"출력이 너무 많아서({MaxOutputChars:N0}자 초과) 중단했습니다. 끝없이 출력하는 반복문이 있는지 확인하세요." };
        if (ex is OperationCanceledException oce && oce.Message == "__LAB_TIMEOUT__")
            return new ErrorInfo { Type = "Timeout", Message = "", Friendly = $"실행 시간이 {TimeLimitMs / 1000}초를 넘어서 중단했습니다. 끝나지 않는 반복문(무한 반복)이 있는지 확인하세요." };
        if (ex is OperationCanceledException oce2 && oce2.Message == "__LAB_DEPTH__")
            return new ErrorInfo { Type = "TooDeep", Message = "", Friendly = $"메서드가 자기 자신을 너무 깊이({MaxDepth:N0}단계 넘게) 불러서 중단했습니다. 재귀의 종료 조건을 확인하세요." };

        string friendly = ex.GetType().Name switch
        {
            "MissingComponentException" => "그 게임 오브젝트에 없는 컴포넌트를 쓰려고 했습니다. (AddComponent 했는지 확인)",
            "UnityException" => "Unity 시뮬레이터에서 허용되지 않는 사용입니다. " + ex.Message,
            _ => null,
        } ?? ex switch
        {
            DivideByZeroException => "0으로 나누려고 했습니다.",
            IndexOutOfRangeException => "배열의 범위를 벗어난 위치(인덱스)를 사용했습니다.",
            ArgumentOutOfRangeException => "허용 범위를 벗어난 값(주로 리스트 인덱스)을 사용했습니다.",
            NullReferenceException => "비어 있는(null) 값의 멤버를 사용하려고 했습니다.",
            FormatException => "문자열을 숫자 등으로 바꿀 수 없는 형식입니다. (예: int.Parse(\"abc\"))",
            InvalidCastException => "바꿀 수 없는 형식으로 변환하려고 했습니다.",
            KeyNotFoundException => "딕셔너리에 없는 키를 사용했습니다.",
            OverflowException => "숫자가 표현할 수 있는 범위를 넘었습니다.",
            InvalidOperationException => "지금 상태에서는 할 수 없는 작업입니다.",
            PlatformNotSupportedException => "브라우저 환경에서는 지원하지 않는 기능입니다.",
            NotImplementedException => "아직 만들지 않은 기능(NotImplementedException)을 불렀습니다.",
            ArgumentNullException => "null 이면 안 되는 자리에 null 을 넘겼습니다.",
            ArgumentException => "메서드에 알맞지 않은 값을 넘겼습니다.",
            _ => "실행 중 예외가 발생했습니다.",
        };
        return new ErrorInfo { Type = ex.GetType().Name, Message = ex.Message, Friendly = friendly };
    }
}
