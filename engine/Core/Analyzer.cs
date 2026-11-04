using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CsEngine;

public static partial class Engine
{
    /// <summary>
    /// 구조 분석: 실행하지 않고 타입·멤버·관계·문법 사용 횟수를 뽑는다(클래스 다이어그램용).
    /// rules 를 주면 구조 규칙(「인터페이스를 구현한 클래스 2개 이상」 등)을 평가한다.
    /// mode: "console" | "unity" (unity 면 UnityLite 와 함께 컴파일하되 결과에는 학습자 타입만)
    /// </summary>
    public static AnalyzeResult Analyze(IReadOnlyList<SourceFile> files, IReadOnlyList<StructureRule>? rules = null, string? mode = "console")
    {
        var sw = Stopwatch.StartNew();
        var m = mode == "unity" ? Mode.Unity : Mode.Console;
        var all = WithLibraries(files, m);
        var trees = all.Select(Parse).ToList();
        var compilation = MakeCompilation(m, trees.Append(GuardTree));
        // 구조만 보므로 「Main 없음(CS5001)」은 오류로 치지 않는다 (클래스만 있는 코드도 그릴 수 있게)
        var result = new AnalyzeResult { Diagnostics = CollectDiagnostics(compilation, trees, all, m).Where(d => d.Id != "CS5001").ToList() };
        result.Status = result.Diagnostics.Any(d => d.Severity == "error") ? "compile-error" : "ok";
        var userTrees = trees.Where(t => t.FilePath != UnityLibName).ToList();
        StructureAnalyzer.Fill(compilation, userTrees, result);
        if (rules is not null) StructureAnalyzer.Evaluate(rules, result);
        result.Ms = sw.ElapsedMilliseconds;
        return result;
    }
}

/// <summary>Roslyn 의미 모델로 구조를 뽑고 구조 규칙을 평가한다.</summary>
internal static class StructureAnalyzer
{
    static readonly SymbolDisplayFormat Fmt = SymbolDisplayFormat.MinimallyQualifiedFormat;

    static string Display(ITypeSymbol t) => t.ToDisplayString(Fmt);

    static string Access(Accessibility a) => a switch
    {
        Accessibility.Public => "+",
        Accessibility.Private => "-",
        Accessibility.Internal => "~",
        _ => "#",
    };

    static string Params(IMethodSymbol m) => string.Join(", ", m.Parameters.Select(p => Display(p.Type) + " " + p.Name));

    static int LineOf(SyntaxNode n) => n.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

    static int LineOf(ISymbol s) => s.Locations.FirstOrDefault(l => l.IsInSource) is { } l ? l.GetLineSpan().StartLinePosition.Line + 1 : 0;

    public static void Fill(CSharpCompilation comp, List<SyntaxTree> trees, AnalyzeResult r)
    {
        var decls = new List<(INamedTypeSymbol sym, BaseTypeDeclarationSyntax decl, SemanticModel model)>();
        var user = new HashSet<INamedTypeSymbol>(SymbolEqualityComparer.Default);
        var models = new Dictionary<SyntaxTree, SemanticModel>();
        foreach (var tree in trees)
        {
            var model = comp.GetSemanticModel(tree);
            models[tree] = model;
            foreach (var decl in tree.GetRoot().DescendantNodes().OfType<BaseTypeDeclarationSyntax>())
            {
                if (model.GetDeclaredSymbol(decl) is not INamedTypeSymbol s) continue;
                decls.Add((s, decl, model));
                user.Add(s);
            }
        }

        // ── 타입 ──
        var names = new Dictionary<INamedTypeSymbol, string>(SymbolEqualityComparer.Default);
        foreach (var (s, decl, _) in decls)
        {
            if (names.ContainsKey(s)) continue;   // partial 은 한 번만
            var t = Describe(s, decl);
            names[s] = t.Name;
            r.Types.Add(t);
        }

        // ── 관계 ──
        var seen = new HashSet<(string, string, string)>();
        void Add(INamedTypeSymbol from, INamedTypeSymbol to, string kind, bool many = false, string? via = null)
        {
            if (!names.TryGetValue(from, out var f) || !names.TryGetValue(to.OriginalDefinition, out var t)) return;
            if (!seen.Add((f, t, kind))) { if (many) r.Relations.First(x => x.From == f && x.To == t && x.Kind == kind).Many = true; return; }
            r.Relations.Add(new RelationModel { From = f, To = t, Kind = kind, Many = many, Via = via });
        }

        foreach (var (s, decl, model) in decls)
        {
            if (s.BaseType is { } b && user.Contains(b.OriginalDefinition)) Add(s, b.OriginalDefinition, "inherits");
            foreach (var i in s.Interfaces)
                if (user.Contains(i.OriginalDefinition)) Add(s, i.OriginalDefinition, s.TypeKind == TypeKind.Interface ? "inherits" : "implements");

            // 가짐(has): 필드·속성·이벤트의 타입 (List<User>·User[] 같은 모음 안의 타입 포함)
            foreach (var mem in s.GetMembers())
            {
                if (!IsSourceMember(s, mem)) continue;
                ITypeSymbol? mt = mem switch
                {
                    IFieldSymbol f when f.AssociatedSymbol is null => f.Type,
                    IPropertySymbol p => p.Type,
                    _ => null,
                };
                if (mt is null) continue;
                foreach (var (ut, many) in UserTypesIn(mt, user, false)) Add(s, ut, "has", many, mem.Name);
            }

            // 주 생성자(class X(Dep d)) 매개변수: 메서드 등에서 실제로 쓰면(=붙잡아 둠) has
            if (decl is TypeDeclarationSyntax { ParameterList: { } plist } td && !s.IsRecord)
            {
                foreach (var ps in plist.Parameters)
                {
                    if (model.GetDeclaredSymbol(ps) is not IParameterSymbol p) continue;
                    var captured = td.Members.SelectMany(mm => mm.DescendantNodes().OfType<IdentifierNameSyntax>())
                        .Where(id => id.Identifier.ValueText == p.Name && !InMemberInitializer(id))
                        .Any(id => SymbolEqualityComparer.Default.Equals(model.GetSymbolInfo(id).Symbol, p));
                    if (!captured) continue;
                    foreach (var (ut, many) in UserTypesIn(p.Type, user, false)) Add(s, ut, "has", many, p.Name);
                }
            }

            // 생성(creates): 이 타입 본문 안의 new (중첩 타입 본문은 제외)
            foreach (var n in decl.DescendantNodes().OfType<BaseObjectCreationExpressionSyntax>())
            {
                if (n.Ancestors().OfType<BaseTypeDeclarationSyntax>().FirstOrDefault() != decl) continue;
                if (model.GetTypeInfo(n).Type is INamedTypeSymbol ct && user.Contains(ct.OriginalDefinition)) Add(s, ct.OriginalDefinition, "creates");
            }

            // 사용(uses): 메서드 매개변수·반환 타입
            foreach (var ms in s.GetMembers().OfType<IMethodSymbol>())
            {
                if (ms.IsImplicitlyDeclared || ms.DeclaringSyntaxReferences.Length == 0) continue;
                if (ms.MethodKind is MethodKind.PropertyGet or MethodKind.PropertySet or MethodKind.EventAdd or MethodKind.EventRemove) continue;
                foreach (var pt in ms.Parameters.Select(p => p.Type).Append(ms.ReturnType))
                    foreach (var (ut, _) in UserTypesIn(pt, user, false)) Add(s, ut, "uses", false, ms.MethodKind == MethodKind.Constructor ? s.Name : ms.Name);
            }
        }

        // ── 문법 사용 횟수·호출 ──
        foreach (var tree in trees) CountFeatures(tree, models[tree], r);
    }

    /// <summary>필드·속성 초기화식 안인가 (주 생성자 매개변수를 거기서만 쓰면 붙잡지 않은 것 — 필드가 has 를 대신함)</summary>
    static bool InMemberInitializer(SyntaxNode n) =>
        n.Ancestors().Any(a => a is FieldDeclarationSyntax || (a is EqualsValueClauseSyntax e && e.Parent is PropertyDeclarationSyntax));

    /// <summary>학습자가 소스에 직접 쓴 멤버인가 (record 위치 매개변수로 생긴 속성 포함)</summary>
    static bool IsSourceMember(INamedTypeSymbol s, ISymbol m)
    {
        if (m.DeclaringSyntaxReferences.Length == 0) return false;
        if (!m.IsImplicitlyDeclared) return true;
        return s.IsRecord && m is IPropertySymbol && m.Name != "EqualityContract";
    }

    static TypeModel Describe(INamedTypeSymbol s, BaseTypeDeclarationSyntax decl)
    {
        var t = new TypeModel
        {
            Name = Display(s),
            SimpleName = s.Name,
            Kind = s.TypeKind switch
            {
                TypeKind.Interface => "interface",
                TypeKind.Struct => s.IsRecord ? "record struct" : "struct",
                TypeKind.Enum => "enum",
                TypeKind.Delegate => "delegate",
                _ => s.IsRecord ? "record" : "class",
            },
            IsAbstract = s.IsAbstract && s.TypeKind == TypeKind.Class && !s.IsStatic,
            IsSealed = s.IsSealed && s.TypeKind == TypeKind.Class && !s.IsStatic,
            IsStatic = s.IsStatic,
            Generic = s.Arity,
            BaseType = s.BaseType is { } b && b.SpecialType is not (SpecialType.System_Object or SpecialType.System_ValueType or SpecialType.System_Enum) ? Display(b) : null,
            Interfaces = s.Interfaces
                .Where(i => !(s.IsRecord && i.OriginalDefinition.ToDisplayString() == "System.IEquatable<T>"))
                .Select(i => Display(i)).ToList(),
            Container = s.ContainingType is { } ct ? Display(ct) : null,
            File = decl.SyntaxTree.FilePath,
            Line = LineOf(decl),
        };
        if (s.TypeKind == TypeKind.Enum)
        {
            t.Members = s.GetMembers().OfType<IFieldSymbol>().Where(f => f.HasConstantValue && !f.IsImplicitlyDeclared)
                .Select(f => new MemberModel { Name = f.Name, Kind = "value", Access = "+", Line = LineOf(f) }).ToList();
            return t;
        }
        foreach (var m in s.GetMembers())
        {
            if (!IsSourceMember(s, m)) continue;
            MemberModel? mm = m switch
            {
                IMethodSymbol ms when ms.MethodKind == MethodKind.Constructor =>
                    new MemberModel { Name = s.Name, Kind = "constructor", Params = Params(ms) },
                IMethodSymbol ms when ms.MethodKind is MethodKind.Ordinary or MethodKind.UserDefinedOperator or MethodKind.Conversion or MethodKind.ExplicitInterfaceImplementation =>
                    new MemberModel { Name = ms.MethodKind == MethodKind.ExplicitInterfaceImplementation ? ms.Name.Split('.').Last() : ms.Name, Kind = "method", Type = Display(ms.ReturnType), Params = Params(ms) },
                IPropertySymbol ps => new MemberModel { Name = ps.IsIndexer ? "this[]" : ps.Name, Kind = "property", Type = Display(ps.Type) },
                IFieldSymbol fs when fs.AssociatedSymbol is null => new MemberModel { Name = fs.Name, Kind = fs.IsConst ? "const" : "field", Type = Display(fs.Type) },
                IEventSymbol es => new MemberModel { Name = es.Name, Kind = "event", Type = Display(es.Type) },
                _ => null,
            };
            if (mm is null) continue;
            mm.Access = Access(m.DeclaredAccessibility);
            mm.IsStatic = m.IsStatic && mm.Kind != "const";
            mm.IsAbstract = m.IsAbstract && s.TypeKind != TypeKind.Interface;
            mm.IsVirtual = m.IsVirtual;
            mm.IsOverride = m.IsOverride;
            mm.Line = LineOf(m);
            t.Members.Add(mm);
        }
        return t;
    }

    static bool IsCollection(INamedTypeSymbol n) =>
        n.SpecialType != SpecialType.System_String &&
        n.OriginalDefinition.AllInterfaces.Any(i => i.OriginalDefinition.SpecialType == SpecialType.System_Collections_Generic_IEnumerable_T);

    /// <summary>타입 안에 들어 있는 학습자 타입들 (배열·제네릭 인자까지). many = 모음 안에 있음</summary>
    static IEnumerable<(INamedTypeSymbol type, bool many)> UserTypesIn(ITypeSymbol t, HashSet<INamedTypeSymbol> user, bool many)
    {
        switch (t)
        {
            case IArrayTypeSymbol a:
                foreach (var x in UserTypesIn(a.ElementType, user, true)) yield return x;
                break;
            case INamedTypeSymbol n:
                if (user.Contains(n.OriginalDefinition)) yield return (n.OriginalDefinition, many);
                if (n.IsGenericType)
                {
                    var coll = many || IsCollection(n);
                    foreach (var ta in n.TypeArguments)
                        foreach (var x in UserTypesIn(ta, user, coll)) yield return x;
                }
                break;
        }
    }

    static void CountFeatures(SyntaxTree tree, SemanticModel model, AnalyzeResult r)
    {
        void Inc(Dictionary<string, int> d, string k) => d[k] = d.GetValueOrDefault(k) + 1;
        foreach (var n in tree.GetRoot().DescendantNodes())
        {
            string? f = n switch
            {
                IfStatementSyntax => "if",
                SwitchStatementSyntax or SwitchExpressionSyntax => "switch",
                ForStatementSyntax => "for",
                CommonForEachStatementSyntax => "foreach",
                WhileStatementSyntax => "while",
                DoStatementSyntax => "do",
                LambdaExpressionSyntax or AnonymousMethodExpressionSyntax => "lambda",
                YieldStatementSyntax => "yield",
                EventFieldDeclarationSyntax or EventDeclarationSyntax => "event",
                BaseObjectCreationExpressionSyntax => "new",
                TryStatementSyntax => "try",
                ThrowStatementSyntax or ThrowExpressionSyntax => "throw",
                ConditionalExpressionSyntax => "ternary",
                LockStatementSyntax => "lock",
                QueryExpressionSyntax => "linq",
                IsPatternExpressionSyntax => "pattern",
                _ => null,
            };
            if (f is not null) Inc(r.Features, f);
            if (n is not InvocationExpressionSyntax inv) continue;

            var sym = model.GetSymbolInfo(inv).Symbol as IMethodSymbol
                      ?? model.GetSymbolInfo(inv).CandidateSymbols.OfType<IMethodSymbol>().FirstOrDefault();
            var name = sym?.Name ?? inv.Expression switch
            {
                MemberAccessExpressionSyntax ma => ma.Name.Identifier.ValueText,
                IdentifierNameSyntax id => id.Identifier.ValueText,
                GenericNameSyntax g => g.Identifier.ValueText,
                _ => null,
            };
            if (name is not null) Inc(r.Calls, name);
            if (sym is null) continue;
            var red = sym.ReducedFrom ?? sym;
            if (red.ContainingType?.ToDisplayString() == "System.Linq.Enumerable") Inc(r.Features, "linq");
            var enclosing = model.GetEnclosingSymbol(inv.SpanStart);
            if (enclosing is IMethodSymbol em && SymbolEqualityComparer.Default.Equals(em.OriginalDefinition, sym.OriginalDefinition)) Inc(r.Features, "recursion");
        }
    }

    // ───────────────────────── 규칙 평가 ─────────────────────────

    static string Strip(string s) => s.IndexOf('<') is var i and > 0 ? s[..i] : s;

    static bool NameIs(string? pattern, string display, string? self = null)
    {
        if (pattern is null || pattern == "*") return true;
        if (pattern == "self") return self is not null && display == self;
        if (pattern.Length > 2 && pattern[0] == '/' && pattern[^1] == '/')
        {
            try { return Regex.IsMatch(display, pattern[1..^1]); } catch { return false; }
        }
        return pattern == display || pattern == Strip(display);
    }

    static bool KindIs(TypeModel t, string kind) => kind switch
    {
        "class" => t.Kind is "class" or "record",
        "interface" => t.Kind == "interface",
        "abstract" => t.IsAbstract,
        "abstraction" => t.Kind == "interface" || t.IsAbstract,
        "concrete" => t.Kind is "class" or "record" && !t.IsAbstract && !t.IsStatic,
        "record" => t.Kind is "record" or "record struct",
        "struct" => t.Kind is "struct" or "record struct",
        "enum" => t.Kind == "enum",
        "static" => t.IsStatic,
        "sealed" => t.IsSealed,
        _ => true,
    };

    static bool Match(TypeModel t, TypeFilter f, AnalyzeResult r)
    {
        if (f.Kind is { } k && !KindIs(t, k)) return false;
        if (f.Name is { } n && !NameIs(n, t.Name)) return false;
        if (f.Implements is { } im)
        {
            if (im == "*" ? !t.Interfaces.Any() : !t.Interfaces.Any(i => NameIs(im, i))) return false;
        }
        if (f.Inherits is { } ih && (t.BaseType is null || !NameIs(ih, t.BaseType))) return false;
        if (f.Extends is { } ex && !((t.BaseType is not null && NameIs(ex, t.BaseType)) || t.Interfaces.Any(i => NameIs(ex, i)))) return false;
        if (f.Member is not null || f.MemberKind is not null)
        {
            if (!t.Members.Any(m => NameIs(f.Member, m.Name) && (f.MemberKind is null || m.Kind == f.MemberKind))) return false;
        }
        if (f.PrivateConstructor == true)
        {
            var ctors = t.Members.Where(m => m.Kind == "constructor").ToList();
            if (ctors.Count == 0 || ctors.Any(c => c.Access is "+" or "~")) return false;
        }
        if (f.Subtypes is { } st && r.Relations.Count(x => x.To == t.Name && x.Kind is "inherits" or "implements") < st) return false;
        if (f.Has is { } h && !r.Relations.Any(x => x.From == t.Name && x.Kind == "has" && NameIs(h, x.To, t.Name))) return false;
        if (f.Creates is { } c && !r.Relations.Any(x => x.From == t.Name && x.Kind == "creates" && NameIs(c, x.To, t.Name))) return false;
        if (f.ReturnsSelf is { } rs && t.Members.Count(m => m.Kind == "method" && !m.IsStatic && m.Type is not null && Strip(m.Type) == t.SimpleName) < rs) return false;
        if (f.AbstractMembers is { } am && t.Members.Count(m => m.IsAbstract) < am) return false;
        return true;
    }

    static bool MatchRelation(RelationModel x, RelationFilter f)
    {
        var kindOk = f.Kind switch
        {
            null or "*" => true,
            "extends" => x.Kind is "inherits" or "implements",
            _ => x.Kind == f.Kind,
        };
        return kindOk && NameIs(f.From, x.From) && NameIs(f.To, x.To, x.From);
    }

    public static void Evaluate(IReadOnlyList<StructureRule> rules, AnalyzeResult r)
    {
        int index = 0;
        foreach (var rule in rules)
        {
            index++;
            int actual;
            string unit;
            if (rule.Count is not null) { actual = r.Types.Count(t => Match(t, rule.Count, r)); unit = "개"; }
            else if (rule.Relation is not null) { actual = r.Relations.Count(x => MatchRelation(x, rule.Relation)); unit = "개"; }
            else if (!string.IsNullOrEmpty(rule.Uses)) { actual = r.Features.GetValueOrDefault(rule.Uses); unit = "번"; }
            else if (!string.IsNullOrEmpty(rule.Calls)) { actual = r.Calls.GetValueOrDefault(rule.Calls); unit = "번"; }
            else { actual = 0; unit = "개"; }

            int min = rule.Min ?? (rule.Max is null ? 1 : 0);
            bool ok = actual >= min && (rule.Max is null || actual <= rule.Max);
            string need = rule.Max switch
            {
                0 => "없어야 함",
                { } mx when mx == min => $"{min}{unit}",
                { } mx => $"{min}~{mx}{unit}",
                null => $"{min}{unit} 이상",
            };
            r.Rules.Add(new RuleResult
            {
                Id = rule.Id ?? index.ToString(),
                Text = rule.Text,
                Passed = ok,
                Actual = actual,
                Detail = $"지금 {actual}{unit} · 필요: {need}",
            });
        }
        r.RulesTotal = r.Rules.Count;
        r.RulesPassed = r.Rules.Count(x => x.Passed);
    }
}
