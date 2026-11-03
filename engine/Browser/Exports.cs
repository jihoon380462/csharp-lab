using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

namespace CsEngine;

/// <summary>
/// Web Worker(engine-worker.js)에서 부르는 진입점.
/// JS에서는 exports.CsEngine.Exports.Run(code, stdin) 형태로 보인다.
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

    [JSExport]
    public static Task<string> Run(string code, string stdin)
    {
        Engine.OutputSink = PostOutput;
        return Engine.Run(code, stdin);
    }

    /// <summary>실행 중 출력 조각을 화면으로 보냄 (engine-worker.js의 globalThis.labPostOutput)</summary>
    [JSImport("globalThis.labPostOutput")]
    internal static partial void PostOutput(string chunk);
}
