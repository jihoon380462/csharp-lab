using System.Text.Json.Serialization;

namespace CsEngine;

// Engine.Run 이 돌려주는 결과. JSON(camelCase)으로 직렬화되어 브라우저로 간다.
// 이 모양은 다른 프로젝트(아카데미 등)가 의존하는 계약이다 — 필드를 지우거나 이름을 바꾸지 말 것 (docs/MANUAL.md 4절).

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(RunResult))]
internal partial class LabJson : JsonSerializerContext { }

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
    public bool EmitRetried { get; set; }
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
