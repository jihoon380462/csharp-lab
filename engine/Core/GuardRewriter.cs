using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using static Microsoft.CodeAnalysis.CSharp.SyntaxFactory;

namespace CsEngine;

/// <summary>
/// 학습자 코드에 무한 반복·무한 재귀 보호 호출을 끼워 넣는다.
///  - 모든 반복문 본문 맨 앞: __LabGuard.Tick();
///  - 메서드/로컬 함수/생성자 본문: Enter(); try { 원래 본문 } finally { Exit(); }
/// 삽입하는 노드에는 줄바꿈이 없어서 원본 줄 번호가 그대로 유지된다.
/// </summary>
sealed class GuardRewriter : CSharpSyntaxRewriter
{
    static StatementSyntax Tick() => ParseStatement("__LabGuard.Tick();");
    static StatementSyntax Enter() => ParseStatement("__LabGuard.Enter();");
    static StatementSyntax Exit() => ParseStatement("__LabGuard.Exit();");

    static BlockSyntax WithTick(StatementSyntax body) =>
        body is BlockSyntax b
            ? b.WithStatements(b.Statements.Insert(0, Tick()))
            : Block(Tick(), body);

    // 줄바꿈(trivia)을 원본과 같은 횟수만 남겨 줄 번호를 보존한다.
    static BlockSyntax WrapDepth(BlockSyntax body)
    {
        var inner = body
            .WithOpenBraceToken(body.OpenBraceToken.WithLeadingTrivia())
            .WithCloseBraceToken(body.CloseBraceToken.WithTrailingTrivia());
        return Block(Enter(), TryStatement(inner, default, FinallyClause(Block(Exit()))))
            .WithOpenBraceToken(Token(SyntaxKind.OpenBraceToken).WithLeadingTrivia(body.OpenBraceToken.LeadingTrivia))
            .WithCloseBraceToken(Token(SyntaxKind.CloseBraceToken).WithTrailingTrivia(body.CloseBraceToken.TrailingTrivia));
    }

    static bool IsVoidLike(TypeSyntax returnType, SyntaxTokenList modifiers)
    {
        if (returnType is PredefinedTypeSyntax p && p.Keyword.IsKind(SyntaxKind.VoidKeyword)) return true;
        if (modifiers.Any(SyntaxKind.AsyncKeyword))
        {
            SimpleNameSyntax? name = returnType switch
            {
                QualifiedNameSyntax q => q.Right,
                SimpleNameSyntax s => s,
                _ => null,
            };
            if (name is IdentifierNameSyntax id && id.Identifier.Text is "Task" or "ValueTask") return true;
        }
        return false;
    }

    static BlockSyntax ExpressionToBlock(ArrowExpressionClauseSyntax arrow, bool voidLike)
    {
        var expr = arrow.Expression;
        StatementSyntax stmt = expr switch
        {
            ThrowExpressionSyntax t => ThrowStatement(t.Expression),
            _ when voidLike => ExpressionStatement(expr),
            _ => ReturnStatement(expr),
        };
        return Block(stmt);
    }

    // ── 반복문 ──
    public override SyntaxNode? VisitWhileStatement(WhileStatementSyntax node)
    {
        var n = (WhileStatementSyntax)base.VisitWhileStatement(node)!;
        return n.WithStatement(WithTick(n.Statement));
    }

    public override SyntaxNode? VisitDoStatement(DoStatementSyntax node)
    {
        var n = (DoStatementSyntax)base.VisitDoStatement(node)!;
        return n.WithStatement(WithTick(n.Statement));
    }

    public override SyntaxNode? VisitForStatement(ForStatementSyntax node)
    {
        var n = (ForStatementSyntax)base.VisitForStatement(node)!;
        return n.WithStatement(WithTick(n.Statement));
    }

    public override SyntaxNode? VisitForEachStatement(ForEachStatementSyntax node)
    {
        var n = (ForEachStatementSyntax)base.VisitForEachStatement(node)!;
        return n.WithStatement(WithTick(n.Statement));
    }

    public override SyntaxNode? VisitForEachVariableStatement(ForEachVariableStatementSyntax node)
    {
        var n = (ForEachVariableStatementSyntax)base.VisitForEachVariableStatement(node)!;
        return n.WithStatement(WithTick(n.Statement));
    }

    // ── 메서드류 (재귀 깊이) ──
    public override SyntaxNode? VisitMethodDeclaration(MethodDeclarationSyntax node)
    {
        var n = (MethodDeclarationSyntax)base.VisitMethodDeclaration(node)!;
        if (n.Body is not null)
            return n.WithBody(WrapDepth(n.Body));
        if (n.ExpressionBody is not null)
        {
            var block = ExpressionToBlock(n.ExpressionBody, IsVoidLike(n.ReturnType, n.Modifiers));
            return n.WithExpressionBody(null).WithSemicolonToken(default).WithBody(WrapDepth(block))
                    .WithTrailingTrivia(n.GetTrailingTrivia());
        }
        return n;
    }

    public override SyntaxNode? VisitLocalFunctionStatement(LocalFunctionStatementSyntax node)
    {
        var n = (LocalFunctionStatementSyntax)base.VisitLocalFunctionStatement(node)!;
        if (n.Body is not null)
            return n.WithBody(WrapDepth(n.Body));
        if (n.ExpressionBody is not null)
        {
            var block = ExpressionToBlock(n.ExpressionBody, IsVoidLike(n.ReturnType, n.Modifiers));
            return n.WithExpressionBody(null).WithSemicolonToken(default).WithBody(WrapDepth(block))
                    .WithTrailingTrivia(n.GetTrailingTrivia());
        }
        return n;
    }

    public override SyntaxNode? VisitConstructorDeclaration(ConstructorDeclarationSyntax node)
    {
        var n = (ConstructorDeclarationSyntax)base.VisitConstructorDeclaration(node)!;
        return n.Body is not null ? n.WithBody(WrapDepth(n.Body)) : n;
    }
}
