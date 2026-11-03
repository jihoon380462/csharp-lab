using System.Text.Json.Serialization;

namespace CsEngine;

// 엔진이 주고받는 데이터 모양. JSON(camelCase)으로 직렬화되어 브라우저와 오간다.
// RunResult·GradeResult·CheckResult 는 다른 프로젝트(아카데미 등)가 의존하는 계약이다
// — 필드를 지우거나 이름을 바꾸지 말 것. 추가는 괜찮다 (docs/REFERENCE.md 4절).

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true)]
[JsonSerializable(typeof(RunResult))]
[JsonSerializable(typeof(GradeResult))]
[JsonSerializable(typeof(CheckResult))]
[JsonSerializable(typeof(List<SourceFile>))]
[JsonSerializable(typeof(List<TestCase>))]
[JsonSerializable(typeof(UnityOptions))]
internal partial class LabJson : JsonSerializerContext { }

/// <summary>실행 한 번의 결과 (Run / RunFiles / RunUnity / 채점의 테스트 하나).</summary>
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

/// <summary>컴파일 오류·경고 하나. File 은 어느 파일인지(한 파일이면 Program.cs, 위치 없으면 "").</summary>
public sealed class DiagnosticInfo
{
    public string Severity { get; set; } = "";
    public string Id { get; set; } = "";
    public int Line { get; set; }
    public int Column { get; set; }
    public int EndLine { get; set; }
    public int EndColumn { get; set; }
    public string Message { get; set; } = "";
    public string File { get; set; } = "";
}

/// <summary>실행 오류. Line/File 은 학습자 코드에서 오류가 난 곳(모르면 null).</summary>
public sealed class ErrorInfo
{
    public string Type { get; set; } = "";
    public string Message { get; set; } = "";
    public string Friendly { get; set; } = "";
    public int? Line { get; set; }
    public string? File { get; set; }
}

/// <summary>여러 파일 컴파일용 소스 파일 하나.</summary>
public sealed class SourceFile
{
    public string Name { get; set; } = "Program.cs";
    public string Code { get; set; } = "";
}

/// <summary>채점 테스트 하나. Expect 가 null 이면 실행만 하고 통과 여부는 매기지 않는다.</summary>
public sealed class TestCase
{
    public string? Stdin { get; set; }
    public string? Expect { get; set; }
}

/// <summary>채점 결과: 컴파일은 한 번, 테스트마다 새로 실행.</summary>
public sealed class GradeResult
{
    /// <summary>ok(컴파일 성공, 테스트 실행함) · compile-error · internal-error</summary>
    public string Status { get; set; } = "";
    public List<DiagnosticInfo> Diagnostics { get; set; } = new();
    public ErrorInfo? Error { get; set; }
    public List<TestResult> Tests { get; set; } = new();
    public int Passed { get; set; }
    public int Total { get; set; }
    public long CompileMs { get; set; }
    public long TotalMs { get; set; }
}

public sealed class TestResult
{
    public string Status { get; set; } = "";
    public string Stdout { get; set; } = "";
    public bool OutputTruncated { get; set; }
    public ErrorInfo? Error { get; set; }
    /// <summary>Expect 가 있을 때만 true/false. 출력 비교는 줄 끝 공백·마지막 빈 줄 무시.</summary>
    public bool? Passed { get; set; }
    public long RunMs { get; set; }
}

/// <summary>실행 없이 진단만 (입력하면서 오류 밑줄용).</summary>
public sealed class CheckResult
{
    public List<DiagnosticInfo> Diagnostics { get; set; } = new();
    public long Ms { get; set; }
}

/// <summary>Unity 모드(UnityLite) 실행 옵션.</summary>
public sealed class UnityOptions
{
    /// <summary>실행할 프레임 수. 0 = 멈출 때까지(실시간 모드 전용).</summary>
    public int Frames { get; set; }
    /// <summary>true = 실시간(약 60fps, 실제 경과 시간, 화면 입력). false = 고정 시간 간격으로 빠르게(채점용).</summary>
    public bool Live { get; set; }
    /// <summary>고정 모드의 Time.deltaTime (기본 1/60).</summary>
    public float FixedDelta { get; set; } = 1f / 60f;
    /// <summary>고정 모드 입력 대본. 예: "0-59:RightArrow;60-60:Space+UpArrow" (프레임 번호는 0부터, 양끝 포함)</summary>
    public string? InputScript { get; set; }
    /// <summary>Random 시드 (고정 모드 재현용).</summary>
    public int Seed { get; set; }
}
