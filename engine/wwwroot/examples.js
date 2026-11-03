// 테스트용 예제 모음. kind: normal | error(일부러 틀린 코드)
window.LAB_EXAMPLES = [
  {
    id: "hello", label: "안녕하세요", kind: "normal",
    code: `Console.WriteLine("안녕하세요, C#!");
Console.WriteLine($"1 + 2 = {1 + 2}");`
  },
  {
    id: "vars", label: "변수·조건", kind: "normal",
    code: `int hp = 35;
string name = "슬라임";

if (hp <= 0)
{
    Console.WriteLine($"{name} 쓰러짐!");
}
else if (hp < 50)
{
    Console.WriteLine($"{name} 위험! 남은 체력 {hp}");
}
else
{
    Console.WriteLine($"{name} 멀쩡함");
}`
  },
  {
    id: "loop", label: "반복", kind: "normal",
    code: `for (int i = 1; i <= 9; i++)
{
    Console.WriteLine($"7 x {i} = {7 * i}");
}

int n = 0;
while (n < 3)
{
    n++;
    Console.Write($"[{n}] ");
}
Console.WriteLine();`
  },
  {
    id: "class", label: "클래스", kind: "normal",
    code: `var hero = new Player("용사", 100);
hero.TakeDamage(30);
hero.TakeDamage(80);

class Player
{
    public string Name { get; }
    public int Hp { get; private set; }

    public Player(string name, int hp)
    {
        Name = name;
        Hp = hp;
    }

    public void TakeDamage(int amount)
    {
        Hp = Math.Max(0, Hp - amount);
        Console.WriteLine($"{Name}: -{amount} → HP {Hp}");
        if (Hp == 0) Console.WriteLine($"{Name} 쓰러짐");
    }
}`
  },
  {
    id: "linq", label: "리스트·LINQ", kind: "normal",
    code: `var scores = new List<int> { 72, 95, 88, 61, 100, 79 };
var items = new Dictionary<string, int> { ["포션"] = 3, ["열쇠"] = 1 };

Console.WriteLine($"평균: {scores.Average():F1}");
Console.WriteLine($"80점 이상: {string.Join(", ", scores.Where(s => s >= 80).OrderBy(s => s))}");

items["포션"] -= 1;
foreach (var (item, count) in items)
    Console.WriteLine($"{item} x{count}");`
  },
  {
    id: "input", label: "입력 받기", kind: "normal",
    stdin: "홍길동\n20",
    code: `Console.Write("이름: ");
string name = Console.ReadLine();
Console.Write("나이: ");
int age = int.Parse(Console.ReadLine());

Console.WriteLine();
Console.WriteLine($"{name}님은 내년에 {age + 1}살입니다.");`
  },
  {
    id: "async", label: "async/await", kind: "normal",
    code: `Console.WriteLine("요리 시작");
await Task.Delay(500);
Console.WriteLine("0.5초 뒤: 물 끓음");
int result = await AddLaterAsync(2, 3);
Console.WriteLine($"계산 결과: {result}");

static async Task<int> AddLaterAsync(int a, int b)
{
    await Task.Delay(200);
    return a + b;
}`
  },
  {
    id: "compile-error", label: "오류: 컴파일", kind: "error",
    code: `int gold = 100
string msg = "골드: " + gold;
Console.WriteLine(mesage);`
  },
  {
    id: "runtime-error", label: "오류: 실행 중", kind: "error",
    code: `int[] slots = { 1, 2, 3 };
Console.WriteLine("세 번째 칸: " + slots[2]);
Console.WriteLine("네 번째 칸: " + slots[3]);`
  },
  {
    id: "infinite", label: "무한 반복", kind: "error",
    code: `int count = 0;
while (true)
{
    count++;
}
Console.WriteLine("여기는 절대 안 옴");`
  },
  {
    id: "recursion", label: "끝없는 재귀", kind: "error",
    code: `Console.WriteLine(Countdown(10));

int Countdown(int n) => Countdown(n - 1); // 종료 조건이 없음`
  },
];
