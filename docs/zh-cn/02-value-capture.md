## 值捕获 `$`

值捕获是数据捕获的基本方式，也是最常见的一种形式。「值捕获」可以被放在方括号内用于捕获特性的值；也可以放在花括号内用于捕获节点的文本。

### 语法

- `[foo=$xxx]` 放在 CSS 选择器特性匹配部分，用于捕获该特性的值
- `{$xxx}` 放在 CSS 选择器之后的花括号内，用于捕获元素的文本内容

### 运行时行为

CSS 选择器中，特性匹配的语法是这样的：`[foo=bar]`；而特性捕获的语法是这样的：`[foo=$bar]`。该捕获语法的含义：将特性 `foo` 的值放到结果的 `.bar` 字段中。内容捕获 `{$buzz}` 表示：将节点的文本内容放到结果的 `.buzz` 字段中。

### 例子

```html
<!-- 下面用到的 html 的内容 -->
<div class="red">text content</div>
```

```JavaScript
// 特性捕获
temme(html, 'div[class=$cls];')
//=> { cls: 'red' }

// 文本捕获
temme(html, 'div{$content};')
//=> { content: 'text content' }

// 两种捕获可以写在一起
temme(html, 'div[class=$cls]{$content};')
//=> { cls: 'red', content: 'text content' }
```

## 默认值捕获

`temme()` 的输出是一个对象, 叫做捕获结果。捕获结果在特定的字段中包含了捕获的元素。我们可以使用一个 `$` 符号来进行默认值捕获, 此时捕获结果将会为单个值。

### 语法

`[foo=$]` 或是 `{$}`，省略 xxx 以进行「默认值捕获」。

### 例子

```javascript
// 默认特性捕获
temme(html, 'div[class=$]')
//=> 'red'

// 默认文本捕获
temme(html, 'div{$content}')
//=> 'text content'
```
