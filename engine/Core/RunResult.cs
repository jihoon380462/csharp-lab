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
[JsonSerializable(typeof(AnalyzeResult))]
[JsonSerializable(typeof(List<StructureRule>))]
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

// ───────────────────────── 구조 분석 (Analyze) ─────────────────────────

/// <summary>구조 분석 결과: 타입·멤버·관계·문법 사용 횟수·호출 횟수 + (규칙을 주면) 규칙별 결과.</summary>
public sealed class AnalyzeResult
{
    /// <summary>ok · compile-error (오류가 있어도 분석 가능한 만큼은 채운다)</summary>
    public string Status { get; set; } = "";
    public List<DiagnosticInfo> Diagnostics { get; set; } = new();
    public List<TypeModel> Types { get; set; } = new();
    public List<RelationModel> Relations { get; set; } = new();
    /// <summary>문법 사용 횟수: if switch for foreach while do lambda yield event new try throw ternary lock linq pattern recursion</summary>
    public Dictionary<string, int> Features { get; set; } = new();
    /// <summary>메서드 호출 횟수 (메서드 이름 → 횟수)</summary>
    public Dictionary<string, int> Calls { get; set; } = new();
    public List<RuleResult> Rules { get; set; } = new();
    public int RulesPassed { get; set; }
    public int RulesTotal { get; set; }
    public long Ms { get; set; }
}

/// <summary>학습자 코드에 선언된 타입 하나.</summary>
public sealed class TypeModel
{
    /// <summary>표시 이름 (제네릭이면 Repo&lt;T&gt;, 중첩이면 Outer.Inner)</summary>
    public string Name { get; set; } = "";
    /// <summary>짧은 이름 (Repo)</summary>
    public string SimpleName { get; set; } = "";
    /// <summary>class · interface · record · struct · record struct · enum · delegate</summary>
    public string Kind { get; set; } = "";
    public bool IsAbstract { get; set; }
    public bool IsSealed { get; set; }
    public bool IsStatic { get; set; }
    public int Generic { get; set; }
    /// <summary>부모 클래스 표시 이름 (object 면 null). 학습자 타입이 아니어도 적힌다(예: Exception, MonoBehaviour)</summary>
    public string? BaseType { get; set; }
    /// <summary>직접 구현한 인터페이스 표시 이름 (학습자 것 + 라이브러리 것)</summary>
    public List<string> Interfaces { get; set; } = new();
    public string? Container { get; set; }
    public string File { get; set; } = "";
    public int Line { get; set; }
    public List<MemberModel> Members { get; set; } = new();
}

public sealed class MemberModel
{
    public string Name { get; set; } = "";
    /// <summary>method · constructor · property · field · const · event · value(enum)</summary>
    public string Kind { get; set; } = "";
    /// <summary>+ public · - private · # protected · ~ internal</summary>
    public string Access { get; set; } = "+";
    /// <summary>필드·속성·이벤트의 타입, 메서드의 반환 타입</summary>
    public string? Type { get; set; }
    /// <summary>메서드·생성자 매개변수 "int a, int b"</summary>
    public string? Params { get; set; }
    public bool IsStatic { get; set; }
    public bool IsAbstract { get; set; }
    public bool IsVirtual { get; set; }
    public bool IsOverride { get; set; }
    public int Line { get; set; }
}

/// <summary>학습자 타입 사이의 관계. Kind: inherits(상속·인터페이스 확장) · implements · has(필드·속성·생성자 매개변수로 품음) · creates(new) · uses(매개변수·반환 타입)</summary>
public sealed class RelationModel
{
    public string From { get; set; } = "";
    public string To { get; set; } = "";
    public string Kind { get; set; } = "";
    /// <summary>여러 개를 품음 (배열·List·Dictionary 등)</summary>
    public bool Many { get; set; }
    /// <summary>관계가 생긴 멤버 이름 (has·uses)</summary>
    public string? Via { get; set; }
}

/// <summary>
/// 구조 규칙 하나. 셋 중 하나를 쓴다:
///  Count(타입 조건에 맞는 타입 수) · Relation(관계 수) · Uses(문법 사용 횟수) · Calls(메서드 호출 횟수).
/// Min 생략 시 1 (Max 만 있으면 0). 자세한 건 docs/REFERENCE.md "구조 규칙".
/// </summary>
public sealed class StructureRule
{
    public string? Id { get; set; }
    public string Text { get; set; } = "";
    public TypeFilter? Count { get; set; }
    public RelationFilter? Relation { get; set; }
    public string? Uses { get; set; }
    public string? Calls { get; set; }
    public int? Min { get; set; }
    public int? Max { get; set; }
}

/// <summary>타입 조건. 이름 자리에는 정확한 이름 · "*"(아무거나) · "/정규식/" · "self"(has·creates 에서 자기 자신).</summary>
public sealed class TypeFilter
{
    /// <summary>class(record 포함) · interface · abstract · abstraction(인터페이스 또는 추상 클래스) · concrete · record · struct · enum · static · sealed</summary>
    public string? Kind { get; set; }
    public string? Name { get; set; }
    public string? Implements { get; set; }
    public string? Inherits { get; set; }
    /// <summary>부모 클래스 또는 인터페이스 중 하나</summary>
    public string? Extends { get; set; }
    public string? Member { get; set; }
    public string? MemberKind { get; set; }
    public bool? PrivateConstructor { get; set; }
    /// <summary>이 타입을 상속·구현한 학습자 타입 수 이상</summary>
    public int? Subtypes { get; set; }
    public string? Has { get; set; }
    public string? Creates { get; set; }
    /// <summary>자기 타입을 돌려주는 메서드 수 이상 (메서드 연결)</summary>
    public int? ReturnsSelf { get; set; }
    /// <summary>abstract 멤버 수 이상</summary>
    public int? AbstractMembers { get; set; }
}

public sealed class RelationFilter
{
    public string? From { get; set; }
    public string? To { get; set; }
    /// <summary>inherits · implements · extends(둘 다) · has · creates · uses · * </summary>
    public string? Kind { get; set; }
}

public sealed class RuleResult
{
    public string? Id { get; set; }
    public string Text { get; set; } = "";
    public bool Passed { get; set; }
    public int Actual { get; set; }
    public string Detail { get; set; } = "";
}
