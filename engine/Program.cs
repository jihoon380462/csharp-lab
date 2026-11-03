using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

// UI는 순수 HTML/JS(wwwroot/index.html)가 담당하고,
// .NET 쪽은 JS에서 부르는 엔진(Engine.Run)만 제공한다.
var builder = WebAssemblyHostBuilder.CreateDefault(args);
await builder.Build().RunAsync();
