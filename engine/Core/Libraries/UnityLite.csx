// UnityLite — Unity(UnityEngine) API 를 흉내 낸 작은 라이브러리. 엔진이 Unity 모드에서 학습자 코드와 함께 컴파일한다.
// 실제 Unity 와 다른 점은 docs/REFERENCE.md "Unity 모드" 절 참고. 이 파일은 엔진 리소스(lib.UnityLite.cs)로 들어간다 (engine/LabRefs.props).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Text;
using System.Threading.Tasks;

namespace UnityEngine
{
    /// <summary>시뮬레이터 전용: 이 표시가 붙은 MonoBehaviour 는 시작할 때 자동으로 만들어지지 않는다(Unity 의 프리팹처럼 코드에서 AddComponent 로 만든다).</summary>
    [AttributeUsage(AttributeTargets.Class)]
    public sealed class PrefabAttribute : Attribute { }

    public class UnityException : Exception { public UnityException(string m) : base(m) { } }
    public class MissingComponentException : Exception { public MissingComponentException(string m) : base(m) { } }

    public struct Vector3 : IEquatable<Vector3>
    {
        public float x, y, z;
        public Vector3(float x, float y, float z = 0f) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 zero => new(0, 0, 0);
        public static Vector3 one => new(1, 1, 1);
        public static Vector3 up => new(0, 1, 0);
        public static Vector3 down => new(0, -1, 0);
        public static Vector3 left => new(-1, 0, 0);
        public static Vector3 right => new(1, 0, 0);
        public static Vector3 forward => new(0, 0, 1);
        public static Vector3 back => new(0, 0, -1);
        public float magnitude => MathF.Sqrt(x * x + y * y + z * z);
        public float sqrMagnitude => x * x + y * y + z * z;
        public Vector3 normalized { get { var m = magnitude; return m > 1e-5f ? this / m : zero; } }
        public static Vector3 operator +(Vector3 a, Vector3 b) => new(a.x + b.x, a.y + b.y, a.z + b.z);
        public static Vector3 operator -(Vector3 a, Vector3 b) => new(a.x - b.x, a.y - b.y, a.z - b.z);
        public static Vector3 operator -(Vector3 a) => new(-a.x, -a.y, -a.z);
        public static Vector3 operator *(Vector3 a, float d) => new(a.x * d, a.y * d, a.z * d);
        public static Vector3 operator *(float d, Vector3 a) => new(a.x * d, a.y * d, a.z * d);
        public static Vector3 operator /(Vector3 a, float d) => new(a.x / d, a.y / d, a.z / d);
        public static bool operator ==(Vector3 a, Vector3 b) => (a - b).sqrMagnitude < 1e-10f;
        public static bool operator !=(Vector3 a, Vector3 b) => !(a == b);
        public bool Equals(Vector3 o) => this == o;
        public override bool Equals(object obj) => obj is Vector3 v && this == v;
        public override int GetHashCode() => HashCode.Combine(x, y, z);
        public static float Distance(Vector3 a, Vector3 b) => (a - b).magnitude;
        public static float Dot(Vector3 a, Vector3 b) => a.x * b.x + a.y * b.y + a.z * b.z;
        public static Vector3 Lerp(Vector3 a, Vector3 b, float t) { t = Mathf.Clamp01(t); return a + (b - a) * t; }
        public static Vector3 MoveTowards(Vector3 cur, Vector3 target, float maxDelta)
        {
            var d = target - cur; var m = d.magnitude;
            return m <= maxDelta || m < 1e-6f ? target : cur + d / m * maxDelta;
        }
        public static Vector3 ClampMagnitude(Vector3 v, float max) => v.sqrMagnitude > max * max ? v.normalized * max : v;
        public override string ToString() => string.Format(CultureInfo.InvariantCulture, "({0:F2}, {1:F2}, {2:F2})", x, y, z);
    }

    public struct Vector2 : IEquatable<Vector2>
    {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 zero => new(0, 0);
        public static Vector2 one => new(1, 1);
        public static Vector2 up => new(0, 1);
        public static Vector2 down => new(0, -1);
        public static Vector2 left => new(-1, 0);
        public static Vector2 right => new(1, 0);
        public float magnitude => MathF.Sqrt(x * x + y * y);
        public float sqrMagnitude => x * x + y * y;
        public Vector2 normalized { get { var m = magnitude; return m > 1e-5f ? this / m : zero; } }
        public static Vector2 operator +(Vector2 a, Vector2 b) => new(a.x + b.x, a.y + b.y);
        public static Vector2 operator -(Vector2 a, Vector2 b) => new(a.x - b.x, a.y - b.y);
        public static Vector2 operator -(Vector2 a) => new(-a.x, -a.y);
        public static Vector2 operator *(Vector2 a, float d) => new(a.x * d, a.y * d);
        public static Vector2 operator *(float d, Vector2 a) => new(a.x * d, a.y * d);
        public static Vector2 operator /(Vector2 a, float d) => new(a.x / d, a.y / d);
        public static bool operator ==(Vector2 a, Vector2 b) => (a - b).sqrMagnitude < 1e-10f;
        public static bool operator !=(Vector2 a, Vector2 b) => !(a == b);
        public bool Equals(Vector2 o) => this == o;
        public override bool Equals(object obj) => obj is Vector2 v && this == v;
        public override int GetHashCode() => HashCode.Combine(x, y);
        public static implicit operator Vector3(Vector2 v) => new(v.x, v.y, 0);
        public static implicit operator Vector2(Vector3 v) => new(v.x, v.y);
        public static float Distance(Vector2 a, Vector2 b) => (a - b).magnitude;
        public static float Dot(Vector2 a, Vector2 b) => a.x * b.x + a.y * b.y;
        public static Vector2 Lerp(Vector2 a, Vector2 b, float t) { t = Mathf.Clamp01(t); return a + (b - a) * t; }
        public static Vector2 MoveTowards(Vector2 cur, Vector2 target, float maxDelta) => (Vector2)Vector3.MoveTowards(cur, target, maxDelta);
        public override string ToString() => string.Format(CultureInfo.InvariantCulture, "({0:F2}, {1:F2})", x, y);
    }

    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a = 1f) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static Color red => new(1, 0, 0);
        public static Color green => new(0, 1, 0);
        public static Color blue => new(0, 0, 1);
        public static Color white => new(1, 1, 1);
        public static Color black => new(0, 0, 0);
        public static Color yellow => new(1, 0.92f, 0.016f);
        public static Color cyan => new(0, 1, 1);
        public static Color magenta => new(1, 0, 1);
        public static Color gray => new(0.5f, 0.5f, 0.5f);
        public static Color grey => gray;
        public static Color clear => new(0, 0, 0, 0);
        public static Color Lerp(Color x, Color y, float t) { t = Mathf.Clamp01(t); return new(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t, x.a + (y.a - x.a) * t); }
        internal string Hex()
        {
            int C(float v) => (int)MathF.Round(Mathf.Clamp01(v) * 255);
            return "#" + C(r).ToString("x2") + C(g).ToString("x2") + C(b).ToString("x2") + C(a).ToString("x2");
        }
        public override string ToString() => string.Format(CultureInfo.InvariantCulture, "RGBA({0:F3}, {1:F3}, {2:F3}, {3:F3})", r, g, b, a);
    }

    public static class Mathf
    {
        public const float PI = MathF.PI;
        public const float Infinity = float.PositiveInfinity;
        public const float Deg2Rad = MathF.PI / 180f;
        public const float Rad2Deg = 180f / MathF.PI;
        public const float Epsilon = float.Epsilon;
        public static float Sin(float f) => MathF.Sin(f);
        public static float Cos(float f) => MathF.Cos(f);
        public static float Tan(float f) => MathF.Tan(f);
        public static float Atan2(float y, float x) => MathF.Atan2(y, x);
        public static float Sqrt(float f) => MathF.Sqrt(f);
        public static float Pow(float f, float p) => MathF.Pow(f, p);
        public static float Abs(float f) => MathF.Abs(f);
        public static int Abs(int v) => Math.Abs(v);
        public static float Min(float a, float b) => MathF.Min(a, b);
        public static int Min(int a, int b) => Math.Min(a, b);
        public static float Max(float a, float b) => MathF.Max(a, b);
        public static int Max(int a, int b) => Math.Max(a, b);
        public static float Clamp(float v, float min, float max) => v < min ? min : v > max ? max : v;
        public static int Clamp(int v, int min, int max) => v < min ? min : v > max ? max : v;
        public static float Clamp01(float v) => v < 0 ? 0 : v > 1 ? 1 : v;
        public static float Lerp(float a, float b, float t) => a + (b - a) * Clamp01(t);
        public static float MoveTowards(float cur, float target, float maxDelta) => MathF.Abs(target - cur) <= maxDelta ? target : cur + MathF.Sign(target - cur) * maxDelta;
        public static float Round(float f) => MathF.Round(f);
        public static int RoundToInt(float f) => (int)MathF.Round(f);
        public static float Floor(float f) => MathF.Floor(f);
        public static int FloorToInt(float f) => (int)MathF.Floor(f);
        public static float Ceil(float f) => MathF.Ceiling(f);
        public static int CeilToInt(float f) => (int)MathF.Ceiling(f);
        public static float Sign(float f) => f >= 0f ? 1f : -1f;
        public static bool Approximately(float a, float b) => MathF.Abs(b - a) < MathF.Max(1e-6f * MathF.Max(MathF.Abs(a), MathF.Abs(b)), 1e-6f);
        public static float Repeat(float t, float length) => Clamp(t - MathF.Floor(t / length) * length, 0f, length);
        public static float PingPong(float t, float length) { t = Repeat(t, length * 2f); return length - MathF.Abs(t - length); }
    }

    public static class Time
    {
        public static float deltaTime { get; internal set; }
        public static float time { get; internal set; }
        public static int frameCount { get; internal set; }
        public static float fixedDeltaTime { get; internal set; } = 0.02f;
        public static float timeScale { get; set; } = 1f;
    }

    public static class Debug
    {
        public static void Log(object message) => Console.WriteLine(message?.ToString() ?? "Null");
        public static void LogWarning(object message) => Console.WriteLine("⚠ " + (message?.ToString() ?? "Null"));
        public static void LogError(object message) => Console.WriteLine("❌ " + (message?.ToString() ?? "Null"));
    }

    public enum KeyCode
    {
        None, LeftArrow, RightArrow, UpArrow, DownArrow, Space, Return, Escape, LeftShift,
        A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
        Alpha0, Alpha1, Alpha2, Alpha3, Alpha4, Alpha5, Alpha6, Alpha7, Alpha8, Alpha9,
    }

    public static class Input
    {
        static HashSet<KeyCode> _now = new(), _prev = new();
        internal static void SetKeys(IEnumerable<KeyCode> keys) { _prev = _now; _now = new HashSet<KeyCode>(keys); }
        public static bool GetKey(KeyCode k) => _now.Contains(k);
        public static bool GetKeyDown(KeyCode k) => _now.Contains(k) && !_prev.Contains(k);
        public static bool GetKeyUp(KeyCode k) => !_now.Contains(k) && _prev.Contains(k);
        public static bool anyKey => _now.Count > 0;
        public static bool anyKeyDown => _now.Any(k => !_prev.Contains(k));
        /// <summary>"Horizontal"(←→, A D) / "Vertical"(↑↓, W S). 실제 Unity 와 달리 부드럽게 변하지 않고 -1·0·1 (GetAxisRaw 와 같음)</summary>
        public static float GetAxis(string axis) => GetAxisRaw(axis);
        public static float GetAxisRaw(string axis) => axis switch
        {
            "Horizontal" => (GetKey(KeyCode.RightArrow) || GetKey(KeyCode.D) ? 1f : 0f) - (GetKey(KeyCode.LeftArrow) || GetKey(KeyCode.A) ? 1f : 0f),
            "Vertical" => (GetKey(KeyCode.UpArrow) || GetKey(KeyCode.W) ? 1f : 0f) - (GetKey(KeyCode.DownArrow) || GetKey(KeyCode.S) ? 1f : 0f),
            _ => throw new UnityException("입력 축 '" + axis + "' 은 없습니다. (Horizontal, Vertical 만)"),
        };
    }

    public static class Random
    {
        static System.Random _r = new(0);
        public static void InitState(int seed) => _r = new System.Random(seed);
        /// <summary>정수: min 이상 max 미만</summary>
        public static int Range(int min, int max) => max <= min ? min : _r.Next(min, max);
        /// <summary>실수: min 이상 max 이하</summary>
        public static float Range(float min, float max) => min + (float)_r.NextDouble() * (max - min);
        public static float value => (float)_r.NextDouble();
        public static Vector2 insideUnitCircle { get { var a = Range(0f, Mathf.PI * 2); var d = MathF.Sqrt(value); return new Vector2(MathF.Cos(a) * d, MathF.Sin(a) * d); } }
    }

    public class Object
    {
        public string name { get; set; } = "";
        internal bool _destroyed;
        public static void Destroy(Object obj) { if (obj is not null) Scene.QueueDestroy(obj); }
        public static T FindObjectOfType<T>() where T : Component => Scene.Alive().SelectMany(g => g.Components).OfType<T>().FirstOrDefault();
        public static T[] FindObjectsOfType<T>() where T : Component => Scene.Alive().SelectMany(g => g.Components).OfType<T>().ToArray();
        public override string ToString() => name;
        public static implicit operator bool(Object o) => o is not null && !o._destroyed;
    }

    public class Component : Object
    {
        public GameObject gameObject { get; internal set; }
        public Transform transform => gameObject.transform;
        public new string name { get => gameObject.name; set => gameObject.name = value; }
        public string tag { get => gameObject.tag; set => gameObject.tag = value; }
        public T GetComponent<T>() where T : Component => gameObject.GetComponent<T>();
        public bool CompareTag(string t) => gameObject.tag == t;
        public override string ToString() => gameObject.name + " (" + GetType().Name + ")";
    }

    public enum Space { Self, World }

    public sealed class Transform : Component
    {
        public Vector3 position { get; set; } = Vector3.zero;
        public Vector3 localScale { get; set; } = Vector3.one;
        /// <summary>회전(도). 2D 시뮬레이터라 z 회전만 화면에 반영된다.</summary>
        public Vector3 eulerAngles { get; set; } = Vector3.zero;
        public Vector3 right => new(MathF.Cos(eulerAngles.z * Mathf.Deg2Rad), MathF.Sin(eulerAngles.z * Mathf.Deg2Rad), 0);
        public Vector3 up => new(-MathF.Sin(eulerAngles.z * Mathf.Deg2Rad), MathF.Cos(eulerAngles.z * Mathf.Deg2Rad), 0);
        /// <summary>Unity 처럼 기본은 자기 기준(Space.Self): 회전한 방향으로 움직인다.</summary>
        public void Translate(Vector3 d, Space space = Space.Self) => position += space == Space.World ? d : right * d.x + up * d.y + new Vector3(0, 0, d.z);
        public void Translate(float x, float y, float z = 0f, Space space = Space.Self) => Translate(new Vector3(x, y, z), space);
        public void Rotate(Vector3 e) => eulerAngles += e;
        public void Rotate(float x, float y, float z) => eulerAngles += new Vector3(x, y, z);
        public void LookAt2D(Vector3 target) { var d = target - position; eulerAngles = new Vector3(0, 0, MathF.Atan2(d.y, d.x) * Mathf.Rad2Deg); }
    }

    /// <summary>시뮬레이터 전용 모양 (실제 Unity 는 sprite 이미지)</summary>
    public enum Shape { Square, Circle, Triangle }

    public sealed class SpriteRenderer : Component
    {
        public Color color { get; set; } = Color.white;
        public Shape shape { get; set; } = Shape.Square;
        public int sortingOrder { get; set; }
        public bool enabled { get; set; } = true;
    }

    public class Behaviour : Component
    {
        public bool enabled { get; set; } = true;
    }

    public class MonoBehaviour : Behaviour
    {
        internal bool _awoken, _started;
        public static void print(object message) => Debug.Log(message);
    }

    public sealed class GameObject : Object
    {
        internal readonly List<Component> Components = new();
        public Transform transform { get; }
        public bool activeSelf { get; private set; } = true;
        public string tag { get; set; } = "Untagged";

        public GameObject() : this("GameObject") { }
        public GameObject(string name)
        {
            this.name = name;
            transform = new Transform { gameObject = this };
            Components.Add(transform);
            Components.Add(new SpriteRenderer { gameObject = this });
            Scene.Add(this);
        }

        public void SetActive(bool value) => activeSelf = value;

        public T AddComponent<T>() where T : Component, new() => (T)AddComponent(typeof(T));

        public Component AddComponent(Type type)
        {
            if (type == typeof(Transform) || type == typeof(SpriteRenderer)) return GetComponent(type);
            var c = (Component)Activator.CreateInstance(type);
            c.gameObject = this;
            Components.Add(c);
            if (c is MonoBehaviour mb) Scene.Awake(mb);
            return c;
        }

        public T GetComponent<T>() where T : Component => (T)GetComponent(typeof(T));
        public Component GetComponent(Type t) => Components.FirstOrDefault(c => t.IsInstanceOfType(c) && !c._destroyed);

        public static GameObject Find(string name) => Scene.Alive().FirstOrDefault(g => g.name == name);
        public static GameObject[] FindGameObjectsWithTag(string tag) => Scene.Alive().Where(g => g.tag == tag).ToArray();
    }

    /// <summary>장면 관리(엔진 내부용)</summary>
    internal static class Scene
    {
        internal static readonly List<GameObject> Objects = new();
        static readonly List<Object> _destroyQueue = new();
        static readonly Dictionary<(Type, string), MethodInfo> _methods = new();

        internal static void Add(GameObject g) => Objects.Add(g);
        internal static IEnumerable<GameObject> Alive() => Objects.Where(g => !g._destroyed);
        internal static void QueueDestroy(Object o) => _destroyQueue.Add(o);

        internal static MethodInfo Method(Type t, string name)
        {
            if (_methods.TryGetValue((t, name), out var m)) return m;
            for (var cur = t; cur is not null && cur != typeof(MonoBehaviour); cur = cur.BaseType)
            {
                m = cur.GetMethod(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly, null, Type.EmptyTypes, null);
                if (m is not null) break;
            }
            _methods[(t, name)] = m;
            return m;
        }

        internal static void Call(MonoBehaviour mb, string name)
        {
            var m = Method(mb.GetType(), name);
            if (m is null) return;
            try { m.Invoke(mb, null); }
            catch (TargetInvocationException e) when (e.InnerException is not null) { ExceptionDispatchInfo.Capture(e.InnerException).Throw(); }
        }

        internal static void Awake(MonoBehaviour mb)
        {
            if (mb._awoken) return;
            mb._awoken = true;
            Call(mb, "Awake");
        }

        internal static void FlushDestroy()
        {
            if (_destroyQueue.Count == 0) return;
            var list = _destroyQueue.ToList();
            _destroyQueue.Clear();
            foreach (var o in list)
            {
                if (o._destroyed) continue;
                if (o is GameObject g)
                {
                    foreach (var mb in g.Components.OfType<MonoBehaviour>()) Call(mb, "OnDestroy");
                    g._destroyed = true;
                    foreach (var c in g.Components) c._destroyed = true;
                }
                else if (o is Component c)
                {
                    if (c is MonoBehaviour mb) Call(mb, "OnDestroy");
                    c._destroyed = true;
                }
            }
            Objects.RemoveAll(g => g._destroyed);
        }

        internal static string Snapshot()
        {
            var sb = new StringBuilder();
            var inv = CultureInfo.InvariantCulture;
            foreach (var g in Alive())
            {
                if (!g.activeSelf) continue;
                var sr = g.GetComponent<SpriteRenderer>();
                if (sr is null || !sr.enabled) continue;
                var t = g.transform;
                sb.Append(g.name.Replace('\t', ' ').Replace('\n', ' ')).Append('\t')
                  .Append(t.position.x.ToString("0.###", inv)).Append('\t')
                  .Append(t.position.y.ToString("0.###", inv)).Append('\t')
                  .Append(t.eulerAngles.z.ToString("0.#", inv)).Append('\t')
                  .Append(t.localScale.x.ToString("0.###", inv)).Append('\t')
                  .Append(t.localScale.y.ToString("0.###", inv)).Append('\t')
                  .Append(sr.shape.ToString()).Append('\t')
                  .Append(sr.color.Hex()).Append('\t')
                  .Append(sr.sortingOrder.ToString(inv)).Append('\n');
            }
            return sb.ToString();
        }
    }
}

/// <summary>Unity 모드 프레임 루프. 엔진이 정적 필드를 설정한 뒤 Main 을 실행한다.</summary>
public static class UnityLiteHost
{
    public static int Frames = 60;               // 0 = 멈출 때까지 (실시간 모드)
    public static bool Live;
    public static float FixedDelta = 1f / 60f;
    public static string InputScript;
    public static int Seed;
    public static Func<string> InputProvider;    // 실시간: 눌린 키 이름 "LeftArrow,Space"
    public static Action<string> FrameSink;      // 실시간: 프레임마다 장면 상태
    public const int FrameBudgetMs = 2000;

    public static async Task Main()
    {
        UnityEngine.Random.InitState(Live ? Environment.TickCount : Seed);
        var script = ParseScript(InputScript);

        // 장면 시작: MonoBehaviour 클래스마다 오브젝트 하나씩 ([Prefab] 이 붙은 것은 제외)
        var types = typeof(UnityLiteHost).Assembly.GetTypes()
            .Where(t => t.IsClass && !t.IsAbstract && t.IsSubclassOf(typeof(UnityEngine.MonoBehaviour)) && t.Namespace != "UnityEngine"
                        && t.GetCustomAttribute<UnityEngine.PrefabAttribute>() is null
                        && t.GetConstructor(Type.EmptyTypes) is not null)
            .ToList();
        __LabGuard.Deadline = Environment.TickCount64 + FrameBudgetMs;
        foreach (var t in types) new UnityEngine.GameObject(t.Name).AddComponent(t);

        var last = Environment.TickCount64;
        for (int frame = 0; Frames == 0 || frame < Frames; frame++)
        {
            __LabGuard.Deadline = Environment.TickCount64 + FrameBudgetMs;
            long now = Environment.TickCount64;
            float dt = Live ? Math.Clamp((now - last) / 1000f, 0.001f, 0.1f) : FixedDelta;
            last = now;
            UnityEngine.Time.deltaTime = dt * UnityEngine.Time.timeScale;
            UnityEngine.Time.time += UnityEngine.Time.deltaTime;
            UnityEngine.Time.frameCount = frame + 1;

            var keys = Live ? Keys(InputProvider?.Invoke() ?? "") : (script.TryGetValue(frame, out var k) ? k : new List<UnityEngine.KeyCode>());
            UnityEngine.Input.SetKeys(keys);

            // 이번 프레임 시작 시점의 컴포넌트만 (중간에 생긴 것은 다음 프레임부터)
            var behaviours = UnityEngine.Scene.Alive().Where(g => g.activeSelf)
                .SelectMany(g => g.Components.OfType<UnityEngine.MonoBehaviour>()).ToList();
            foreach (var mb in behaviours)
                if (!mb._started && mb.enabled && !mb._destroyed) { mb._started = true; UnityEngine.Scene.Call(mb, "Start"); }
            foreach (var mb in behaviours)
                if (mb._started && mb.enabled && !mb._destroyed && mb.gameObject.activeSelf) UnityEngine.Scene.Call(mb, "Update");
            foreach (var mb in behaviours)
                if (mb._started && mb.enabled && !mb._destroyed && mb.gameObject.activeSelf) UnityEngine.Scene.Call(mb, "LateUpdate");
            UnityEngine.Scene.FlushDestroy();

            if (Live)
            {
                Console.Out.Flush();   // 이번 프레임의 Debug.Log 를 바로 화면으로
                FrameSink?.Invoke(UnityEngine.Scene.Snapshot());
                int wait = 16 - (int)(Environment.TickCount64 - now);
                await Task.Delay(Math.Max(1, wait));
            }
        }
    }

    static List<UnityEngine.KeyCode> Keys(string s)
    {
        var list = new List<UnityEngine.KeyCode>();
        foreach (var part in s.Split(new[] { ',', '+', ' ' }, StringSplitOptions.RemoveEmptyEntries))
            if (Enum.TryParse<UnityEngine.KeyCode>(part, true, out var k)) list.Add(k);
        return list;
    }

    /// <summary>"0-59:RightArrow;60-60:Space+UpArrow" → 프레임별 키 목록</summary>
    static Dictionary<int, List<UnityEngine.KeyCode>> ParseScript(string script)
    {
        var map = new Dictionary<int, List<UnityEngine.KeyCode>>();
        if (string.IsNullOrWhiteSpace(script)) return map;
        foreach (var seg in script.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var p = seg.Split(':', 2);
            if (p.Length != 2) continue;
            var range = p[0].Split('-');
            if (!int.TryParse(range[0].Trim(), out var a)) continue;
            var b = range.Length > 1 && int.TryParse(range[1].Trim(), out var bb) ? bb : a;
            var keys = Keys(p[1]);
            for (int f = a; f <= b && f < 100000; f++)
            {
                if (!map.TryGetValue(f, out var l)) map[f] = l = new List<UnityEngine.KeyCode>();
                l.AddRange(keys);
            }
        }
        return map;
    }
}
