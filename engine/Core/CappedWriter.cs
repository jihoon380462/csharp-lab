namespace CsEngine;

sealed class OutputLimitException : Exception { }

/// <summary>출력 상한을 넘으면 예외를 던져 프로그램을 멈추는 Writer. 실행 중에도 일정 간격으로 출력을 흘려보낸다.</summary>
sealed class CappedWriter : StringWriter
{
    readonly int _max;
    readonly Action<string>? _sink;
    int _sent;
    long _lastSend = Environment.TickCount64;
    public bool LimitHit { get; private set; }
    public CappedWriter(int max, Action<string>? sink) { _max = max; _sink = sink; }

    void Check()
    {
        if (LimitHit) throw new OutputLimitException();
        var sb = GetStringBuilder();
        if (sb.Length > _max)
        {
            LimitHit = true;
            sb.Length = _max;
            throw new OutputLimitException();
        }
        // 첫 출력은 바로, 그다음은 0.1초마다 바깥으로
        if (_sink is not null && (_sent == 0 || Environment.TickCount64 - _lastSend >= 100)) Pump();
    }

    /// <summary>아직 안 보낸 출력을 바깥으로 보낸다.</summary>
    public void Pump()
    {
        if (_sink is null) return;
        _lastSend = Environment.TickCount64;
        var sb = GetStringBuilder();
        if (sb.Length <= _sent) return;
        var chunk = sb.ToString(_sent, sb.Length - _sent);
        _sent = sb.Length;
        try { _sink(chunk); } catch { }
    }

    /// <summary>Console.Out.Flush() → 쌓인 출력 바로 보내기 (Unity 모드는 프레임마다 부름)</summary>
    public override void Flush() => Pump();

    public override void Write(char value) { if (LimitHit) throw new OutputLimitException(); base.Write(value); Check(); }
    public override void Write(string? value) { if (LimitHit) throw new OutputLimitException(); base.Write(value); Check(); }
    public override void Write(char[] buffer, int index, int count) { if (LimitHit) throw new OutputLimitException(); base.Write(buffer, index, count); Check(); }
    public override void Write(ReadOnlySpan<char> buffer) { if (LimitHit) throw new OutputLimitException(); base.Write(buffer); Check(); }
    public override void WriteLine(ReadOnlySpan<char> buffer) { if (LimitHit) throw new OutputLimitException(); base.WriteLine(buffer); Check(); }
}
