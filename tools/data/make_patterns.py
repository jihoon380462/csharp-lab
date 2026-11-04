# 디자인 패턴 실험 데이터(patterns.json)를 만든다. 이 파일을 고치고 다시 실행:
#   python3 tools/data/make_patterns.py
# 결과: engine/wwwroot/labs/patterns/patterns.json (실험 페이지와 데스크톱 테스트가 함께 씀)
import json, os

P = []
def pat(id, cat, name, en, when, idea, code, expect, rules):
    P.append(dict(id=id, cat=cat, name=name, en=en, when=when, idea=idea, code=code.strip("\n") + "\n", expect=expect, rules=rules))

def R(text, **kw): d = {"text": text}; d.update(kw); return d

# ───────────── 생성 ─────────────
pat("singleton", "생성", "싱글턴", "Singleton",
    "설정·로그처럼 프로그램 전체에 딱 하나만 있어야 하는 객체",
    "생성자를 막고(private), 하나뿐인 인스턴스를 static 으로 꺼내 쓴다.",
r'''
var a = Config.Instance;
var b = Config.Instance;
Console.WriteLine(ReferenceEquals(a, b));   // 같은 객체인가?
Console.WriteLine(a.Volume);

sealed class Config
{
    // 처음 꺼낼 때 한 번만 만든다
    static readonly Lazy<Config> _instance = new(() => new Config());
    public static Config Instance => _instance.Value;

    public int Volume { get; set; } = 7;

    private Config()   // 밖에서 new Config() 를 못 하게
    {
        Console.WriteLine("설정 생성");
    }
}
''', "설정 생성\nTrue\n7\n", [
    R("생성자를 private 으로 막은 클래스", count={"kind": "class", "privateConstructor": True}),
    R("자기 자신을 담는 static 필드·속성", count={"kind": "class", "has": "self"}),
])

pat("factory-method", "생성", "팩토리 메서드", "Factory Method",
    "어떤 객체를 만들지 실행 중에 정해야 할 때 (적 종류, 문서 종류 …)",
    "만드는 일을 한곳(메서드)에 모으고, 쓰는 쪽은 공통 부모 타입만 안다.",
r'''
foreach (var kind in new[] { "slime", "orc" })
{
    Enemy e = EnemyFactory.Create(kind);
    Console.WriteLine($"{e.Name}: {e.Cry()}");
}

static class EnemyFactory
{
    public static Enemy Create(string kind) => kind switch
    {
        "slime" => new Slime(),
        "orc" => new Orc(),
        _ => throw new ArgumentException("모르는 적: " + kind),
    };
}

abstract class Enemy
{
    public abstract string Name { get; }
    public abstract string Cry();
}

class Slime : Enemy
{
    public override string Name => "슬라임";
    public override string Cry() => "말랑";
}

class Orc : Enemy
{
    public override string Name => "오크";
    public override string Cry() => "우오오";
}
''', "슬라임: 말랑\n오크: 우오오\n", [
    R("자식이 2개 이상인 공통 부모(추상 클래스·인터페이스)", count={"kind": "abstraction", "subtypes": 2}),
    R("부모 타입을 돌려주며 자식들을 new 하는 공장", count={"creates": "Slime"}),
    R("공장이 2종류 이상 만든다", relation={"from": "EnemyFactory", "kind": "creates"}, min=2),
])

pat("abstract-factory", "생성", "추상 팩토리", "Abstract Factory",
    "서로 어울리는 부품 묶음(다크 테마 버튼+패널 …)을 통째로 바꿔 끼울 때",
    "부품마다 인터페이스를 두고, 묶음을 만드는 공장도 인터페이스로 만든다.",
r'''
IUiFactory factory = new DarkFactory();     // LightFactory 로 바꾸면 전부 바뀜
Console.WriteLine(factory.CreateButton().Draw());
Console.WriteLine(factory.CreatePanel().Draw());

interface IButton { string Draw(); }
interface IPanel { string Draw(); }

interface IUiFactory
{
    IButton CreateButton();
    IPanel CreatePanel();
}

class DarkFactory : IUiFactory
{
    public IButton CreateButton() => new DarkButton();
    public IPanel CreatePanel() => new DarkPanel();
}

class DarkButton : IButton { public string Draw() => "[검은 버튼]"; }
class DarkPanel : IPanel { public string Draw() => "[검은 패널]"; }
''', "[검은 버튼]\n[검은 패널]\n", [
    R("인터페이스 3개 이상 (공장 1 + 부품 2)", count={"kind": "interface"}, min=3),
    R("공장 인터페이스를 구현한 구체 공장", count={"implements": "IUiFactory"}),
    R("구체 공장이 부품 2종류 이상을 만든다", relation={"from": "DarkFactory", "kind": "creates"}, min=2),
])

pat("builder", "생성", "빌더", "Builder",
    "선택 항목이 많은 객체를 단계별로 조립할 때",
    "조립 메서드가 자기 자신(this)을 돌려줘서 . 으로 이어 쓰고, 마지막에 Build().",
r'''
var pizza = new PizzaBuilder()
    .Size("L")
    .Add("치즈")
    .Add("버섯")
    .Build();
Console.WriteLine(pizza);

record Pizza(string Size, List<string> Toppings)
{
    public override string ToString() => $"{Size}: {string.Join(", ", Toppings)}";
}

class PizzaBuilder
{
    string _size = "M";
    readonly List<string> _toppings = new();

    public PizzaBuilder Size(string size) { _size = size; return this; }
    public PizzaBuilder Add(string topping) { _toppings.Add(topping); return this; }
    public Pizza Build() => new Pizza(_size, new List<string>(_toppings));
}
''', "L: 치즈, 버섯\n", [
    R("자기 자신을 돌려주는 메서드 2개 이상 (메서드 연결)", count={"returnsSelf": 2}),
    R("완성품을 만드는 Build", count={"member": "Build", "memberKind": "method"}),
    R("빌더가 완성품을 new 한다", relation={"from": "PizzaBuilder", "to": "Pizza", "kind": "creates"}),
])

pat("prototype", "생성", "프로토타입", "Prototype",
    "만들기 비싼 객체를 복사해서 조금만 바꿔 쓸 때",
    "객체가 스스로를 복제하는 메서드를 가진다. 얕은 복사와 깊은 복사의 차이에 주의.",
r'''
var original = new Sheep { Name = "돌리", Tags = new() { "흰색" } };

var deep = original.DeepClone();
deep.Tags.Add("깊은복제");            // 원본 목록은 그대로

var shallow = original.ShallowClone();
shallow.Tags.Add("얕은복제");         // 원본과 같은 목록을 함께 씀!

Console.WriteLine(string.Join(",", original.Tags));
Console.WriteLine(string.Join(",", deep.Tags));

class Sheep
{
    public string Name = "";
    public List<string> Tags = new();

    public Sheep ShallowClone() => (Sheep)MemberwiseClone();
    public Sheep DeepClone() => new Sheep { Name = Name, Tags = new List<string>(Tags) };
}
''', "흰색,얕은복제\n흰색,깊은복제\n", [
    R("복제 메서드(…Clone)를 가진 클래스", count={"member": "/Clone/", "memberKind": "method"}),
    R("MemberwiseClone 으로 얕은 복사", calls="MemberwiseClone"),
])

# ───────────── 구조 ─────────────
pat("adapter", "구조", "어댑터", "Adapter",
    "이미 있는 클래스를 고칠 수 없는데, 다른 모양(인터페이스)으로 써야 할 때",
    "원하는 인터페이스를 구현하는 껍데기가 옛 클래스를 품고 호출을 번역한다.",
r'''
IPrinter printer = new PrinterAdapter(new OldPrinter());
Console.WriteLine(printer.Print("hello"));

interface IPrinter { string Print(string text); }

class OldPrinter   // 고칠 수 없는 옛 코드
{
    public string PrintUpper(string s) => "*** " + s.ToUpper() + " ***";
}

class PrinterAdapter : IPrinter
{
    readonly OldPrinter _old;
    public PrinterAdapter(OldPrinter old) { _old = old; }
    public string Print(string text) => _old.PrintUpper(text);
}
''', "*** HELLO ***\n", [
    R("새 인터페이스를 구현하면서 옛 클래스를 품은 어댑터", count={"implements": "IPrinter", "has": "OldPrinter"}),
    R("옛 클래스는 인터페이스를 구현하지 않는다 (고치지 않음)", count={"name": "OldPrinter", "implements": "*"}, max=0),
])

pat("decorator", "구조", "데코레이터", "Decorator",
    "기능을 겹겹이 덧붙이고 싶을 때 (커피+우유+시럽, 로그+압축+암호화 …)",
    "같은 인터페이스를 구현하는 포장지가 안쪽 객체를 품고, 결과에 자기 몫을 더한다.",
r'''
ICoffee coffee = new Milk(new Syrup(new Basic()));
Console.WriteLine($"{coffee.Name()} = {coffee.Cost()}원");

interface ICoffee
{
    string Name();
    int Cost();
}

class Basic : ICoffee
{
    public string Name() => "커피";
    public int Cost() => 3000;
}

abstract class Topping : ICoffee
{
    protected readonly ICoffee Inner;
    protected Topping(ICoffee inner) { Inner = inner; }
    public abstract string Name();
    public abstract int Cost();
}

class Milk : Topping
{
    public Milk(ICoffee inner) : base(inner) { }
    public override string Name() => Inner.Name() + "+우유";
    public override int Cost() => Inner.Cost() + 500;
}

class Syrup : Topping
{
    public Syrup(ICoffee inner) : base(inner) { }
    public override string Name() => Inner.Name() + "+시럽";
    public override int Cost() => Inner.Cost() + 300;
}
''', "커피+시럽+우유 = 3800원\n", [
    R("인터페이스를 구현하면서 같은 인터페이스를 품은 포장지", count={"implements": "ICoffee", "has": "ICoffee"}),
    R("포장지(장식) 종류 2개 이상", count={"inherits": "Topping"}, min=2),
])

pat("composite", "구조", "컴포지트", "Composite",
    "폴더 안의 폴더, 그룹 안의 그룹처럼 나무 구조를 하나처럼 다룰 때",
    "잎과 가지가 같은 부모를 가지고, 가지는 자식(부모 타입)들을 모아 품는다.",
r'''
var root = new Folder("루트",
    new FileItem("a.txt", 3),
    new Folder("사진",
        new FileItem("b.png", 5),
        new FileItem("c.png", 2)));
Console.WriteLine($"{root.Name} 전체 크기: {root.Size()}");

abstract class Node
{
    public string Name { get; }
    protected Node(string name) { Name = name; }
    public abstract int Size();
}

class FileItem : Node
{
    readonly int _size;
    public FileItem(string name, int size) : base(name) { _size = size; }
    public override int Size() => _size;
}

class Folder : Node
{
    readonly List<Node> _children;
    public Folder(string name, params Node[] children) : base(name) { _children = children.ToList(); }
    public override int Size() => _children.Sum(c => c.Size());
}
''', "루트 전체 크기: 10\n", [
    R("자식이 2개 이상인 공통 부모", count={"kind": "abstraction", "subtypes": 2}),
    R("부모 타입 여러 개를 품은 가지(복합) 노드", relation={"from": "Folder", "to": "Node", "kind": "has"}),
])

pat("proxy", "구조", "프록시", "Proxy",
    "진짜 객체가 무거워서 필요할 때까지 만들기를 미루거나, 접근을 검사할 때",
    "진짜와 같은 인터페이스를 구현한 대리인이 진짜를 품고, 필요할 때만 만든다.",
r'''
IImage image = new LazyImage("cat.png");
Console.WriteLine("목록 표시 (아직 안 불러옴)");
image.Show();
image.Show();

interface IImage { void Show(); }

class RealImage : IImage
{
    readonly string _file;
    public RealImage(string file)
    {
        _file = file;
        Console.WriteLine("무거운 로딩: " + file);
    }
    public void Show() => Console.WriteLine("보여줌: " + _file);
}

class LazyImage : IImage
{
    readonly string _file;
    RealImage _real;
    public LazyImage(string file) { _file = file; }
    public void Show()
    {
        _real ??= new RealImage(_file);   // 처음 한 번만 만든다
        _real.Show();
    }
}
''', "목록 표시 (아직 안 불러옴)\n무거운 로딩: cat.png\n보여줌: cat.png\n보여줌: cat.png\n", [
    R("진짜와 대리인이 같은 인터페이스를 구현 (2개 이상)", count={"implements": "IImage"}, min=2),
    R("대리인이 진짜를 품고 직접 만든다", count={"has": "RealImage", "creates": "RealImage"}),
])

pat("facade", "구조", "퍼사드", "Facade",
    "여러 부품을 정해진 순서로 다뤄야 하는 복잡한 일을 버튼 하나로",
    "앞에 선 창구 클래스가 부품들을 품고, 쓰는 쪽은 창구 메서드 하나만 부른다.",
r'''
var theater = new HomeTheater();
theater.WatchMovie("인터스텔라");

class HomeTheater
{
    readonly Tv _tv = new();
    readonly Speaker _speaker = new();
    readonly Light _light = new();

    public void WatchMovie(string title)
    {
        _light.Dim();
        _tv.On();
        _speaker.Volume(7);
        Console.WriteLine($"▶ {title} 재생");
    }
}

class Tv { public void On() => Console.WriteLine("TV 켬"); }
class Speaker { public void Volume(int v) => Console.WriteLine($"볼륨 {v}"); }
class Light { public void Dim() => Console.WriteLine("조명 어둡게"); }
''', "조명 어둡게\nTV 켬\n볼륨 7\n▶ 인터스텔라 재생\n", [
    R("창구 클래스가 부품 3개 이상을 품는다", relation={"from": "HomeTheater", "kind": "has"}, min=3),
])

pat("bridge", "구조", "브리지", "Bridge",
    "두 방향으로 종류가 늘어날 때 (모양 × 색, 리모컨 × 기기) 조합 폭발을 막기",
    "한쪽 계층이 다른 쪽 계층을 인터페이스로 품어서 둘을 따로 늘린다.",
r'''
Shape[] shapes = { new Circle(new Red()), new Square(new Blue()) };
foreach (var s in shapes) Console.WriteLine(s.Draw());

interface IColor { string Fill(); }
class Red : IColor { public string Fill() => "빨강"; }
class Blue : IColor { public string Fill() => "파랑"; }

abstract class Shape
{
    protected readonly IColor Color;
    protected Shape(IColor color) { Color = color; }
    public abstract string Draw();
}

class Circle : Shape
{
    public Circle(IColor c) : base(c) { }
    public override string Draw() => Color.Fill() + " 원";
}

class Square : Shape
{
    public Square(IColor c) : base(c) { }
    public override string Draw() => Color.Fill() + " 네모";
}
''', "빨강 원\n파랑 네모\n", [
    R("색 쪽 구현 2개 이상", count={"name": "IColor", "subtypes": 2}),
    R("모양 쪽 구현 2개 이상", count={"name": "Shape", "subtypes": 2}),
    R("모양이 색을 인터페이스로 품는다 (다리)", relation={"from": "Shape", "to": "IColor", "kind": "has"}),
])

pat("flyweight", "구조", "플라이웨이트", "Flyweight",
    "같은 데이터가 수천 번 반복될 때 (숲의 나무 종류, 글자 모양 …) 메모리 아끼기",
    "공장이 이미 만든 것을 사전에 보관했다가 같은 키면 다시 꺼내 준다.",
r'''
var factory = new TreeTypeFactory();
var t1 = factory.Get("소나무");
var t2 = factory.Get("소나무");
var t3 = factory.Get("참나무");
Console.WriteLine($"같은 객체? {ReferenceEquals(t1, t2)}");
Console.WriteLine($"만든 종류 수: {factory.Count}");

record TreeType(string Name);

class TreeTypeFactory
{
    readonly Dictionary<string, TreeType> _cache = new();
    public int Count => _cache.Count;

    public TreeType Get(string name)
    {
        if (!_cache.TryGetValue(name, out var type))
        {
            type = new TreeType(name);
            _cache[name] = type;
        }
        return type;
    }
}
''', "같은 객체? True\n만든 종류 수: 2\n", [
    R("공장이 공유 객체 여러 개를 사전으로 품는다", relation={"from": "TreeTypeFactory", "to": "TreeType", "kind": "has"}),
    R("이미 있으면 다시 꺼낸다 (TryGetValue)", calls="TryGetValue"),
])

# ───────────── 행위 ─────────────
pat("strategy", "행위", "전략", "Strategy",
    "계산·정렬·할인 방식을 바꿔 끼우고 싶을 때 (if 를 늘리지 않고)",
    "방식마다 클래스를 만들어 같은 인터페이스를 구현하고, 쓰는 쪽은 인터페이스만 품는다.",
r'''
var cart = new Cart(new PercentOff(10));
Console.WriteLine(cart.Pay(10000));

cart.Discount = new AmountOff(1500);    // 실행 중에 전략 교체
Console.WriteLine(cart.Pay(10000));

interface IDiscount { int Apply(int price); }

class PercentOff : IDiscount
{
    readonly int _rate;
    public PercentOff(int rate) { _rate = rate; }
    public int Apply(int price) => price * (100 - _rate) / 100;
}

class AmountOff : IDiscount
{
    readonly int _amount;
    public AmountOff(int amount) { _amount = amount; }
    public int Apply(int price) => price - _amount;
}

class Cart
{
    public IDiscount Discount { get; set; }
    public Cart(IDiscount discount) { Discount = discount; }
    public int Pay(int price) => Discount.Apply(price);
}
''', "9000\n8500\n", [
    R("구현 클래스가 2개 이상인 인터페이스 (전략들)", count={"kind": "interface", "subtypes": 2}),
    R("전략을 인터페이스 타입으로 품고 쓰는 클래스", count={"kind": "concrete", "has": "IDiscount"}),
    R("방식을 if·switch 로 나누지 않음", uses="if", max=0),
])

pat("observer", "행위", "옵저버", "Observer",
    "한 곳의 변화를 여러 곳(UI·소리·업적 …)에 알려야 할 때",
    "알리는 쪽은 event 를 두고, 듣는 쪽이 += 로 구독한다. 서로를 몰라도 된다.",
r'''
var hp = new Health();
hp.Changed += value => Console.WriteLine($"UI: 체력 {value}");
hp.Changed += value => { if (value == 0) Console.WriteLine("게임 오버"); };

hp.Damage(60);
hp.Damage(60);

class Health
{
    int _value = 100;
    public event Action<int> Changed;

    public void Damage(int amount)
    {
        _value = Math.Max(0, _value - amount);
        Changed?.Invoke(_value);    // 누가 듣는지 모른 채 알리기만
    }
}
''', "UI: 체력 40\nUI: 체력 0\n게임 오버\n", [
    R("event 선언", uses="event"),
    R("구독자 2개 이상 (람다로 +=)", uses="lambda", min=2),
    R("알림 보내기 (Invoke)", calls="Invoke"),
])

pat("command", "행위", "커맨드", "Command",
    "실행 취소(Ctrl+Z)·작업 기록·나중에 실행하기가 필요할 때",
    "할 일 하나를 객체로 만들고(Execute/Undo), 기록을 스택에 쌓는다.",
r'''
var doc = new Document();
var history = new Stack<ICommand>();

void Run(ICommand c) { c.Execute(); history.Push(c); }

Run(new Append(doc, "가"));
Run(new Append(doc, "나"));
Console.WriteLine(doc.Text);

history.Pop().Undo();       // 실행 취소
Console.WriteLine(doc.Text);

interface ICommand
{
    void Execute();
    void Undo();
}

class Document { public string Text = ""; }

class Append : ICommand
{
    readonly Document _doc;
    readonly string _text;
    public Append(Document doc, string text) { _doc = doc; _text = text; }
    public void Execute() => _doc.Text += _text;
    public void Undo() => _doc.Text = _doc.Text[..^_text.Length];
}
''', "가나\n가\n", [
    R("Execute·Undo 를 가진 명령 인터페이스", count={"kind": "interface", "member": "Undo"}),
    R("명령 구현 클래스", count={"implements": "ICommand"}),
    R("기록에서 꺼내 되돌리기 (Pop)", calls="Pop"),
])

pat("state", "행위", "상태", "State",
    "상태에 따라 같은 행동이 다르게 동작할 때 (문 열림/닫힘, 캐릭터 걷기/점프 …)",
    "상태마다 클래스를 만들고, 상태가 다음 상태를 돌려준다. if 덩어리가 사라진다.",
r'''
var door = new Door();
door.Push();
door.Push();
door.Push();

interface IDoorState
{
    string Name { get; }
    IDoorState Push();     // 눌렀을 때 다음 상태
}

class Closed : IDoorState
{
    public string Name => "닫힘";
    public IDoorState Push() => new Opened();
}

class Opened : IDoorState
{
    public string Name => "열림";
    public IDoorState Push() => new Closed();
}

class Door
{
    IDoorState _state = new Closed();
    public void Push()
    {
        _state = _state.Push();
        Console.WriteLine("문: " + _state.Name);
    }
}
''', "문: 열림\n문: 닫힘\n문: 열림\n", [
    R("상태 클래스 2개 이상이 구현한 인터페이스", count={"kind": "interface", "subtypes": 2}),
    R("현재 상태를 품은 클래스", count={"has": "IDoorState", "kind": "concrete"}),
    R("상태를 if·switch 로 나누지 않음", uses="if", max=0),
])

pat("template-method", "행위", "템플릿 메서드", "Template Method",
    "순서는 같고 일부 단계만 다를 때 (차·커피 만들기, 게임 한 판 흐름 …)",
    "부모가 전체 순서를 정하고, 달라지는 단계만 abstract 로 비워 자식이 채운다.",
r'''
new Tea().Make();
new Coffee().Make();

abstract class Drink
{
    public void Make()          // 순서는 부모가 정한다
    {
        Console.WriteLine("물 끓이기");
        Brew();
        Console.WriteLine("컵에 따르기");
    }
    protected abstract void Brew();   // 이 단계만 자식이
}

class Tea : Drink { protected override void Brew() => Console.WriteLine("- 찻잎 우리기"); }
class Coffee : Drink { protected override void Brew() => Console.WriteLine("- 원두 내리기"); }
''', "물 끓이기\n- 찻잎 우리기\n컵에 따르기\n물 끓이기\n- 원두 내리기\n컵에 따르기\n", [
    R("abstract 단계가 있는 추상 부모", count={"kind": "abstract", "abstractMembers": 1}),
    R("단계를 채운 자식 2개 이상", count={"inherits": "Drink"}, min=2),
])

pat("iterator", "행위", "이터레이터", "Iterator",
    "모음의 속 구조를 숨기고 하나씩 꺼내 쓰게 할 때 (foreach 가 되게)",
    "IEnumerable 을 구현하고 yield return 으로 하나씩 내준다.",
r'''
foreach (var n in new Steps(1, 10, 3))
    Console.Write(n + " ");
Console.WriteLine();

class Steps : IEnumerable<int>
{
    readonly int _from, _to, _step;
    public Steps(int from, int to, int step) { _from = from; _to = to; _step = step; }

    public IEnumerator<int> GetEnumerator()
    {
        for (int i = _from; i <= _to; i += _step)
            yield return i;
    }

    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
}
''', "1 4 7 10 \n", [
    R("IEnumerable 구현", count={"implements": "IEnumerable"}),
    R("yield return 으로 하나씩 내주기", uses="yield"),
])

pat("chain", "행위", "책임 연쇄", "Chain of Responsibility",
    "요청을 처리할 수 있는 사람에게 차례로 넘길 때 (결재 라인, 이벤트 전달 …)",
    "처리자가 다음 처리자를 품고, 못 하면 다음에게 넘긴다.",
r'''
Approver chain = new Staff(new Manager(new Ceo(null)));
foreach (var amount in new[] { 3, 50, 500, 5000 })
    Console.WriteLine(chain.Handle(amount));

abstract class Approver
{
    readonly Approver _next;
    protected Approver(Approver next) { _next = next; }

    public string Handle(int amount)
    {
        if (CanApprove(amount)) return $"{Title}: {amount}만원 승인";
        return _next?.Handle(amount) ?? $"{amount}만원은 아무도 승인 못함";
    }

    protected abstract bool CanApprove(int amount);
    protected abstract string Title { get; }
}

class Staff : Approver
{
    public Staff(Approver next) : base(next) { }
    protected override bool CanApprove(int a) => a < 10;
    protected override string Title => "사원";
}

class Manager : Approver
{
    public Manager(Approver next) : base(next) { }
    protected override bool CanApprove(int a) => a < 100;
    protected override string Title => "팀장";
}

class Ceo : Approver
{
    public Ceo(Approver next) : base(next) { }
    protected override bool CanApprove(int a) => a < 1000;
    protected override string Title => "사장";
}
''', "사원: 3만원 승인\n팀장: 50만원 승인\n사장: 500만원 승인\n5000만원은 아무도 승인 못함\n", [
    R("다음 처리자(자기 타입)를 품은 부모", count={"kind": "abstract", "has": "self"}),
    R("처리자 3개 이상", count={"inherits": "Approver"}, min=3),
])

pat("mediator", "행위", "중재자", "Mediator",
    "여러 객체가 서로를 직접 부르면 거미줄이 될 때 (채팅방, 관제탑 …)",
    "모두가 중재자 하나만 알고, 중재자가 대신 전달한다.",
r'''
var room = new ChatRoom();
var minsu = new User("민수", room);
var jia = new User("지아", room);
var hajun = new User("하준", room);

minsu.Say("안녕!");

class ChatRoom
{
    readonly List<User> _users = new();
    public void Join(User u) => _users.Add(u);
    public void Send(User from, string message)
    {
        foreach (var u in _users)
            if (u != from) u.Receive(from.Name, message);
    }
}

class User
{
    public string Name { get; }
    readonly ChatRoom _room;
    public User(string name, ChatRoom room) { Name = name; _room = room; room.Join(this); }
    public void Say(string message) => _room.Send(this, message);
    public void Receive(string from, string message) => Console.WriteLine($"{Name} ← {from}: {message}");
}
''', "지아 ← 민수: 안녕!\n하준 ← 민수: 안녕!\n", [
    R("중재자가 참여자 여러 명을 품는다", relation={"from": "ChatRoom", "to": "User", "kind": "has"}),
    R("참여자는 중재자만 안다", relation={"from": "User", "to": "ChatRoom", "kind": "has"}),
    R("참여자끼리 직접 품지 않는다", relation={"from": "User", "to": "User", "kind": "has"}, max=0),
])

pat("memento", "행위", "메멘토", "Memento",
    "되돌리기·저장 지점(세이브)을 만들 때, 속을 드러내지 않고",
    "원본이 자기 상태를 담은 기념품(메멘토)을 만들어 주고, 나중에 그걸로 복원한다.",
r'''
var editor = new Editor { Text = "초안" };
var save = editor.Save();

editor.Text = "망친 글";
Console.WriteLine(editor.Text);

editor.Restore(save);
Console.WriteLine(editor.Text);

record Memento(string Text);

class Editor
{
    public string Text { get; set; } = "";
    public Memento Save() => new Memento(Text);
    public void Restore(Memento m) => Text = m.Text;
}
''', "망친 글\n초안\n", [
    R("상태만 담는 메멘토(record)", count={"kind": "record"}),
    R("원본이 메멘토를 만든다 (Save)", relation={"from": "Editor", "to": "Memento", "kind": "creates"}),
    R("저장·복원 메서드", count={"name": "Editor", "member": "Restore"}),
])

pat("visitor", "행위", "방문자", "Visitor",
    "도형 종류는 그대로 두고 새 기능(넓이·그리기·저장)을 계속 더할 때",
    "도형마다 Accept(visitor) 로 자기 종류에 맞는 Visit 를 불러 준다(이중 디스패치). C# 은 switch 패턴 매칭으로도 쓴다.",
r'''
Shape[] shapes = { new Square(2), new Circle(1) };

var area = new AreaVisitor();
foreach (var s in shapes) s.Accept(area);
Console.WriteLine($"방문자: {area.Total:F2}");

// 같은 일을 패턴 매칭으로
double Area(Shape s) => s switch
{
    Square q => q.Side * q.Side,
    Circle c => Math.PI * c.Radius * c.Radius,
    _ => 0,
};
Console.WriteLine($"패턴 매칭: {shapes.Sum(Area):F2}");

interface IShapeVisitor
{
    void Visit(Square s);
    void Visit(Circle c);
}

abstract record Shape { public abstract void Accept(IShapeVisitor v); }
record Square(double Side) : Shape { public override void Accept(IShapeVisitor v) => v.Visit(this); }
record Circle(double Radius) : Shape { public override void Accept(IShapeVisitor v) => v.Visit(this); }

class AreaVisitor : IShapeVisitor
{
    public double Total { get; private set; }
    public void Visit(Square s) => Total += s.Side * s.Side;
    public void Visit(Circle c) => Total += Math.PI * c.Radius * c.Radius;
}
''', "방문자: 7.14\n패턴 매칭: 7.14\n", [
    R("Visit 를 가진 방문자 인터페이스", count={"kind": "interface", "member": "Visit"}),
    R("Accept 를 가진 타입 2개 이상", count={"member": "Accept"}, min=2),
    R("방문자 구현", count={"implements": "IShapeVisitor"}),
])

# ───────────── 설계 원칙 ─────────────
pat("di", "설계", "의존성 주입", "Dependency Injection",
    "테스트용 가짜로 바꿔 끼우거나, 저장소(DB·파일)를 나중에 바꾸고 싶을 때",
    "필요한 것을 안에서 new 하지 말고, 인터페이스로 생성자에서 받는다.",
r'''
var service = new OrderService(new FakeRepository());   // 실제 DB 대신 가짜
service.Place("롱소드");

interface IRepository { void Save(string item); }

class FakeRepository : IRepository
{
    public void Save(string item) => Console.WriteLine("(가짜) 저장: " + item);
}

class OrderService
{
    readonly IRepository _repo;
    public OrderService(IRepository repo) { _repo = repo; }   // 주입
    public void Place(string item) => _repo.Save(item);
}
''', "(가짜) 저장: 롱소드\n", [
    R("인터페이스로 받아 품는다", count={"name": "OrderService", "has": "IRepository"}),
    R("구체 클래스를 직접 new 하지 않는다", relation={"from": "OrderService", "kind": "creates"}, max=0),
])

pat("reflection-factory", "설계", "리플렉션 팩토리", "Reflection Factory",
    "타입 이름(문자열·설정 파일)으로 객체를 만들 때 — 플러그인, 데이터로 정하는 유닛",
    "Type.GetType 으로 타입을 찾고 Activator.CreateInstance 로 만든다.",
r'''
foreach (var name in new[] { "Knight", "Archer" })
{
    var type = Type.GetType(name);
    var unit = (IUnit)Activator.CreateInstance(type);
    Console.WriteLine($"{name}: {unit.Attack()}");
}

interface IUnit { string Attack(); }
class Knight : IUnit { public string Attack() => "베기"; }
class Archer : IUnit { public string Attack() => "활쏘기"; }
''', "Knight: 베기\nArcher: 활쏘기\n", [
    R("이름으로 만들기 (Activator.CreateInstance)", calls="CreateInstance"),
    R("같은 인터페이스를 구현한 유닛 2개 이상", count={"name": "IUnit", "subtypes": 2}),
])

out = os.path.join(os.path.dirname(__file__), "..", "..", "engine", "wwwroot", "labs", "patterns", "patterns.json")
with open(out, "w", encoding="utf8") as f:
    json.dump(P, f, ensure_ascii=False, indent=1)
print(len(P), "patterns →", os.path.normpath(out))
