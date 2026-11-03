using System.Diagnostics;
using System.Globalization;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Basic.Reference.Assemblies;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;
using Microsoft.JSInterop;

namespace CsEngine;

/// <summary>
/// 브라우저 안에서 C# 코드를 컴파일(Roslyn)하고 실행하는 엔진.
/// JS에서 DotNet.invokeMethodAsync('CsEngine', 'Run', code, stdin) 으로 부른다.
/// </summary>
public static class Engine
{
    public const string EngineVersion = "0.1.0";
    public const int TimeLimitMs = 5000;
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

    static readonly CSharpParseOptions ParseOptions = new(LanguageVersion.CSharp12);
    static readonly SyntaxTree GlobalUsingsTree = CSharpSyntaxTree.ParseText(GlobalUsingsSource, ParseOptions, "GlobalUsings.cs", Encoding.UTF8);
    static readonly SyntaxTree GuardTree = CSharpSyntaxTree.ParseText(GuardSource, ParseOptions, "Guard.cs", Encoding.UTF8);
    static readonly CultureInfo Korean = MakeKorean();
    static IReadOnlyList<MetadataReference>? _references;

    static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    static CultureInfo MakeKorean()
    {
        try { return new CultureInfo("ko"); } catch { return CultureInfo.InvariantCulture; }
    }

    static IReadOnlyList<MetadataReference> References =>
        _references ??= Net80.References.All.Cast<MetadataReference>().ToList();

    [JSInvokable]
    public static string GetVersion() => EngineVersion;

    /// <summary>첫 컴파일이 느리므로 페이지 로딩 직후 미리 한 번 돌려 둔다.</summary>
    [JSInvokable]
    public static async Task<string> Warmup()
    {
        var sw = Stopwatch.StartNew();
        await Run("int x = 1 + 2; for (int i = 0; i < 3; i++) x += i; System.Console.Write(x);", "");
        return sw.ElapsedMilliseconds.ToString(CultureInfo.InvariantCulture);
    }

    [JSInvokable]
    public static async Task<string> Run(string code, string? stdin)
    {
        var result = new RunResult();
        var total = Stopwatch.StartNew();
        try
        {
            await RunCore(code ?? "", stdin ?? "", result);
        }
        catch (Exception ex)
        {
            result.Status = "internal-error";
            result.Error = new ErrorInfo { Type = ex.GetType().Name, Message = ex.Message, Friendly = "엔진 내부 오류가 났습니다. 이 화면을 캡처해 알려주세요." };
        }
        result.TotalMs = total.ElapsedMilliseconds;
        return JsonSerializer.Serialize(result, JsonOptions);
    }

    static async Task RunCore(string code, string stdin, RunResult result)
    {
        // ── 1) 원본 코드로 컴파일 검사 (줄 번호가 원본과 정확히 일치하도록) ──
        var sw = Stopwatch.StartNew();
        var userTree = CSharpSyntaxTree.ParseText(code, ParseOptions, "Program.cs", Encoding.UTF8);
        if (((Microsoft.CodeAnalysis.CSharp.Syntax.CompilationUnitSyntax)userTree.GetRoot()).Members.Count == 0
            && !userTree.GetDiagnostics().Any(d => d.Severity == DiagnosticSeverity.Error))
        {
            // 빈 코드(또는 주석·using만 있는 코드): 실행할 것이 없을 뿐 오류는 아님
            result.Status = "ok";
            return;
        }
        var checkCompilation = MakeCompilation(userTree);
        var diagnostics = checkCompilation.GetDiagnostics()
            .Where(d => d.Severity is DiagnosticSeverity.Error or DiagnosticSeverity.Warning)
            .Where(d => d.Location.SourceTree == userTree || d.Location == Location.None)
            .OrderBy(d => d.Severity == DiagnosticSeverity.Error ? 0 : 1)
            .ThenBy(d => d.Location.SourceSpan.Start)
            .Take(30)
            .ToList();
        result.Diagnostics = diagnostics.Select(ToInfo).ToList();

        if (diagnostics.Any(d => d.Severity == DiagnosticSeverity.Error))
        {
            result.CompileMs = sw.ElapsedMilliseconds;
            result.Status = "compile-error";
            return;
        }

        // ── 2) 보호 코드를 끼워 넣은 버전으로 실제 빌드 ──
        var guarded = new GuardRewriter().Visit(userTree.GetRoot());
        var guardedTree = CSharpSyntaxTree.Create((Microsoft.CodeAnalysis.CSharp.CSharpSyntaxNode)guarded, ParseOptions, "Program.cs", Encoding.UTF8);
        var buildCompilation = MakeCompilation(guardedTree, GuardTree);

        using var peStream = new MemoryStream();
        var emit = buildCompilation.Emit(peStream, options: new EmitOptions(debugInformationFormat: DebugInformationFormat.Embedded));
        result.CompileMs = sw.ElapsedMilliseconds;
        if (!emit.Success)
        {
            result.Status = "internal-error";
            result.Diagnostics = emit.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error).Take(10).Select(ToInfo).ToList();
            result.Error = new ErrorInfo { Type = "EmitFailed", Message = "보호 코드 삽입 후 빌드 실패", Friendly = "엔진 내부 오류가 났습니다. 이 코드와 화면을 알려주세요." };
            return;
        }

        // ── 3) 실행 ──
        var assembly = Assembly.Load(peStream.ToArray());
        var guardType = assembly.GetType("__LabGuard")!;
        guardType.GetField("MaxDepth")!.SetValue(null, MaxDepth);
        guardType.GetField("Deadline")!.SetValue(null, Environment.TickCount64 + TimeLimitMs);

        var entry = assembly.EntryPoint;
        if (entry is null)
        {
            result.Status = "compile-error";
            result.Diagnostics.Add(new DiagnosticInfo { Severity = "error", Id = "LAB001", Line = 1, Column = 1, Message = "실행을 시작할 곳(Main 메서드나 최상위 문장)이 없습니다." });
            return;
        }

        var output = new CappedWriter(MaxOutputChars);
        var oldOut = Console.Out;
        var oldErr = Console.Error;
        var oldIn = Console.In;
        Console.SetOut(output);
        Console.SetError(output);
        Console.SetIn(new StringReader(stdin));

        var run = Stopwatch.StartNew();
        try
        {
            object?[] args = entry.GetParameters().Length == 0 ? Array.Empty<object?>() : new object?[] { Array.Empty<string>() };
            var returned = entry.Invoke(null, args);
            if (returned is Task task) await task;
            result.Status = "ok";
        }
        catch (Exception ex)
        {
            var real = ex is TargetInvocationException tie && tie.InnerException is not null ? tie.InnerException : ex;
            result.Status = "runtime-error";
            result.Error = Describe(real, output.LimitHit);
            if (result.Error.Type is "Timeout" or "OutputLimit" or "TooDeep") result.Status = "stopped";
        }
        finally
        {
            Console.Out.Flush();
            Console.SetOut(oldOut);
            Console.SetError(oldErr);
            Console.SetIn(oldIn);
        }
        result.RunMs = run.ElapsedMilliseconds;
        result.Stdout = output.ToString();
        result.OutputTruncated = output.LimitHit;
    }

    static CSharpCompilation MakeCompilation(params SyntaxTree[] trees) =>
        CSharpCompilation.Create(
            "UserProgram_" + Guid.NewGuid().ToString("N"),
            trees.Prepend(GlobalUsingsTree),
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
        };
    }

    static readonly Regex LineInTrace = new(@"Program\.cs:line (\d+)", RegexOptions.Compiled);

    static ErrorInfo Describe(Exception ex, bool outputLimit)
    {
        if (outputLimit || ex is OutputLimitException)
            return new ErrorInfo { Type = "OutputLimit", Message = "", Friendly = $"출력이 너무 많아서({MaxOutputChars:N0}자 초과) 중단했습니다. 끝없이 출력하는 반복문이 있는지 확인하세요." };
        if (ex is OperationCanceledException oce && oce.Message == "__LAB_TIMEOUT__")
            return new ErrorInfo { Type = "Timeout", Message = "", Friendly = $"실행 시간이 {TimeLimitMs / 1000}초를 넘어서 중단했습니다. 끝나지 않는 반복문(무한 반복)이 있는지 확인하세요." };
        if (ex is OperationCanceledException oce2 && oce2.Message == "__LAB_DEPTH__")
            return new ErrorInfo { Type = "TooDeep", Message = "", Friendly = $"메서드가 자기 자신을 너무 깊이({MaxDepth:N0}단계 넘게) 불러서 중단했습니다. 재귀의 종료 조건을 확인하세요." };

        int? line = null;
        var m = LineInTrace.Match(ex.StackTrace ?? "");
        if (m.Success) line = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);

        string friendly = ex switch
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
            _ => "실행 중 예외가 발생했습니다.",
        };
        return new ErrorInfo { Type = ex.GetType().Name, Message = ex.Message, Friendly = friendly, Line = line };
    }
}

public sealed class RunResult
{
    public string Status { get; set; } = "";
    public string Stdout { get; set; } = "";
    public bool OutputTruncated { get; set; }
    public List<DiagnosticInfo> Diagnostics { get; set; } = new();
    public ErrorInfo? Error { get; set; }
    public long CompileMs { get; set; }
    public long RunMs { get; set; }
    public long TotalMs { get; set; }
}

public sealed class DiagnosticInfo
{
    public string Severity { get; set; } = "";
    public string Id { get; set; } = "";
    public int Line { get; set; }
    public int Column { get; set; }
    public int EndLine { get; set; }
    public int EndColumn { get; set; }
    public string Message { get; set; } = "";
}

public sealed class ErrorInfo
{
    public string Type { get; set; } = "";
    public string Message { get; set; } = "";
    public string Friendly { get; set; } = "";
    public int? Line { get; set; }
}

sealed class OutputLimitException : Exception { }

/// <summary>출력 상한을 넘으면 예외를 던져 프로그램을 멈추는 Writer.</summary>
sealed class CappedWriter : StringWriter
{
    readonly int _max;
    public bool LimitHit { get; private set; }
    public CappedWriter(int max) => _max = max;

    void Check()
    {
        if (LimitHit) throw new OutputLimitException();
        if (GetStringBuilder().Length > _max)
        {
            LimitHit = true;
            GetStringBuilder().Length = _max;
            throw new OutputLimitException();
        }
    }

    public override void Write(char value) { if (LimitHit) throw new OutputLimitException(); base.Write(value); Check(); }
    public override void Write(string? value) { if (LimitHit) throw new OutputLimitException(); base.Write(value); Check(); }
    public override void Write(char[] buffer, int index, int count) { if (LimitHit) throw new OutputLimitException(); base.Write(buffer, index, count); Check(); }
    public override void Write(ReadOnlySpan<char> buffer) { if (LimitHit) throw new OutputLimitException(); base.Write(buffer); Check(); }
    public override void WriteLine(ReadOnlySpan<char> buffer) { if (LimitHit) throw new OutputLimitException(); base.WriteLine(buffer); Check(); }
}
