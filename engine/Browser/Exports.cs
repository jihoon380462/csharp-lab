using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text.Json;

namespace CsEngine;

/// <summary>
/// Web Worker(engine-worker.js)에서 부르는 진입점.
/// JS에서는 exports.CsEngine.Exports.Run(code, stdin) 형태로 보인다.
/// 여러 값을 주고받는 함수는 JSON 문자열을 쓴다(형식은 Core/RunResult.cs).
/// </summary>
[SupportedOSPlatform("browser")]
public static partial class Exports
{
    [JSExport]
    public static string GetVersion() => Engine.GetVersion();

    [JSExport]
    public static string Diagnose() => Engine.Diagnose();

    [JSExport]
    public static Task<string> Warmup() => Engine.Warmup();

    /// <summary>코드 하나 실행 → RunResult JSON</summary>
    [JSExport]
    public static Task<string> Run(string code, string stdin)
    {
        Engine.OutputSink = PostOutput;
        return Engine.Run(code, stdin);
    }

    /// <summary>여러 파일 실행. filesJson = [{name, code}] → RunResult JSON</summary>
    [JSExport]
    public static async Task<string> RunFiles(string filesJson, string stdin)
    {
        Engine.OutputSink = PostOutput;
        var files = JsonSerializer.Deserialize(filesJson, LabJson.Default.ListSourceFile) ?? new();
        return Engine.ToJson(await Engine.RunFilesAsync(files, stdin));
    }

    /// <summary>채점. testsJson = [{stdin, expect}] → GradeResult JSON (실행 중 출력은 흘려보내지 않음)</summary>
    [JSExport]
    public static async Task<string> Grade(string filesJson, string testsJson)
    {
        Engine.OutputSink = null;
        var files = JsonSerializer.Deserialize(filesJson, LabJson.Default.ListSourceFile) ?? new();
        var tests = JsonSerializer.Deserialize(testsJson, LabJson.Default.ListTestCase) ?? new();
        return Engine.ToJson(await Engine.GradeAsync(files, tests));
    }

    /// <summary>진단만 (실행 안 함). mode = "console" | "unity" → CheckResult JSON</summary>
    [JSExport]
    public static string Check(string filesJson, string mode)
    {
        var files = JsonSerializer.Deserialize(filesJson, LabJson.Default.ListSourceFile) ?? new();
        return Engine.ToJson(Engine.Check(files, mode));
    }

    /// <summary>Unity 모드 실행. optionsJson = UnityOptions → RunResult JSON (실시간이면 중지할 때까지 안 끝남)</summary>
    [JSExport]
    public static async Task<string> RunUnity(string code, string optionsJson)
    {
        Engine.OutputSink = PostOutput;
        Engine.UnityInputProvider = GetInput;
        Engine.UnityFrameSink = PostFrame;
        var options = JsonSerializer.Deserialize(optionsJson, LabJson.Default.UnityOptions) ?? new UnityOptions();
        return Engine.ToJson(await Engine.RunUnityAsync(code, options));
    }

    /// <summary>실행 중 출력 조각을 화면으로 보냄 (engine-worker.js의 globalThis.labPostOutput)</summary>
    [JSImport("globalThis.labPostOutput")]
    internal static partial void PostOutput(string chunk);

    /// <summary>Unity 모드: 지금 눌린 키 (engine-worker.js의 globalThis.labGetInput)</summary>
    [JSImport("globalThis.labGetInput")]
    internal static partial string GetInput();

    /// <summary>Unity 모드: 프레임 장면 상태를 화면으로 (engine-worker.js의 globalThis.labPostFrame)</summary>
    [JSImport("globalThis.labPostFrame")]
    internal static partial void PostFrame(string scene);
}
