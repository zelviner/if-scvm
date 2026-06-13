# Card Script

Card Script 是一门面向智能卡测试、APDU 交互和卡片数据处理的轻量级脚本语言。项目包含完整的词法分析器、Pratt 表达式解析器、AST、字节码编译器和栈式虚拟机，并提供字符串、列表、哈希表、密码算法、BER-TLV 解析以及读卡器回调接口。

本文档以当前源码实现为准，覆盖现阶段可用的语法、内置函数、对象方法和 C++ 嵌入接口。

## 主要能力

- 动态类型：整数、浮点数、布尔值、字符串、空值、列表、哈希表和函数闭包。
- 常用表达式：算术、比较、逻辑、位运算、赋值、三元表达式、成员访问和索引访问。
- 控制流：`if`、`while`、传统 `for`、`for ... in`、`switch`、`break`、`continue` 和 `return`。
- 函数与闭包：匿名函数、默认参数和自由变量捕获。
- 多文件脚本：通过 `import "path"` 在解析阶段展开 AST。
- 智能卡操作：APDU 发送、响应校验、复位 `RST`、PPS 协商和结构化回调。
- 数据工具：字符串、列表、哈希表方法以及 BER-TLV 解析。
- 密码工具：3DES、AES、MAC、CMAC 和 Milenage。
- 源码定位：语法错误、导入错误和卡片事件携带文件及行号信息。

## 构建

### 环境要求

- CMake 3.14 或更高版本
- 支持 C++17 的编译器
- `zel`，至少包含 `core` 和 `crypto` 组件
- OpenSSL
- GoogleTest，仅在启用测试时需要

项目会在设置 `CGEAR_HOME` 时使用该目录下的 vcpkg 工具链和安装目录；未设置时，默认安装到构建目录下的 `installed`。

### 编译库

```powershell
cmake -S . -B build
cmake --build build --config Debug
```

非测试构建会生成动态库：

- Debug：`bin/card_scriptd.dll`
- Release：`bin/card_script.dll`

### 编译并运行测试

```powershell
cmake -S . -B build -DENABLE_TESTS=ON
cmake --build build --config Debug
ctest --test-dir build -C Debug --output-on-failure
```

测试程序输出到 `bin/test`，当前包含 lexer、parser、compiler、VM、script 和 REPL 测试目标。

## 快速示例

```card-script
import "lib/common.card"

name = "Card Script"
numbers = [1, 2, 3]
profile = {
    "name": name,
    "enabled": true
}

sum = func(a, b = 10) {
    return a + b
}

if profile.enabled {
    numbers.append(sum(5), sum(5, 20))
}

for index, value in numbers {
    print(index, value)
}

response = "00A4000000" -> ["9000", "*9000"]
print(response.data, response.sw)
```

分号通常可以省略。传统 `for` 的三个表达式之间必须使用分号分隔。

## 词法规则

### 标识符

标识符必须以英文字母或下划线开头，后续可以包含英文字母、数字或下划线。

```card-script
value = 1
_private = 2
card_id_01 = "A0000000031010"
```

标识符区分大小写。

### 关键字

```text
true false null
if else while for in
switch case default
break continue
func return
import
```

`RST`、`PPS`、`crypto` 和 `tlv` 是预定义内置对象，不是普通关键字。

### 注释

```card-script
// 单行注释

/*
   多行注释
*/
```

块注释必须以 `*/` 结束，当前不支持嵌套块注释。

### 字符串

单引号和双引号都可以创建字符串：

```card-script
single = 'hello'
double = "world"
```

双引号字符串支持以下转义：

| 转义 | 含义 |
| --- | --- |
| `\n` | 换行 |
| `\t` | 制表符 |
| `\r` | 回车 |
| `\\` | 反斜杠 |

单引号字符串支持使用 `\'` 表示单引号。

### 数值

源码中的数值字面量使用十进制：

```card-script
integer = 123
negative = -42
decimal = 3.1415
```

二进制、八进制和十六进制文本可以通过 `int(string, base)` 转换，不支持 `0x10` 一类数值字面量。

## 数据类型

| 类型 | `type()` 返回值 | 示例 |
| --- | --- | --- |
| 整数 | `integer` | `10`、`-1` |
| 浮点数 | `float` | `3.14` |
| 布尔值 | `boolean` | `true`、`false` |
| 字符串 | `string` | `"9000"` |
| 空值 | `null` | `null` |
| 列表 | `list` | `[1, "A", true]` |
| 哈希表 | `hash` | `{"name": "card"}` |
| 函数闭包 | `closure` | `func(x) { return x }` |
| 内置对象 | `builtin` | `print`、`crypto` |

只有 `false` 和 `null` 在条件判断中为假；其他值均为真，包括 `0`、空字符串和空列表。

### 列表

```card-script
values = [10, 20, "30"]
first = values[0]
last = values[-1]
values[1] = 99
```

列表和字符串支持负数索引。读取越界索引返回 `null`；列表越界赋值会产生运行时错误。

### 哈希表

```card-script
card = {
    "aid": "A0000000031010",
    "active": true
}

aid1 = card["aid"]
aid2 = card.aid

card["label"] = "Visa"
card.country = "CN"
```

当前 VM 的 `[]` 和点号属性访问支持字符串键。需要操作其他可哈希键时，应使用 `has`、`get`、`set` 和 `remove` 方法。

读取不存在的键返回 `null`。

## 变量与赋值

语言没有单独的变量声明关键字，首次赋值会创建变量：

```card-script
count = 1
count += 2
count++
```

赋值目标可以是变量、列表/哈希索引或哈希属性：

```card-script
value = 10
items[0] = 20
config.enabled = true
```

支持的复合赋值运算符：

```text
= -= *= /= %= &= |= ^= <<= >>=
```

`++` 和 `--` 支持整数及浮点数，并会把新值写回变量、索引或属性。

## 运算符

### 算术与拼接

| 运算符 | 支持的主要类型 | 说明 |
| --- | --- | --- |
| `+` | 数值、字符串、列表 | 加法、字符串拼接、列表连接 |
| `-` | 数值 | 减法 |
| `*` | 数值、字符串与整数、列表与整数 | 乘法或重复 |
| `/` | 数值 | 除法 |
| `%` | 整数 | 取模 |
| `-value` | 整数、浮点数 | 取负 |

整数与浮点数混合计算时会进行浮点计算。字符串与整数使用 `+` 时会把整数追加为十进制文本。

```card-script
text = "APDU-" + 10
line = "AB" * 3          // "ABABAB"
items = [1, 2] + [3, 4]
repeated = [1, 2] * 2
```

### 位运算

```text
& | ^ ~ << >>
```

位运算仅用于整数。

### 比较运算

```text
< <= > >= == !=
```

整数和浮点数可以交叉比较。字符串按字典序比较。布尔值和 `null` 支持 `==`、`!=`。不同类型之间的 `==` 返回 `false`，`!=` 返回 `true`。

### 逻辑运算

```card-script
valid = enabled && ready
retry = timeout || rejected
disabled = !enabled
```

`&&` 和 `||` 要求两侧都是布尔值，并且当前实现会计算两侧表达式，不提供短路求值。`!false` 和 `!null` 为 `true`，其他值取反后为 `false`。

### 成员与包含关系

```card-script
"90" in "9000"
2 in [1, 2, 3]
"name" in {"name": "card"}
```

- 字符串：判断左侧字符串是否为右侧字符串的子串。
- 列表：按类型和字符串表示判断是否包含元素。
- 哈希表：判断是否包含指定键。

### 三元表达式

```card-script
status = ok ? "success" : "failed"
```

### 运算符优先级

从低到高如下：

| 优先级 | 运算符 |
| --- | --- |
| 1 | `=` 以及所有复合赋值 |
| 2 | `->` |
| 3 | `in` |
| 4 | `&` `|` `^` `&&` `||` `<<` `>>` |
| 5 | `?:` |
| 6 | `<` `<=` `>` `>=` `==` `!=` |
| 7 | `+` `-` |
| 8 | `*` `/` `%` |
| 9 | 前缀 `-` `~` `!` |
| 10 | 函数调用 `()` |
| 11 | 索引 `[]` |
| 12 | 成员访问 `.` |

位运算、逻辑运算和移位运算当前处于同一优先级。复杂表达式建议显式使用括号，避免依赖这一实现细节。

## 控制流

### `if` / `else if` / `else`

条件不需要括号：

```card-script
if score >= 90 {
    level = "A"
} else if score >= 60 {
    level = "B"
} else {
    level = "C"
}
```

### `while`

```card-script
i = 0
while i < 10 {
    i++
    if i == 5 {
        continue
    }
    if i == 8 {
        break
    }
}
```

### 传统 `for`

`for` 后不使用括号：

```card-script
for i = 0; i < 10; i++ {
    print(i)
}
```

初始化、条件和更新表达式目前都必须提供。

### `for ... in`

只接收值：

```card-script
for value in ["A", "B", "C"] {
    print(value)
}
```

同时接收键和值：

```card-script
for index, value in ["A", "B"] {
    print(index, value)
}

for key, value in {"name": "card", "enabled": true} {
    print(key, value)
}
```

可迭代对象及键的含义：

| 对象 | 单变量 | 双变量中的第一个值 |
| --- | --- | --- |
| 字符串 | 单字符字符串 | 字符索引 |
| 列表 | 元素 | 元素索引 |
| 哈希表 | 值 | 键 |

### `switch`

每个 `case` 和 `default` 的主体使用独立代码块。一个 `case` 可以列出多个候选值：

```card-script
switch sw {
case "9000": {
    print("success")
    break
}
case "6A82", "6A83": {
    print("not found")
    break
}
default: {
    print("unexpected status", sw)
}
}
```

建议把 `default` 放在最后，并在不希望继续执行后续分支检查时显式使用 `break`。

### `break` 与 `continue`

- `break` 用于退出当前循环或 `switch`。
- `continue` 用于进入当前循环的下一次迭代。

## 函数与闭包

函数使用 `func` 创建，通常赋值给变量：

```card-script
add = func(a, b) {
    return a + b
}

result = add(10, 20)
```

函数是表达式，也可以作为参数或返回值：

```card-script
make_adder = func(base) {
    return func(value) {
        return base + value
    }
}

add10 = make_adder(10)
print(add10(5))
```

默认参数必须位于普通参数之后：

```card-script
format_sw = func(sw, prefix = "SW=") {
    return prefix + sw
}
```

`return` 当前必须携带返回表达式。函数参数按位置传递，不支持命名参数或可变参数声明。

## 多文件导入

### 基本语法

```card-script
import "common.card"
import "lib/crypto.card";
```

分号可选。`import` 只能写在文件顶层，不能放在函数、条件或循环代码块中。

### 路径与展开规则

- 相对路径以当前导入语句所在文件的目录为基准。
- 导入在解析后、编译前完成，导入文件的 AST 会在语句所在位置展开。
- 所有文件共享同一个全局作用域，没有模块命名空间或导出列表。
- 同一个绝对路径在一次加载过程中只展开一次。
- 循环导入会报错，并显示完整导入链。
- 被导入文件中的 token 保留其真实绝对路径，便于错误和事件定位。

例如：

```text
scripts/
├── main.card
└── lib/
    └── common.card
```

`main.card`：

```card-script
import "lib/common.card"
print(shared_value)
```

`lib/common.card`：

```card-script
shared_value = 42
```

使用导入时，调用 C++ `Repl::run` 必须传入入口文件路径，否则无法解析相对路径。

## 智能卡语法

智能卡操作使用 `->`：左侧是 APDU 或卡片内置操作，右侧是期望响应。

### 发送 APDU

```card-script
response = "00A4000000" -> "9000"
```

APDU 必须是十六进制字符串，并通过 ISO 7816 Case 1、2、3、4 或扩展长度检查。执行成功后返回：

```card-script
{
    "data": "响应数据，不含状态字",
    "sw": "完整状态字",
    "sw1": "状态字前一字节",
    "sw2": "状态字后一字节"
}
```

```card-script
response = "00A4000000" -> null
print(response.data)
print(response.sw)
```

### 响应匹配

期望值可以是：

- `null`：接受任意响应。
- 字符串：响应必须匹配该模式。
- 字符串列表：任意一个模式匹配即可。

模式支持：

| 字符 | 含义 |
| --- | --- |
| `X` | 匹配任意单个字符 |
| `*` | 匹配任意长度的字符序列 |

```card-script
"00A4000000" -> "9000"
"00A4000000" -> "XXXX9000"
"00A4000000" -> "*9000"
"00A4000000" -> ["9000", "6A82"]
```

匹配对象是完整响应，即 `data + sw`。

### 复位卡片

```card-script
atr = RST -> null
atr = RST -> "3B*"
```

`RST` 会断开并重新连接卡片、执行复位、校验 ATR，然后返回 ATR 字符串。

### PPS

```card-script
PPS -> null
PPS -> "FF1000FE"
```

右侧为 `null` 时调用无参数 PPS；右侧为字符串时把该字符串传给读卡器。表达式返回 `null`。

## 全局内置函数

### `print(...values)`

使用空格连接所有参数的字符串表示，通过回调发送 `script.print` 事件，返回 `null`。

```card-script
print("SW", "9000", 123)
```

### `type(value)`

返回运行时类型名称。

```card-script
type([1, 2])    // "list"
type(null)      // "null"
```

### `len(value)`

返回字符串长度、列表元素数或哈希表键值对数量。

```card-script
len("ABC")             // 3
len([1, 2, 3])          // 3
len({"a": 1})          // 1
```

### `int(value, base = 10)`

把布尔值、整数、浮点数或字符串转换为整数。字符串转换支持进制 `2`、`8`、`10` 和 `16`。

```card-script
int(true)          // 1
int(3.9)           // 3
int("1010", 2)    // 10
int("FF", 16)     // 255
```

### `float(value)`

把布尔值、整数、浮点数或十进制字符串转换为浮点数。

```card-script
float(10)       // 10.000000
float("3.14")
```

### `str(value)`

把 `null`、布尔值、整数、浮点数、字符串、列表或哈希表转换为字符串。

```card-script
str(100)
str([1, 2, 3])
```

### `sleep(milliseconds)`

阻塞当前执行线程指定毫秒数，返回 `null`。

```card-script
sleep(100)
```

### `panic(message)`

创建运行时错误并终止当前脚本执行。参数必须是字符串。

```card-script
if !valid {
    panic("invalid card data")
}
```

### `exit(code)`

使用整数退出码直接结束当前进程。嵌入库时应谨慎使用，因为它不是仅停止当前脚本。

```card-script
exit(1)
```

## 整数方法

| 方法 | 返回值 | 说明 |
| --- | --- | --- |
| `toHexString()` | 字符串 | 转换为大写十六进制，至少补齐到 2 位 |

```card-script
255.toHexString()    // "FF"
1.toHexString()      // "01"
```

## 字符串方法

| 方法 | 返回值 | 说明 |
| --- | --- | --- |
| `len()` | 整数 | 字节长度 |
| `upper()` | 字符串 | 转为大写 |
| `lower()` | 字符串 | 转为小写 |
| `split(separator)` | 列表 | 按分隔字符串拆分 |
| `find(text)` | 布尔值 | 是否包含子串 |
| `index(text)` | 整数 | 首次出现位置，不存在返回 `-1` |
| `prefix(text)` | 布尔值 | 是否以指定文本开头 |
| `suffix(text)` | 布尔值 | 是否以指定文本结尾 |
| `trim(characters)` | 字符串 | 从两端移除参数中包含的字符 |
| `repeat(count)` | 字符串 | 重复非负整数次 |
| `replace(old, new)` | 字符串 | 替换所有匹配子串 |
| `mid(start, length)` | 字符串 | 截取子串 |
| `xor(hex)` | 字符串 | 与另一个十六进制字符串按位异或 |
| `toHexString()` | 字符串 | ASCII/字节文本转十六进制 |
| `toAsciiString()` | 字符串 | 十六进制转 ASCII/字节文本 |

```card-script
" abcd ".trim(" ").upper()       // "ABCD"
"AABBCC".mid(2, 2)                // "BB"
"ABC".toHexString()               // "414243"
"414243".toAsciiString()          // "ABC"
"FFFF".xor("00FF")               // "FF00"
```

字符串方法返回新字符串，不修改原字符串。

## 列表方法

| 方法 | 返回值 | 说明 |
| --- | --- | --- |
| `len()` | 整数 | 元素数量 |
| `append(...values)` | `null` | 在末尾追加零个或多个值 |
| `pop()` | 任意值 | 删除并返回末尾元素，空列表返回 `null` |
| `shift()` | 任意值 | 删除并返回首元素，空列表返回 `null` |
| `insert(index, ...values)` | `null` | 在索引位置插入一个或多个值 |
| `remove(index)` | `null` | 删除指定索引的元素 |
| `clear()` | `null` | 清空列表 |
| `index(value)` | 整数 | 查找元素索引，不存在返回 `-1` |
| `extend(list)` | `null` | 追加另一个列表中的所有元素 |
| `join(separator)` | 字符串 | 使用分隔字符串连接元素的字符串表示 |
| `json()` | 字符串 | 返回列表的 JSON 风格字符串表示 |
| `copy()` | 列表 | 深度复制可复制元素 |

```card-script
items = [1, 2]
items.append(3, 4)
items.insert(1, "A", "B")
text = items.join(",")
clone = items.copy()
```

## 哈希表方法

| 方法 | 返回值 | 说明 |
| --- | --- | --- |
| `len()` | 整数 | 键值对数量 |
| `has(key)` | 布尔值 | 是否存在键 |
| `get(key)` | 任意值 | 返回值，不存在时返回 `null` |
| `get(key, default)` | 任意值 | 不存在时返回默认值 |
| `set(key, value)` | `null` | 设置键值 |
| `keys()` | 列表 | 返回键列表 |
| `values()` | 列表 | 返回值列表 |
| `update(hash)` | `null` | 合并另一个哈希表，同名键被覆盖 |
| `remove(key)` | `null` | 删除键 |
| `clear()` | `null` | 清空哈希表 |
| `json()` | 字符串 | 返回哈希表的 JSON 风格字符串表示 |
| `copy()` | 哈希表 | 深度复制可复制键和值 |

```card-script
config = {"enabled": true}
config.set("timeout", 1000)
timeout = config.get("timeout", 500)
if config.has("enabled") {
    print(config.keys())
}
```

哈希表的遍历顺序和 `keys()`、`values()` 返回顺序不应被视为稳定的插入顺序。

## `crypto` 内置对象

所有数据、密钥、IV 和结果均使用十六进制字符串表示。底层算法不会为 `cipher` 自动添加填充，调用者必须提供符合分组长度要求的数据。

### `crypto.randomHex(length)`

生成指定字节数的随机数据，并返回大写十六进制字符串。

```card-script
challenge = crypto.randomHex(8)
```

### `crypto.cipher(type, data, key, iv, op)`

执行 3DES 或 AES 加解密。

支持的 `type`：

```text
des-ede
des-ede-cbc
aes-128-ecb
aes-192-ecb
aes-256-ecb
aes-128-cbc
aes-192-cbc
aes-256-cbc
```

- `data`：十六进制输入数据。
- `key`：十六进制密钥。
- `iv`：十六进制 IV；不需要时传 `null`。
- `op`：底层操作枚举值。

当前底层枚举对 `op` 的定义并不统一：

| 算法 | `op = 0` | `op = 1` |
| --- | --- | --- |
| 3DES | 解密 | 加密 |
| AES | 加密 | 解密 |

```card-script
aes_cipher = crypto.cipher(
    "aes-128-cbc",
    "00112233445566778899AABBCCDDEEFF",
    "000102030405060708090A0B0C0D0E0F",
    "00000000000000000000000000000000",
    0
)
```

### `crypto.TDesMac(data, key, ivec)`

计算 PBOC 3DES MAC，三个参数均为十六进制字符串。

```card-script
mac = crypto.TDesMac(data, key, "0000000000000000")
```

### `crypto.aesCbcMac(data, key)`

计算 AES CBC-MAC，返回十六进制字符串。

### `crypto.aesCmac(data, key)`

计算 AES-CMAC，返回十六进制字符串。

### `crypto.milenage(ki, opc, rand, sqn, amf)`

执行 Milenage 全量计算。所有参数均为十六进制字符串，返回哈希表：

```card-script
{
    "MacA": "...",
    "MacS": "...",
    "RES": "...",
    "CK": "...",
    "IK": "...",
    "AK": "...",
    "AKStar": "..."
}
```

## `tlv` 内置对象

### `tlv.parse(hex)`

解析 BER-TLV 十六进制字符串，返回 TLV 对象列表。每个对象包含：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tag` | 字符串 | 十六进制 Tag |
| `length` | 整数 | Value 字节长度 |
| `value` | 字符串 | 十六进制 Value |
| `children` | 列表 | 构造型 TLV 的子节点；没有子节点时字段不存在 |

```card-script
nodes = tlv.parse("6F0A8408A0000000031010")
print(nodes.json())
```

### `tlv.find(nodes, tag)`

深度优先搜索 TLV 列表及其 `children`，返回第一个 Tag 匹配的哈希表；不存在时返回 `null`。

```card-script
nodes = tlv.parse(fci)
aid = tlv.find(nodes, "84")
if aid != null {
    print(aid.value)
}
```

## C++ 嵌入接口

入口类位于 `repl/repl.h`：

```cpp
#include <card_script/repl/repl.h>

using card_script::Repl;

std::string source = R"(
print("hello")
)";

Repl::run(
    "D:/scripts/main.card",
    source.c_str(),
    static_cast<int>(source.size())
);
```

完整重载：

```cpp
static void run(
    const std::string& filepath,
    const char* buf,
    int len,
    const std::shared_ptr<card_reader::CardReader>& card_reader = nullptr,
    card_reader::CardReader::Protocol protocol = card_reader::CardReader::ISO,
    CardCallback card_callback = nullptr,
    void* user = nullptr
);
```

参数说明：

| 参数 | 说明 |
| --- | --- |
| `filepath` | 入口脚本路径，用于导入解析、诊断和事件定位 |
| `buf` / `len` | 脚本源码及其字节长度 |
| `card_reader` | 读卡器实现；执行卡片语法时必须提供 |
| `protocol` | 卡片通信协议，默认 `ISO` |
| `card_callback` | 接收脚本输出和卡片事件的回调 |
| `user` | 原样传回回调的用户指针 |

不需要导入和文件定位时，也可以使用不带 `filepath` 的重载。只要脚本包含 `import`，就必须使用带路径的重载。

## 回调事件

回调签名：

```cpp
using CardCallback = std::function<void(const char* data, int len, void* user)>;
```

回调数据是 UTF-8 JSON 文本。应使用传入的 `len` 构造字符串，不要假设缓冲区由调用者长期持有。

### `script.print`

```json
{
  "event": "script.print",
  "data": {
    "message": "hello 123"
  }
}
```

### `card.apdu`

```json
{
  "event": "card.apdu",
  "line": 12,
  "filepath": "D:/scripts/main.card",
  "data": {
    "command": "00A4000000",
    "response": "9000"
  }
}
```

### `card.reset`

```json
{
  "event": "card.reset",
  "line": 4,
  "filepath": "D:/scripts/main.card",
  "data": {
    "atr": "3B..."
  }
}
```

`card.apdu` 和 `card.reset` 携带触发该操作的 `line` 与 `filepath`。当前 `script.print` 事件不包含源码位置。

## 错误与源码定位

词法、语法和导入错误使用接近 Go 编译器的单行格式：

```text
D:/scripts/main.card:8:13: syntax error: expected }, found end of file
D:/scripts/main.card:2:1: error: import "missing.card": file not found
```

格式为：

```text
filepath:line:column: category: message
```

`ModuleLoader` 和 `Repl::run` 会通过 C++ 异常报告解析、导入、编译或运行时错误，嵌入程序应在调用边界捕获 `std::exception`：

```cpp
try {
    Repl::run(filepath, source.data(), static_cast<int>(source.size()));
} catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
}
```

导入文件发生错误时，诊断中的路径和行列号指向实际出错文件，而不是入口文件。

## 当前限制与注意事项

- `import` 是 AST 展开，不提供模块命名空间、别名、导出控制或动态加载。
- `import` 只能位于顶层；入口源码必须提供有效文件路径才能使用相对导入。
- 数值字面量只支持十进制整数和十进制浮点数。
- 逻辑 `&&`、`||` 当前不短路。
- `crypto.cipher` 不自动填充，且 DES/AES 的 `op` 数值含义不同。
- 字符串长度和索引按底层字节处理，不是 Unicode 字符数量。
- 哈希表不保证插入顺序。
- 卡片语法依赖外部 `card_reader::CardReader` 实现；未设置读卡器时会产生运行时错误。
- `exit()` 会终止宿主进程，不仅是当前脚本。

## 项目结构

```text
card-script/
├── src/
│   ├── frontend/
│   │   ├── lexer/       # 词法分析
│   │   ├── token/       # Token 定义
│   │   ├── parser/      # Pratt 解析器
│   │   ├── ast/         # AST 节点
│   │   └── module/      # import 解析与 AST 展开
│   ├── backend/
│   │   ├── compiler/    # AST 到字节码
│   │   ├── code/        # 指令定义
│   │   ├── object/      # 运行时对象与内置函数
│   │   ├── scope/       # 编译作用域
│   │   ├── symbol_table/ # 符号表
│   │   └── vm/          # 栈式虚拟机
│   ├── repl/            # 对外执行入口
│   └── utility/apdu/    # APDU 校验与响应匹配
├── test/                # GoogleTest 测试
├── script/              # 本地脚本目录
├── cmake/               # CMake 包配置
├── CMakeLists.txt
└── LICENSE.txt
```

## License

本项目使用 MIT License，详见 [LICENSE.txt](LICENSE.txt)。
